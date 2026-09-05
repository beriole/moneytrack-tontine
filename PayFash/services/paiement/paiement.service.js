'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { db, Client, Portefeuille, Transaction, Paiement } = require('../../models');
const ENV = require('../../config/index');
const { FapshiService, ErreurFapshi } = require('./fapshi.service');

// =====================================================================
//  Paiements MoneyTrack — recharges et retraits reels.
//
//  Le risque de toute integration d'agregateur n'est pas l'appel HTTP :
//  c'est le DOUBLE CREDIT. Un webhook se rejoue, l'application relance
//  une verification, l'utilisateur rafraichit trois fois. Chacun de ces
//  chemins arrive ici, et un seul doit crediter.
//
//  La garantie repose sur trois choses :
//
//    1. le statut du Paiement, verrouille et relu dans la transaction ;
//    2. la reference unique portee par l'ecriture comptable — la base
//       refuse physiquement la seconde ;
//    3. le statut confirme AUPRES DE FAPSHI, jamais depuis le corps du
//       webhook, que Fapshi ne signe pas.
// =====================================================================

const arrondir = (v) => Math.round((Number(v) || 0) * 100) / 100;
const nombre = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

class ErreurPaiement extends Error {
    constructor(code, message) { super(message); this.code = code; this.name = 'ErreurPaiement'; }
}

class PaiementService {

    static _reference(prefixe) {
        return `${prefixe}-${crypto.randomBytes(9).toString('hex').toUpperCase()}`;
    }

    static async _portefeuille(clientId, portefeuilleId, t, verrouiller = false) {
        const options = { transaction: t };
        if (verrouiller && t) options.lock = t.LOCK.UPDATE;

        const base = { ClientPortefeuilleId: clientId, estActif: true };
        let pf = portefeuilleId
            ? await Portefeuille.findOne({ where: { ...base, id: portefeuilleId }, ...options })
            : await Portefeuille.findOne({ where: { ...base, typePortefeuille: 'courant' }, ...options })
              || await Portefeuille.findOne({ where: { ...base, estPrincipal: true }, ...options })
              || await Portefeuille.findOne({ where: base, ...options });

        if (!pf) throw new ErreurPaiement(404, "Aucun portefeuille actif pour recevoir ce paiement");
        if (pf.typePortefeuille === 'tontine') {
            throw new ErreurPaiement(409, "Une caisse de tontine ne se recharge pas directement");
        }
        return pf;
    }

    // -----------------------------------------------------------------
    //  Recharge
    // -----------------------------------------------------------------
    /**
     * Ouvre une recharge. Deux chemins possibles :
     *   - 'lien'   : Fapshi renvoie une page de paiement a ouvrir ;
     *   - 'direct' : Fapshi pousse la demande sur le telephone du client.
     *
     * Aucun solde ne bouge ici. L'argent n'arrive qu'une fois le statut
     * confirme par Fapshi.
     */
    static async initierRecharge(clientId, donnees = {}) {
        const { montant, portefeuilleId, telephone, medium, methode = 'lien', urlRetour } = donnees;
        const somme = Math.round(nombre(montant));
        if (!(somme >= ENV.PAIEMENT_MONTANT_MIN)) {
            throw new ErreurPaiement(400, `Le montant minimal est de ${ENV.PAIEMENT_MONTANT_MIN} FCFA`);
        }

        const client = await Client.findByPk(clientId);
        if (!client) throw new ErreurPaiement(404, 'Client introuvable');
        const portefeuille = await this._portefeuille(clientId, portefeuilleId, null);

        const reference = this._reference('RCH');
        const paiement = await Paiement.create({
            type: 'recharge',
            montant: somme,
            date: new Date(),
            status: 'PENDING',
            motif: donnees.motif || 'Recharge du portefeuille',
            reference,
            fournisseur: 'fapshi',
            sens: 'entrant',
            medium: medium || null,
            portefeuilleId: portefeuille.id,
            user_id: clientId
        });

        try {
            let r;
            if (methode === 'direct') {
                if (!telephone && !client.telephone) {
                    throw new ErreurPaiement(400, 'Numero de telephone requis pour un debit direct');
                }
                r = await FapshiService.debitDirect({
                    montant: somme,
                    telephone: telephone || client.telephone,
                    medium: medium || 'mobile money',
                    nom: client.nom,
                    email: client.email,
                    clientId,
                    reference,
                    message: `Recharge MoneyTrack — ${portefeuille.nom || portefeuille.typePortefeuille}`
                });
            } else {
                r = await FapshiService.initierCollecte({
                    montant: somme,
                    email: client.email,
                    clientId,
                    reference,
                    message: `Recharge MoneyTrack — ${portefeuille.nom || portefeuille.typePortefeuille}`,
                    urlRetour,
                    // Fapshi ne joindra ce webhook que si le serveur est
                    // publiquement accessible. Sinon l'application interroge
                    // /paiement/:reference/verifier — le resultat est le meme.
                    webhook: ENV.APP_URL ? `${ENV.APP_URL}/paiement/webhook` : undefined
                });
            }

            await paiement.update({
                providerTxId: r.transId,
                lienPaiement: r.lien || null,
                payToken: r.transId,
                donnees: r
            });

            return {
                reference,
                paiementId: paiement.id,
                lien: r.lien || null,
                methode,
                montant: somme,
                portefeuille: { id: portefeuille.id, nom: portefeuille.nom },
                message: r.lien
                    ? 'Ouvrez le lien pour finaliser le paiement.'
                    : 'Validez la demande sur votre telephone.'
            };
        } catch (e) {
            await paiement.update({
                status: 'FAILED',
                motif: `Ouverture refusee : ${e.message}`,
                donnees: e.corps || null
            });
            throw new ErreurPaiement(e.code === 400 ? 400 : 502, e.message);
        }
    }

    // -----------------------------------------------------------------
    //  Confirmation — le seul endroit ou un solde bouge
    // -----------------------------------------------------------------
    /**
     * Verifie un paiement AUPRES DE FAPSHI et, s'il a reussi, credite le
     * portefeuille. Appelable autant de fois qu'on veut : le webhook,
     * l'application qui interroge, un agent qui rejoue — un seul credit.
     */
    static async confirmer(reference) {
        const paiement = await Paiement.findOne({ where: { reference } });
        if (!paiement) throw new ErreurPaiement(404, 'Paiement introuvable');

        // Deja traite : on repond sans rappeler Fapshi ni rien toucher.
        if (paiement.status === 'SUCCESSFUL') {
            return { reference, statut: 'SUCCESSFUL', creedite: false, deja: true, montant: nombre(paiement.montant) };
        }
        if (['FAILED', 'EXPIRED'].includes(paiement.status)) {
            return { reference, statut: paiement.status, creedite: false, deja: true };
        }
        if (!paiement.providerTxId) throw new ErreurPaiement(409, "Ce paiement n'a jamais ete transmis au fournisseur");

        const etat = await FapshiService.statut(paiement.providerTxId);

        // Garde-fou : le montant confirme doit correspondre a la demande.
        // Un ecart signifie qu'on ne parle pas de la meme operation.
        if (etat.reussi && Math.round(etat.montant) !== Math.round(nombre(paiement.montant))) {
            await paiement.update({
                status: 'FAILED',
                motif: `Montant incoherent : ${etat.montant} confirme contre ${paiement.montant} attendu`,
                donnees: etat.brut
            });
            throw new ErreurPaiement(409, 'Montant confirme different du montant demande : credit refuse');
        }

        if (!etat.termine) {
            await paiement.update({ status: etat.statut, donnees: etat.brut });
            return { reference, statut: etat.statut, creedite: false, enAttente: true };
        }

        if (!etat.reussi) {
            await paiement.update({
                status: etat.statut, donnees: etat.brut, dateConfirmation: new Date(),
                motif: etat.statut === 'EXPIRED' ? 'Paiement expire' : 'Paiement refuse'
            });
            return { reference, statut: etat.statut, creedite: false };
        }

        return paiement.sens === 'sortant'
            ? this._finaliserRetrait(paiement, etat)
            : this._crediter(paiement, etat);
    }

    /** Credit effectif du portefeuille, en une transaction verrouillee. */
    static async _crediter(paiement, etat) {
        return db.transaction(async (t) => {
            // Relecture verrouillee : deux appels concurrents ne peuvent
            // pas passer tous les deux ce point.
            const frais = await Paiement.findByPk(paiement.id, { transaction: t, lock: t.LOCK.UPDATE });
            if (frais.status === 'SUCCESSFUL') {
                return { reference: frais.reference, statut: 'SUCCESSFUL', creedite: false, deja: true };
            }

            const portefeuille = await Portefeuille.findByPk(frais.portefeuilleId, {
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (!portefeuille) throw new ErreurPaiement(404, 'Portefeuille introuvable');

            const somme = arrondir(frais.montant);
            await portefeuille.update({ solde: arrondir(nombre(portefeuille.solde) + somme) }, { transaction: t });

            // La reference unique est la seconde barriere : meme si le
            // verrou etait contourne, la base refuserait ce doublon.
            const ecriture = await Transaction.create({
                montant: somme,
                date: new Date(),
                type: 'recharge',
                statut: 'Succès',
                description: `Recharge ${etat.medium || 'Mobile Money'} — ${frais.reference}`,
                frais: 0,
                ClientTransactionId: frais.user_id,
                reference: frais.reference
            }, { transaction: t });

            await frais.update({
                status: 'SUCCESSFUL',
                medium: etat.medium || frais.medium,
                dateConfirmation: new Date(),
                donnees: etat.brut
            }, { transaction: t });

            return {
                reference: frais.reference,
                statut: 'SUCCESSFUL',
                creedite: true,
                montant: somme,
                soldeApres: arrondir(portefeuille.solde),
                transactionId: ecriture.id
            };
        });
    }

    // -----------------------------------------------------------------
    //  Retrait
    // -----------------------------------------------------------------
    /**
     * Retrait vers Mobile Money. Le portefeuille est debite AVANT l'appel
     * au fournisseur : sinon deux retraits concurrents pourraient sortir
     * plus d'argent que le solde. Si Fapshi refuse, on rembourse.
     */
    static async initierRetrait(clientId, donnees = {}) {
        const { montant, portefeuilleId, telephone, medium } = donnees;
        const somme = Math.round(nombre(montant));
        if (!(somme >= ENV.PAIEMENT_MONTANT_MIN)) {
            throw new ErreurPaiement(400, `Le montant minimal est de ${ENV.PAIEMENT_MONTANT_MIN} FCFA`);
        }

        const client = await Client.findByPk(clientId);
        if (!client) throw new ErreurPaiement(404, 'Client introuvable');
        const numero = FapshiService.normaliserTelephone(telephone || client.telephone);
        if (numero.length < 9) throw new ErreurPaiement(400, 'Numero de telephone invalide');

        const reference = this._reference('RET');

        // 1. Reserver les fonds.
        const { paiement, portefeuille } = await db.transaction(async (t) => {
            const pf = await this._portefeuille(clientId, portefeuilleId, t, true);
            if (arrondir(pf.solde) < somme) {
                throw new ErreurPaiement(402, `Solde insuffisant : ${arrondir(pf.solde)} disponible`);
            }
            await pf.update({ solde: arrondir(nombre(pf.solde) - somme) }, { transaction: t });

            const p = await Paiement.create({
                type: 'retrait', montant: somme, date: new Date(), status: 'PENDING',
                motif: 'Retrait vers Mobile Money', reference, fournisseur: 'fapshi',
                sens: 'sortant', medium: medium || 'mobile money',
                portefeuilleId: pf.id, user_id: clientId
            }, { transaction: t });

            await Transaction.create({
                montant: somme, date: new Date(), type: 'retrait', statut: 'En confirmation',
                description: `Retrait vers ${numero} — ${reference}`, frais: 0,
                ClientTransactionId: clientId, reference
            }, { transaction: t });

            return { paiement: p, portefeuille: pf };
        });

        // 2. Demander le versement.
        try {
            const r = await FapshiService.verser({
                montant: somme, telephone: numero, medium: medium || 'mobile money',
                nom: client.nom, email: client.email, clientId, reference
            });
            await paiement.update({ providerTxId: r.transId, payToken: r.transId, donnees: r });

            return {
                reference, paiementId: paiement.id, montant: somme, telephone: numero,
                soldeApres: arrondir(portefeuille.solde),
                message: 'Retrait demande. Vous recevrez le montant sur votre telephone.'
            };
        } catch (e) {
            // Le fournisseur a refuse : on rend l'argent immediatement.
            await this._rembourser(paiement, `Retrait refuse : ${e.message}`);
            throw new ErreurPaiement(502, `${e.message} — votre solde a ete restitue.`);
        }
    }

    static async _rembourser(paiement, motif) {
        return db.transaction(async (t) => {
            const frais = await Paiement.findByPk(paiement.id, { transaction: t, lock: t.LOCK.UPDATE });
            if (frais.status === 'REFUNDED') return;

            const pf = await Portefeuille.findByPk(frais.portefeuilleId, { transaction: t, lock: t.LOCK.UPDATE });
            if (pf) {
                await pf.update({ solde: arrondir(nombre(pf.solde) + nombre(frais.montant)) }, { transaction: t });
            }
            await Transaction.update(
                { statut: 'Annulée', description: motif },
                { where: { reference: frais.reference }, transaction: t }
            );
            await frais.update({ status: 'REFUNDED', motif }, { transaction: t });
        });
    }

    static async _finaliserRetrait(paiement, etat) {
        await Transaction.update(
            { statut: 'Succès' },
            { where: { reference: paiement.reference } }
        );
        await paiement.update({
            status: 'SUCCESSFUL', dateConfirmation: new Date(), donnees: etat.brut
        });
        return { reference: paiement.reference, statut: 'SUCCESSFUL', montant: nombre(paiement.montant), retrait: true };
    }

    // -----------------------------------------------------------------
    //  Webhook et consultation
    // -----------------------------------------------------------------
    /**
     * Traite un rappel de Fapshi. Le corps recu sert UNIQUEMENT a savoir
     * de quelle transaction on parle : son contenu n'est jamais cru, le
     * statut est toujours redemande a l'API.
     */
    static async traiterWebhook(corps) {
        const transId = corps?.transId || corps?.transaction?.transId;
        const externalId = corps?.externalId || corps?.transaction?.externalId;
        if (!transId && !externalId) {
            throw new ErreurPaiement(400, 'Rappel inexploitable : ni transId ni externalId');
        }

        const paiement = externalId
            ? await Paiement.findOne({ where: { reference: externalId } })
            : await Paiement.findOne({ where: { providerTxId: transId } });

        if (!paiement) {
            // Un rappel pour une operation qu'on ne connait pas n'est pas
            // une erreur de notre cote : on l'accuse sans rien faire.
            return { connu: false, message: 'Paiement inconnu, rappel ignore' };
        }
        const r = await this.confirmer(paiement.reference);
        return { connu: true, ...r };
    }

    static async detail(clientId, reference) {
        const paiement = await Paiement.findOne({ where: { reference } });
        if (!paiement) throw new ErreurPaiement(404, 'Paiement introuvable');
        if (paiement.user_id !== clientId) throw new ErreurPaiement(403, "Ce paiement n'est pas le votre");
        return paiement;
    }

    static async mesPaiements(clientId, limite = 30) {
        return Paiement.findAll({
            where: { user_id: clientId, fournisseur: 'fapshi' },
            order: [['date', 'DESC']],
            limit: Math.min(100, limite)
        });
    }

    /**
     * Relance les paiements restes en attente. Un utilisateur qui ferme
     * l'application au mauvais moment ne doit pas perdre sa recharge.
     */
    static async reconcilier(maintenant = new Date(), fenetreHeures = 48) {
        const depuis = new Date(maintenant.getTime() - fenetreHeures * 3600 * 1000);
        const enAttente = await Paiement.findAll({
            where: {
                fournisseur: 'fapshi',
                status: { [Op.in]: ['PENDING', 'CREATED'] },
                providerTxId: { [Op.ne]: null },
                date: { [Op.gte]: depuis }
            },
            limit: 100
        });

        const rapport = { examines: enAttente.length, credites: 0, echoues: 0, toujoursEnAttente: 0, erreurs: [] };
        for (const p of enAttente) {
            try {
                const r = await this.confirmer(p.reference);
                if (r.creedite) rapport.credites++;
                else if (r.enAttente) rapport.toujoursEnAttente++;
                else if (['FAILED', 'EXPIRED'].includes(r.statut)) rapport.echoues++;
            } catch (e) {
                rapport.erreurs.push({ reference: p.reference, message: e.message });
            }
        }
        return rapport;
    }
}

module.exports = { PaiementService, ErreurPaiement };

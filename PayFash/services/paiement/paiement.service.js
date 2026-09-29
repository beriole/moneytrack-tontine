'use strict';

const crypto = require('crypto');
const { STATUTS, depuisFournisseur } = require('../statutTransaction');
const { Op } = require('sequelize');
const { db, Client, Portefeuille, Transaction, Paiement } = require('../../models');
const ENV = require('../../config/index');
const { FapshiService, ErreurFapshi } = require('./fapshi.service');
const Fonds = require('../fonds.service');

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

    /**
     * Un compte non verifie ne fait pas entrer ni sortir d'argent reel.
     *
     * La verification par code OTP existait — /auth/sendOtp, /auth/verifyOtp,
     * la colonne isVerified — mais rien ne la lisait jamais : ni la connexion,
     * ni les paiements. Elle etait purement decorative. Elle est opposee ici,
     * et seulement ici : bloquer la connexion mettrait dehors les comptes
     * existants, alors que le Mobile Money est precisement l'endroit ou
     * l'identite compte.
     */
    static _exigerCompteVerifie(client) {
        if (!client.isVerified) {
            throw new ErreurPaiement(403,
                "Verifiez votre adresse email avant d'operer un paiement : demandez un code depuis votre profil.");
        }
        if (client.isActive === false) {
            throw new ErreurPaiement(403, 'Ce compte est desactive');
        }
    }

    /**
     * Ce que le client doit sortir dans les 30 jours.
     *
     * Charge paresseusement le module tontine : le noyau des paiements ne
     * doit pas en dependre au chargement, et un deploiement sans tontine
     * doit continuer a retirer normalement. Toute erreur vaut « aucun
     * engagement connu » — on ne bloque pas un retrait sur une lecture
     * accessoire.
     */
    static async _engagements(clientId) {
        try {
            const SyntheseService = require('../tontine/synthese.service');
            return arrondir(await SyntheseService.engagementsSous(clientId, 30));
        } catch (e) {
            console.log('[paiement] engagements illisibles :', e.message);
            return 0;
        }
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
        this._exigerCompteVerifie(client);
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
        // Retrait dont l'issue est inconnue et sans identifiant fournisseur :
        // il n'y a rien a interroger. On le dit clairement au lieu de laisser
        // l'application sonder dans le vide.
        if (paiement.status === 'A_VERIFIER' && !paiement.providerTxId) {
            return {
                reference, statut: 'A_VERIFIER', creedite: false, aVerifier: true,
                montant: nombre(paiement.montant),
                message: "Retrait en cours de verification aupres de l'operateur. "
                    + "Le montant reste reserve ; ne relancez pas l'operation."
            };
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
            await this._alignerEcriture(paiement, etat.statut);
            return { reference, statut: etat.statut, creedite: false, enAttente: true };
        }

        if (!etat.reussi) {
            const motif = etat.statut === 'EXPIRED' ? 'Paiement expire' : 'Paiement refuse';
            await paiement.update({
                status: etat.statut, donnees: etat.brut, dateConfirmation: new Date(), motif
            });
            // Un versement sortant refuse APRES coup : les fonds avaient ete
            // debites a la demande. Sans ce retour, le client restait debite
            // d'un versement qui n'est jamais parti, et son ecriture restait
            // « en attente » pour toujours — seul un echec immediat, a
            // l'appel, declenchait la restitution.
            if (paiement.sens === 'sortant' && paiement.status !== 'REFUNDED') {
                await this._rembourser(paiement, `${motif} : fonds restitues`);
                return { reference, statut: etat.statut, creedite: false, rembourse: true };
            }
            await this._alignerEcriture(paiement, etat.statut);
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

            const brut = arrondir(frais.montant);
            // Commission de collecte. A 0 — le defaut — le comportement est
            // inchange : le montant nominal est credite et la plateforme
            // absorbe ce que prend l'agregateur. Au-dela, la retenue est
            // portee sur l'ecriture au lieu de disparaitre du compte marchand
            // sans contrepartie comptable.
            const taux = nombre(ENV.PAIEMENT_COMMISSION_RECHARGE);
            const commission = taux > 0 ? Math.floor(brut * taux) : 0;
            const somme = arrondir(brut - commission);

            await Fonds.entree(portefeuille, somme, t, {
                type: 'recharge', reference: `LEDGER-${frais.reference}`, clientId: frais.user_id,
                description: `Recharge ${etat.medium || 'Mobile Money'} — ${frais.reference}`
            });

            // La reference unique est la seconde barriere : meme si le
            // verrou etait contourne, la base refuserait ce doublon.
            const ecriture = await Transaction.create({
                montant: somme,
                date: new Date(),
                type: 'recharge',
                statut: STATUTS.SUCCESS,
                description: commission > 0
                    ? `Recharge ${etat.medium || 'Mobile Money'} — ${frais.reference} (${brut} moins ${commission} de frais)`
                    : `Recharge ${etat.medium || 'Mobile Money'} — ${frais.reference}`,
                frais: commission,
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
                montantPaye: brut,
                commission,
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
        this._exigerCompteVerifie(client);
        const numero = FapshiService.normaliserTelephone(telephone || client.telephone);
        if (numero.length < 9) throw new ErreurPaiement(400, 'Numero de telephone invalide');

        const reference = this._reference('RET');

        // Ce que le client doit sortir dans les 30 jours : cotisations de
        // tontine, amendes, echeances de credit. Le retrait ne doit pas y
        // toucher — sinon l'application encaisse une amende qu'elle a
        // elle-meme rendue inevitable.
        //
        // C'etait jusqu'ici un simple avertissement dans l'ecran mobile, que
        // l'API ignorait completement : un appel direct passait outre. La
        // regle est desormais tenue par le serveur, et le depassement doit
        // etre demande explicitement.
        const engage = donnees.accepterRisque === true
            ? 0
            : await this._engagements(clientId);

        // 1. Reserver les fonds.
        const { paiement, portefeuille } = await db.transaction(async (t) => {
            const pf = await this._portefeuille(clientId, portefeuilleId, t, true);
            // Le disponible, pas le solde : la part bloquee en garantie ne
            // part pas vers Mobile Money.
            const dispo = Fonds.disponible(pf);
            if (dispo < somme) {
                const bloque = Fonds.reserve(pf);
                throw new ErreurPaiement(402, bloque > 0
                    ? `Solde disponible insuffisant : ${dispo} FCFA disponibles, dont ${bloque} FCFA bloques en garantie exclus`
                    : `Solde insuffisant : ${dispo} disponible`);
            }
            const retirable = arrondir(Math.max(0, dispo - engage));
            if (engage > 0 && somme > retirable) {
                throw new ErreurPaiement(409,
                    `Vous pouvez retirer ${retirable} FCFA. ${engage} FCFA sont engages dans vos echeances `
                    + `des 30 prochains jours ; les retirer vous exposerait a une amende. `
                    + `Renvoyez la demande avec accepterRisque: true pour passer outre.`);
            }
            await Fonds.sortie(pf, somme, t, {
                type: 'retrait', reference: `LEDGER-${reference}`, clientId,
                description: `Retrait vers ${numero} — ${reference}`
            });

            const p = await Paiement.create({
                type: 'retrait', montant: somme, date: new Date(), status: 'PENDING',
                motif: 'Retrait vers Mobile Money', reference, fournisseur: 'fapshi',
                sens: 'sortant', medium: medium || 'mobile money',
                portefeuilleId: pf.id, user_id: clientId
            }, { transaction: t });

            await Transaction.create({
                montant: somme, date: new Date(), type: 'retrait', statut: STATUTS.PENDING,
                description: `Retrait vers ${numero} — ${reference}`, frais: 0,
                ClientTransactionId: clientId, reference
            }, { transaction: t });

            return { paiement: p, portefeuille: pf };
        });

        // 2. Demander le versement.
        //
        //    Le catch ne couvre QUE l'appel au fournisseur : une erreur de
        //    base survenue apres un versement reussi ne doit pas etre prise
        //    pour un refus.
        let r;
        try {
            r = await FapshiService.verser({
                montant: somme, telephone: numero, medium: medium || 'mobile money',
                nom: client.nom, email: client.email, clientId, reference
            });
        } catch (e) {
            // Refus CERTAIN (4xx, requete jamais partie) : rien n'a bouge
            // chez le fournisseur, on rend l'argent immediatement.
            if (e.definitif) {
                await this._rembourser(paiement, `Retrait refuse : ${e.message}`);
                throw new ErreurPaiement(502, `${e.message} — votre solde a ete restitue.`);
            }

            // Issue INCONNUE (delai depasse, coupure reseau, 5xx). Fapshi a
            // peut-etre execute le versement. Recrediter ici ferait sortir
            // l'argent deux fois : une fois vers le telephone, une fois sur
            // le solde. On garde donc les fonds reserves et on marque
            // l'operation a verifier — c'est le seul choix qui ne peut pas
            // faire perdre d'argent a la plateforme ni au client.
            await this._marquerAVerifier(paiement, e.message);
            return {
                reference, paiementId: paiement.id, montant: somme, telephone: numero,
                statut: 'A_VERIFIER',
                aVerifier: true,
                soldeApres: arrondir(portefeuille.solde),
                message: "Nous n'avons pas pu confirmer ce retrait aupres de l'operateur. "
                    + "Le montant reste reserve le temps de la verification : il vous sera "
                    + "restitue s'il n'a pas ete envoye. Ne relancez pas le retrait."
            };
        }

        await paiement.update({ providerTxId: r.transId, payToken: r.transId, donnees: r });

        return {
            reference, paiementId: paiement.id, montant: somme, telephone: numero,
            statut: 'PENDING',
            soldeApres: arrondir(portefeuille.solde),
            message: 'Retrait demande. Vous recevrez le montant sur votre telephone.'
        };
    }

    /**
     * Retrait dont on ignore le sort. Ni reussi, ni echoue : a verifier.
     *
     * Sans transId, aucune reconciliation automatique n'est possible — c'est
     * precisement pourquoi l'operation doit rester visible et bloquee plutot
     * que resolue au hasard. `paiementsAVerifier()` la remonte au back-office.
     */
    static async _marquerAVerifier(paiement, motif) {
        await paiement.update({
            status: 'A_VERIFIER',
            motif: `Issue inconnue, a verifier aupres de Fapshi : ${motif}`
        });
        // L'ecriture est prise en charge, son issue n'est pas connue : c'est
        // PROCESSING. Le « a verifier » reste porte par le paiement, avec
        // son motif — l'ecriture, elle, n'a que six etats possibles.
        await Transaction.update(
            { statut: STATUTS.PROCESSING },
            { where: { reference: paiement.reference, statut: { [Op.in]: [STATUTS.PENDING, STATUTS.PROCESSING] } } }
        );
    }

    /** Retraits dont l'issue n'a jamais pu etre etablie. A traiter a la main. */
    static async paiementsAVerifier(limite = 100) {
        return Paiement.findAll({
            where: { fournisseur: 'fapshi', status: 'A_VERIFIER' },
            order: [['date', 'ASC']],
            limit: Math.min(200, limite)
        });
    }

    /**
     * Aligne l'ecriture interne sur le statut du fournisseur (section 31) :
     * un paiement externe et son ecriture ne doivent jamais raconter deux
     * histoires differentes. Silencieuse si le passage n'a pas de sens.
     */
    static async _alignerEcriture(paiement, statutFournisseur, t = null) {
        const vise = depuisFournisseur(statutFournisseur);
        if (!vise) return null;
        const ecriture = await Transaction.findOne({
            where: { reference: paiement.reference }, ...(t ? { transaction: t } : {})
        });
        if (!ecriture || ecriture.statut === vise) return null;
        const { peutPasser, changer } = require('../statutTransaction');
        if (!peutPasser(ecriture.statut, vise)) {
            console.log(`[paiement] ecriture ${paiement.reference} : ${ecriture.statut} -> ${vise} refuse`);
            return null;
        }
        await changer(ecriture, vise, t ? { transaction: t } : {});
        return ecriture;
    }

    static async _rembourser(paiement, motif) {
        return db.transaction(async (t) => {
            const frais = await Paiement.findByPk(paiement.id, { transaction: t, lock: t.LOCK.UPDATE });
            if (frais.status === 'REFUNDED') return;

            const pf = await Portefeuille.findByPk(frais.portefeuilleId, { transaction: t, lock: t.LOCK.UPDATE });
            if (pf) {
                await Fonds.entree(pf, nombre(frais.montant), t, {
                    type: 'remboursement', reference: `LEDGER-REMB-${frais.reference}`, clientId: frais.user_id,
                    description: motif
                });
            }
            // Recharge remboursee avant d'avoir abouti : l'ecriture n'a
            // jamais rien deplace, elle est annulee, pas compensee.
            // Seules les ecritures encore en suspens sont annulees : une
            // ecriture deja confirmee se compense, elle ne s'efface pas.
            await Transaction.update(
                { statut: STATUTS.CANCELLED, description: motif },
                {
                    where: { reference: frais.reference, statut: { [Op.in]: [STATUTS.PENDING, STATUTS.PROCESSING] } },
                    transaction: t
                }
            );
            await frais.update({ status: 'REFUNDED', motif }, { transaction: t });
        });
    }

    static async _finaliserRetrait(paiement, etat) {
        await Transaction.update(
            { statut: STATUTS.SUCCESS },
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

        // Les retraits « a verifier » n'ont pas d'identifiant fournisseur : la
        // reconciliation ne peut rien pour eux. On les compte quand meme pour
        // qu'ils apparaissent dans le journal du planificateur plutot que de
        // dormir en base sans que personne ne le sache.
        const aVerifier = await Paiement.count({
            where: { fournisseur: 'fapshi', status: 'A_VERIFIER' }
        });

        const rapport = {
            examines: enAttente.length, credites: 0, echoues: 0,
            toujoursEnAttente: 0, aVerifierManuellement: aVerifier, erreurs: []
        };
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

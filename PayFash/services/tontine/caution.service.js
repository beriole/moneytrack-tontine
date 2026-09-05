'use strict';

const {
    db, Client,
    TontineGroupe, TontineMembre, TontineCaution, TontineCycle, TontineCotisation, TontineAmende
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, caisseGroupe, portefeuilleCaution,
    exigerRole, ecrireTransaction, transferer
} = require('./commun');

// =====================================================================
//  Caution — le depot bloque a l'entree du groupe.
//
//  Difference majeure avec NjanguiPay : ici l'argent bouge vraiment.
//  Le blocage debite le portefeuille du membre vers un sequestre, et la
//  liberation le RECREDITE. Dans le code source, releaseCaution changeait
//  le statut et laissait le commentaire « Optionally credit user's main
//  wallet here if needed » : le membre ne revoyait jamais son argent.
// =====================================================================

class CautionService {

    /** Montant attendu : un pourcentage de la cotisation periodique. */
    static montantAttendu(groupe) {
        return arrondir(nombre(groupe.montantParPeriode) * nombre(groupe.pourcentageCaution) / 100);
    }

    static disponible(caution) {
        return arrondir(nombre(caution.montantBloque) - nombre(caution.montantUtilise));
    }

    // -----------------------------------------------------------------
    //  Blocage
    // -----------------------------------------------------------------
    static async bloquer(clientId, groupeId, montant) {
        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            const membre = await TontineMembre.findOne({
                where: { groupeId, clientId }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");
            if (membre.statut === 'exclu') throw new ErreurTontine(403, 'Vous etes exclu de ce groupe');

            const aBloquer = montant !== undefined && montant !== null
                ? arrondir(montant)
                : this.montantAttendu(groupe);
            if (aBloquer <= 0) throw new ErreurTontine(400, 'Le montant de la caution doit etre positif');

            const portefeuille = await portefeuilleClient(clientId, t, true);
            const sequestre = await portefeuilleCaution(groupe, t, true);
            await transferer(portefeuille, sequestre, aBloquer, t);

            let caution = await TontineCaution.findOne({
                where: { groupeId, clientId }, transaction: t, lock: t.LOCK.UPDATE
            });

            const transaction = await ecrireTransaction({
                montant: aBloquer,
                type: 'caution_blocage',
                description: `Caution bloquee — ${groupe.nom}`,
                clientId,
                groupeId,
                reference: `TNT-CAU-B-${groupeId}-${clientId}-${caution ? nombre(caution.montantBloque) : 0}`
            }, t);

            if (caution) {
                await caution.update({
                    montantBloque: arrondir(nombre(caution.montantBloque) + aBloquer),
                    statut: 'bloquee',
                    transactionBlocageId: transaction.id,
                    dateLiberation: null
                }, { transaction: t });
            } else {
                caution = await TontineCaution.create({
                    groupeId, membreId: membre.id, clientId,
                    montantBloque: aBloquer,
                    montantUtilise: 0,
                    statut: 'bloquee',
                    transactionBlocageId: transaction.id,
                    dateBlocage: new Date()
                }, { transaction: t });
            }

            await membre.update({
                cautionPayee: true,
                montantCaution: caution.montantBloque
            }, { transaction: t });

            return { caution, transaction, soldeRestant: arrondir(portefeuille.solde) };
        });
    }

    // -----------------------------------------------------------------
    //  Saisie
    // -----------------------------------------------------------------
    /**
     * Saisit tout ou partie d'une caution pour couvrir une cotisation
     * impayee. L'argent va du sequestre vers la caisse du groupe : le pot
     * se complete, et le cycle peut se verser normalement.
     *
     * C'est le premier cran de la cascade de recours, apres l'amende.
     */
    static async saisirPourCotisation(acteur, cotisationId) {
        return db.transaction(async (t) => {
            const cotisation = await TontineCotisation.findByPk(cotisationId, {
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (!cotisation) throw new ErreurTontine(404, 'Cotisation introuvable');
            if (cotisation.statut === 'payee') throw new ErreurTontine(409, 'Cette cotisation est deja soldee');

            const cycle = await TontineCycle.findByPk(cotisation.cycleId, { transaction: t, lock: t.LOCK.UPDATE });
            const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t, lock: t.LOCK.UPDATE });

            if (!acteur.systeme) {
                await exigerRole(groupe.id, acteur.clientId, ['president', 'tresorier'], t,
                    'saisir une caution');
            }

            const caution = await TontineCaution.findOne({
                where: { groupeId: groupe.id, clientId: cotisation.clientId },
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (!caution) throw new ErreurTontine(409, "Ce membre n'a aucune caution bloquee");

            const dispo = this.disponible(caution);
            if (dispo <= 0) throw new ErreurTontine(409, 'La caution de ce membre est deja entierement consommee');

            const reste = arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye));
            const saisi = Math.min(dispo, reste);

            const sequestre = await portefeuilleCaution(groupe, t, true);
            const caisse = await caisseGroupe(groupe, t, true);
            await transferer(sequestre, caisse, saisi, t);

            const transaction = await ecrireTransaction({
                montant: saisi,
                type: 'caution_saisie',
                description: `Caution saisie pour la cotisation du cycle ${cycle.numeroCycle} — ${groupe.nom}`,
                clientId: cotisation.clientId,
                groupeId: groupe.id,
                cycleId: cycle.id,
                reference: `TNT-CAU-S-${cotisation.id}-${nombre(caution.montantUtilise)}`
            }, t);

            const utilise = arrondir(nombre(caution.montantUtilise) + saisi);
            await caution.update({
                montantUtilise: utilise,
                statut: utilise >= nombre(caution.montantBloque) ? 'totalement_utilisee' : 'partiellement_utilisee'
            }, { transaction: t });

            const paye = arrondir(nombre(cotisation.montantPaye) + saisi);
            const solde = paye >= nombre(cotisation.montantDu);
            await cotisation.update({
                montantPaye: paye,
                statut: solde ? 'payee' : 'partielle',
                datePaiement: solde ? new Date() : cotisation.datePaiement,
                transactionId: transaction.id
            }, { transaction: t });

            await cycle.update({
                montantCollecte: arrondir(nombre(cycle.montantCollecte) + saisi)
            }, { transaction: t });

            return {
                caution, cotisation, transaction,
                groupeSaisi: groupe,
                montantSaisi: saisi,
                cotisationSoldee: solde,
                resteAcouvrir: arrondir(nombre(cotisation.montantDu) - paye)
            };
        }).then(async (r) => {
            const NotificationService = require('./notification.service');
            await NotificationService.cautionSaisie(r.cotisation.clientId, r.groupeSaisi, r.montantSaisi);
            return r;
        });
    }

    // -----------------------------------------------------------------
    //  Liberation
    // -----------------------------------------------------------------
    /**
     * Rend au membre ce qui reste de sa caution. Autorise une fois que le
     * groupe est termine, ou quand le president libere explicitement un
     * membre sorti sans dette.
     */
    static async liberer(acteur, cautionId) {
        return db.transaction(async (t) => {
            const caution = await TontineCaution.findByPk(cautionId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!caution) throw new ErreurTontine(404, 'Caution introuvable');
            if (caution.statut === 'liberee') throw new ErreurTontine(409, 'Cette caution est deja liberee');

            const groupe = await TontineGroupe.findByPk(caution.groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!acteur.systeme) {
                await exigerRole(groupe.id, acteur.clientId, ['president'], t, 'liberer une caution');
            }

            // Une caution ne se libere pas au-dessus d'une dette en cours.
            const cycles = await TontineCycle.findAll({
                where: { groupeId: groupe.id }, attributes: ['id'], transaction: t
            });
            const cycleIds = cycles.map(c => c.id);

            const impayees = cycleIds.length ? await TontineCotisation.count({
                where: {
                    clientId: caution.clientId,
                    cycleId: cycleIds,
                    statut: ['attendue', 'partielle', 'en_retard', 'impayee']
                },
                transaction: t
            }) : 0;
            if (impayees > 0) {
                throw new ErreurTontine(409, `Ce membre a encore ${impayees} cotisation(s) non soldee(s) dans ce groupe`);
            }

            // Une amende impayee bloque aussi la restitution : la caution est
            // la garantie du groupe, elle ne repart pas avant les dettes.
            const amendesDues = await TontineAmende.count({
                where: { groupeId: groupe.id, clientId: caution.clientId, statut: 'due' }, transaction: t
            });
            if (amendesDues > 0) {
                throw new ErreurTontine(409, `Ce membre a encore ${amendesDues} amende(s) impayee(s) dans ce groupe`);
            }

            const aRendre = this.disponible(caution);
            let transaction = null;
            if (aRendre > 0) {
                const sequestre = await portefeuilleCaution(groupe, t, true);
                const portefeuille = await portefeuilleClient(caution.clientId, t, true);
                await transferer(sequestre, portefeuille, aRendre, t);

                transaction = await ecrireTransaction({
                    montant: aRendre,
                    type: 'caution_liberation',
                    description: `Caution restituee — ${groupe.nom}`,
                    clientId: caution.clientId,
                    groupeId: groupe.id,
                    reference: `TNT-CAU-L-${caution.id}`
                }, t);
            }

            await caution.update({
                statut: 'liberee',
                dateLiberation: new Date(),
                transactionLiberationId: transaction ? transaction.id : null
            }, { transaction: t });

            const membre = await TontineMembre.findOne({
                where: { groupeId: groupe.id, clientId: caution.clientId }, transaction: t
            });
            if (membre) await membre.update({ cautionPayee: false }, { transaction: t });

            return { caution, montantRestitue: aRendre, transaction };
        });
    }

    // -----------------------------------------------------------------
    //  Consultation
    // -----------------------------------------------------------------
    static async mesCautions(clientId) {
        const cautions = await TontineCaution.findAll({
            where: { clientId },
            include: [{ model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom', 'statut'] }],
            order: [['createdAt', 'DESC']]
        });
        return cautions.map(c => ({
            caution: c,
            disponible: this.disponible(c)
        }));
    }

    static async cautionsGroupe(clientId, groupeId) {
        await exigerRole(groupeId, clientId, ['president', 'tresorier', 'censeur'], null,
            'consulter les cautions du groupe');

        const cautions = await TontineCaution.findAll({
            where: { groupeId },
            include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }],
            order: [['id', 'ASC']]
        });

        const total = cautions.reduce((s, c) => s + this.disponible(c), 0);
        return {
            cautions: cautions.map(c => ({ caution: c, disponible: this.disponible(c) })),
            totalSequestre: arrondir(total)
        };
    }
}

module.exports = CautionService;

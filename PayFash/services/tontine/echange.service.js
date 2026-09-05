'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineCycle, TontineEchangeTour
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, exigerRole, ecrireTransaction, transferer
} = require('./commun');

// =====================================================================
//  Le marche des tours.
//
//  Porte depuis NjanguiPay (swap.service.js), dont la permutation etait
//  deja atomique, avec deux ajouts :
//
//   - montantCompensation : dans une vraie tontine le tour se vend.
//     Avancer son tour, c'est recevoir le pot plus tot ; celui qui recule
//     rend un service et se fait payer pour.
//   - les tours figes a la proposition sont RELUS a l'acceptation. Si
//     l'ordre a bouge entre-temps (exclusion, vote, autre echange), la
//     demande devient caduque au lieu d'appliquer une permutation fausse.
// =====================================================================

class EchangeService {

    static async proposer(clientId, groupeId, destinataireId, montantCompensation) {
        const cible = parseInt(destinataireId, 10);
        if (cible === clientId) throw new ErreurTontine(400, 'On n echange pas son tour avec soi-meme');

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
            if (groupe.statut !== 'actif') throw new ErreurTontine(409, "La tontine n'a pas demarre : il n'y a pas encore de tours");

            const demandeur = await TontineMembre.findOne({ where: { groupeId, clientId, statut: 'actif' }, transaction: t });
            const destinataire = await TontineMembre.findOne({ where: { groupeId, clientId: cible, statut: 'actif' }, transaction: t });
            if (!demandeur) throw new ErreurTontine(403, "Vous n'etes pas membre actif de ce groupe");
            if (!destinataire) throw new ErreurTontine(404, "Le destinataire n'est pas membre actif de ce groupe");

            if (!demandeur.ordreBeneficiaire || !destinataire.ordreBeneficiaire) {
                throw new ErreurTontine(409, 'Les tours ne sont pas encore attribues');
            }
            if (demandeur.aBeneficie || destinataire.aBeneficie) {
                throw new ErreurTontine(409, 'Un tour deja servi ne peut plus etre echange');
            }

            // Le tour en cours n'est plus negociable : des cotisations sont
            // deja tombees pour ce beneficiaire.
            const cycle = await TontineCycle.findOne({
                where: { groupeId, numeroCycle: groupe.numeroCycleActuel }, transaction: t
            });
            if (cycle && [demandeur.clientId, destinataire.clientId].includes(cycle.beneficiaireId)) {
                throw new ErreurTontine(409, 'Le tour du cycle en cours ne peut plus etre echange');
            }

            const enCours = await TontineEchangeTour.findOne({
                where: {
                    groupeId, statut: 'en_attente',
                    [Op.or]: [
                        { demandeurId: clientId, destinataireId: cible },
                        { demandeurId: cible, destinataireId: clientId }
                    ]
                }, transaction: t
            });
            if (enCours) throw new ErreurTontine(409, 'Une demande est deja en cours avec ce membre');

            const compensation = arrondir(montantCompensation || 0);
            if (compensation < 0) throw new ErreurTontine(400, 'La compensation ne peut pas etre negative');
            if (compensation > 0) {
                const pf = await portefeuilleClient(clientId, t);
                if (arrondir(pf.solde) < compensation) {
                    throw new ErreurTontine(402, `Solde insuffisant pour la compensation : ${arrondir(pf.solde)} disponible`);
                }
            }

            return TontineEchangeTour.create({
                groupeId,
                demandeurId: clientId,
                destinataireId: cible,
                tourDemandeur: demandeur.ordreBeneficiaire,
                tourDestinataire: destinataire.ordreBeneficiaire,
                montantCompensation: compensation,
                statut: 'en_attente',
                expireLe: new Date(Date.now() + 24 * 3600 * 1000)
            }, { transaction: t });
        });
    }

    static async accepter(clientId, echangeId) {
        return db.transaction(async (t) => {
            const echange = await TontineEchangeTour.findByPk(echangeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!echange) throw new ErreurTontine(404, 'Demande introuvable');
            if (echange.destinataireId !== clientId) throw new ErreurTontine(403, "Vous n'etes pas le destinataire de cette demande");
            if (echange.statut !== 'en_attente') throw new ErreurTontine(409, `Cette demande est au statut "${echange.statut}"`);
            if (new Date(echange.expireLe) < new Date()) {
                await echange.update({ statut: 'expire' }, { transaction: t });
                throw new ErreurTontine(409, 'Cette demande a expire');
            }

            const groupe = await TontineGroupe.findByPk(echange.groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            const demandeur = await TontineMembre.findOne({
                where: { groupeId: echange.groupeId, clientId: echange.demandeurId },
                transaction: t, lock: t.LOCK.UPDATE
            });
            const destinataire = await TontineMembre.findOne({
                where: { groupeId: echange.groupeId, clientId: echange.destinataireId },
                transaction: t, lock: t.LOCK.UPDATE
            });

            // L'ordre a-t-il bouge depuis la proposition ?
            if (!demandeur || !destinataire
                || demandeur.ordreBeneficiaire !== echange.tourDemandeur
                || destinataire.ordreBeneficiaire !== echange.tourDestinataire) {
                await echange.update({ statut: 'annule' }, { transaction: t });
                throw new ErreurTontine(409, "L'ordre de passage a change depuis la proposition : demande caduque");
            }
            if (demandeur.aBeneficie || destinataire.aBeneficie) {
                await echange.update({ statut: 'annule' }, { transaction: t });
                throw new ErreurTontine(409, 'Un des deux tours a deja ete servi : demande caduque');
            }

            // Permutation
            await demandeur.update({ ordreBeneficiaire: echange.tourDestinataire }, { transaction: t });
            await destinataire.update({ ordreBeneficiaire: echange.tourDemandeur }, { transaction: t });

            // Compensation : le demandeur paie celui qui lui cede sa place
            let transaction = null;
            const compensation = arrondir(echange.montantCompensation);
            if (compensation > 0) {
                const pfDemandeur = await portefeuilleClient(echange.demandeurId, t, true);
                const pfDestinataire = await portefeuilleClient(echange.destinataireId, t, true);
                await transferer(pfDemandeur, pfDestinataire, compensation, t);

                transaction = await ecrireTransaction({
                    montant: compensation,
                    type: 'echange_tour',
                    description: `Compensation pour l'echange des tours ${echange.tourDemandeur} et ${echange.tourDestinataire} — ${groupe.nom}`,
                    clientId: echange.destinataireId,
                    groupeId: groupe.id,
                    reference: `TNT-ECH-${echange.id}`
                }, t);
            }

            await echange.update({
                statut: 'accepte',
                transactionId: transaction ? transaction.id : null
            }, { transaction: t });

            // Les autres demandes en attente sur ces deux membres deviennent
            // caduques : leurs tours figes ne valent plus rien.
            await TontineEchangeTour.update({ statut: 'annule' }, {
                where: {
                    groupeId: groupe.id,
                    statut: 'en_attente',
                    id: { [Op.ne]: echange.id },
                    [Op.or]: [
                        { demandeurId: { [Op.in]: [echange.demandeurId, echange.destinataireId] } },
                        { destinataireId: { [Op.in]: [echange.demandeurId, echange.destinataireId] } }
                    ]
                },
                transaction: t
            });

            return {
                echange,
                transaction,
                nouveauTourDemandeur: echange.tourDestinataire,
                nouveauTourDestinataire: echange.tourDemandeur
            };
        });
    }

    static async refuser(clientId, echangeId) {
        const echange = await TontineEchangeTour.findByPk(echangeId);
        if (!echange) throw new ErreurTontine(404, 'Demande introuvable');
        if (echange.destinataireId !== clientId) throw new ErreurTontine(403, "Vous n'etes pas le destinataire de cette demande");
        if (echange.statut !== 'en_attente') throw new ErreurTontine(409, 'Cette demande est deja traitee');
        await echange.update({ statut: 'rejete' });
        return echange;
    }

    static async annuler(clientId, echangeId) {
        const echange = await TontineEchangeTour.findByPk(echangeId);
        if (!echange) throw new ErreurTontine(404, 'Demande introuvable');
        if (echange.demandeurId !== clientId) throw new ErreurTontine(403, "Vous n'etes pas l'auteur de cette demande");
        if (echange.statut !== 'en_attente') throw new ErreurTontine(409, 'Cette demande est deja traitee');
        await echange.update({ statut: 'annule' });
        return echange;
    }

    static async mesEchanges(clientId) {
        const echanges = await TontineEchangeTour.findAll({
            where: { [Op.or]: [{ demandeurId: clientId }, { destinataireId: clientId }] },
            include: [
                { model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom'] },
                { model: Client, as: 'demandeur', attributes: ['id', 'nom'] },
                { model: Client, as: 'destinataire', attributes: ['id', 'nom'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        return {
            echanges,
            aRepondre: echanges.filter(e => e.statut === 'en_attente' && e.destinataireId === clientId).length
        };
    }

    static async echangesGroupe(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        return TontineEchangeTour.findAll({
            where: { groupeId },
            include: [
                { model: Client, as: 'demandeur', attributes: ['id', 'nom'] },
                { model: Client, as: 'destinataire', attributes: ['id', 'nom'] }
            ],
            order: [['createdAt', 'DESC']]
        });
    }

    /** Cron : ferme les demandes non traitees a temps. */
    static async traiterEchangesEchus(maintenant = new Date()) {
        const [n] = await TontineEchangeTour.update({ statut: 'expire' }, {
            where: { statut: 'en_attente', expireLe: { [Op.lte]: maintenant } }
        });
        return { expirees: n };
    }
}

module.exports = EchangeService;

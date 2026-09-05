'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineCaution, TontineAmende
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, caisseGroupe,
    exigerRole, ecrireTransaction, transferer
} = require('./commun');
const CautionService = require('./caution.service');

// =====================================================================
//  La cascade de recours.
//
//    cotisation impayee a l'echeance
//       -> amende de retard (levee par le cron)
//       -> saisie de la caution
//       -> appel au garant
//       -> exclusion
//
//  Absente de NjanguiPay, qui s'arretait a un compteur d'avertissements.
//  Chaque cran est une action explicite du bureau : rien n'est saisi
//  automatiquement, parce que dans une tontine reelle c'est une decision,
//  pas un traitement de nuit.
// =====================================================================

class RecouvrementService {

    /**
     * Le membre designe son garant : un autre membre actif du groupe qui
     * accepte de couvrir ses defaillances.
     */
    static async designerGarant(clientId, groupeId, garantClientId) {
        return db.transaction(async (t) => {
            const membre = await TontineMembre.findOne({
                where: { groupeId, clientId }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");
            if (parseInt(garantClientId, 10) === clientId) {
                throw new ErreurTontine(400, 'On ne peut pas se porter garant de soi-meme');
            }

            const garant = await TontineMembre.findOne({
                where: { groupeId, clientId: parseInt(garantClientId, 10), statut: 'actif' }, transaction: t
            });
            if (!garant) throw new ErreurTontine(404, 'Le garant doit etre un membre actif du meme groupe');

            await membre.update({ garantId: garant.clientId }, { transaction: t });
            return membre;
        });
    }

    /**
     * Etat de la cascade pour une cotisation impayee : ce que le bureau
     * peut encore actionner, et pour combien.
     */
    static async etat(clientId, cotisationId) {
        const cotisation = await TontineCotisation.findByPk(cotisationId, {
            include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }]
        });
        if (!cotisation) throw new ErreurTontine(404, 'Cotisation introuvable');

        const cycle = await TontineCycle.findByPk(cotisation.cycleId);
        await exigerRole(cycle.groupeId, clientId, [], null);

        const membre = await TontineMembre.findByPk(cotisation.membreId, {
            include: [{ model: Client, as: 'garant', attributes: ['id', 'nom'] }]
        });
        const caution = await TontineCaution.findOne({
            where: { groupeId: cycle.groupeId, clientId: cotisation.clientId }
        });
        const amende = await TontineAmende.findOne({
            where: { cycleId: cycle.id, clientId: cotisation.clientId, motif: 'retard' }
        });

        const reste = arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye));
        const dispoCaution = caution ? CautionService.disponible(caution) : 0;

        return {
            cotisation,
            resteADevoir: reste,
            crans: {
                amendeLevee: !!amende,
                amendeStatut: amende ? amende.statut : null,
                cautionDisponible: dispoCaution,
                cautionCouvreTout: dispoCaution >= reste,
                garant: membre && membre.garant ? { id: membre.garant.id, nom: membre.garant.nom } : null,
                exclusionPossible: reste > 0 && dispoCaution <= 0
            }
        };
    }

    /**
     * Deuxieme cran : la caution. Delegue au service caution, qui deplace
     * l'argent du sequestre vers la caisse et solde la cotisation.
     */
    static async parCaution(acteur, cotisationId) {
        return CautionService.saisirPourCotisation(acteur, cotisationId);
    }

    /**
     * Troisieme cran : le garant paie a la place du defaillant.
     * La dette n'est pas effacee, elle change de debiteur : le garant
     * devient creancier du membre, ce que trace la description.
     */
    static async parGarant(acteur, cotisationId) {
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
                    'appeler le garant');
            }

            const membre = await TontineMembre.findByPk(cotisation.membreId, { transaction: t });
            if (!membre || !membre.garantId) {
                throw new ErreurTontine(409, "Ce membre n'a designe aucun garant");
            }

            const reste = arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye));
            const portefeuilleGarant = await portefeuilleClient(membre.garantId, t, true);
            const caisse = await caisseGroupe(groupe, t, true);
            await transferer(portefeuilleGarant, caisse, reste, t);

            const defaillant = await Client.findByPk(cotisation.clientId, { transaction: t });
            const transaction = await ecrireTransaction({
                montant: reste,
                type: 'appel_garant',
                description: `Appel au garant pour ${defaillant ? defaillant.nom : 'un membre'} — cycle ${cycle.numeroCycle} de ${groupe.nom}`,
                clientId: membre.garantId,
                groupeId: groupe.id,
                cycleId: cycle.id,
                reference: `TNT-GAR-${cotisation.id}`
            }, t);

            await cotisation.update({
                montantPaye: arrondir(nombre(cotisation.montantPaye) + reste),
                statut: 'payee',
                datePaiement: new Date(),
                transactionId: transaction.id
            }, { transaction: t });

            await cycle.update({
                montantCollecte: arrondir(nombre(cycle.montantCollecte) + reste)
            }, { transaction: t });

            return { cotisation, transaction, montantCouvert: reste, garantId: membre.garantId };
        });
    }

    /**
     * Dernier cran. Le membre sort de la rotation : les cycles suivants
     * ne lui reclament plus rien et ne lui donnent plus rien.
     *
     * Phase 4 ajoutera la voie normale — l'exclusion par vote du groupe.
     * Ici seul le president peut trancher.
     */
    static async exclure(acteur, groupeId, clientId, motif) {
        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            if (!acteur.systeme) {
                await exigerRole(groupeId, acteur.clientId, ['president'], t, 'exclure un membre');
            }
            return this.exclureDansTransaction(acteur, groupe, clientId, motif, t);
        });
    }

    /**
     * Corps de l'exclusion, reutilisable depuis une transaction ouverte.
     * Le depouillement d'un vote d'exclusion l'appelle directement : la
     * decision du groupe et son execution doivent etre atomiques.
     * L'autorisation est a la charge de l'appelant.
     */
    static async exclureDansTransaction(acteur, groupe, clientId, motif, t) {
        const groupeId = groupe.id;
        {
            if (parseInt(clientId, 10) === groupe.createurId) {
                throw new ErreurTontine(409, "Le createur du groupe ne peut pas etre exclu");
            }

            const membre = await TontineMembre.findOne({
                where: { groupeId, clientId: parseInt(clientId, 10) }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!membre) throw new ErreurTontine(404, "Ce client n'est pas membre du groupe");
            if (membre.statut === 'exclu') throw new ErreurTontine(409, 'Ce membre est deja exclu');

            await membre.update({
                statut: 'exclu',
                ordreBeneficiaire: null   // sort de la rotation
            }, { transaction: t });

            // Ses cotisations encore ouvertes sur des cycles non verses
            // deviennent definitivement impayees : le bureau devra completer
            // le pot par la caution, le garant, ou une decision de groupe.
            const cyclesOuverts = await TontineCycle.findAll({
                where: { groupeId, statut: { [Op.ne]: 'complete' } }, transaction: t
            });
            const ids = cyclesOuverts.map(c => c.id);
            let orphelines = 0;
            if (ids.length) {
                const [n] = await TontineCotisation.update({ statut: 'impayee' }, {
                    where: {
                        cycleId: { [Op.in]: ids },
                        clientId: membre.clientId,
                        statut: { [Op.ne]: 'payee' }
                    },
                    transaction: t
                });
                orphelines = n;
            }

            await TontineAmende.create({
                groupeId,
                membreId: membre.id,
                clientId: membre.clientId,
                motif: 'indiscipline',
                montant: 0,
                statut: 'annulee',
                infligeePar: acteur.systeme ? null : acteur.clientId,
                destination: groupe.destinationAmendes,
                commentaire: `EXCLUSION — ${motif || 'motif non precise'}`
            }, { transaction: t });

            const restants = await TontineMembre.count({
                where: { groupeId, statut: 'actif' }, transaction: t
            });
            await groupe.update({ membresActuels: restants }, { transaction: t });

            return { membre, cotisationsOrphelines: orphelines, membresRestants: restants };
        }
    }
}

module.exports = RecouvrementService;

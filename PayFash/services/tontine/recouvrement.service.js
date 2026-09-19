'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineCaution, TontineAmende
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir, exigerRole
} = require('./commun');
const { journaliser } = require('../audit.service');
const { exigerActe } = require('./permissions');
const CautionService = require('./caution.service');

// =====================================================================
//  La cascade de recours.
//
//    cotisation impayee a l'echeance
//       -> amende de retard (levee automatiquement par le planificateur)
//       -> saisie de la caution
//       -> exclusion
//
//  Absente de NjanguiPay, qui s'arretait a un compteur d'avertissements.
//  Le premier cran est tenu par la regle — le planificateur constate le
//  retard sans que personne ait a le denoncer. Les deux suivants restent
//  des actes explicites du bureau : dans une tontine reelle, saisir une
//  caution ou exclure quelqu'un est une decision, pas un traitement de nuit.
//
//  Le cran « appel au garant » a ete retire. Il faisait reposer la
//  defaillance d'un membre sur le portefeuille d'un autre, et transformait
//  une dette envers le groupe en dette entre deux personnes que
//  l'application n'avait aucun moyen de faire honorer. La caution, elle,
//  est de l'argent deja immobilise par le defaillant lui-meme.
// =====================================================================

class RecouvrementService {

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

        const membre = await TontineMembre.findByPk(cotisation.membreId);
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
                await exigerActe('exclureMembre', groupeId, acteur.clientId, t);
            }
            const r = await this.exclureDansTransaction(acteur, groupe, clientId, motif, t);
            return { ...r, groupeNotif: groupe, motifNotif: motif };
        }).then(async (r) => {
            try {
                const NotificationService = require('./notification.service');
                await NotificationService.membreExclu(r.membre.clientId, r.groupeNotif, r.motifNotif);
            } catch (e) {
                console.log("[tontine] notification d'exclusion non envoyee :", e.message);
            }
            return r;
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
            const membre = await TontineMembre.findOne({
                where: { groupeId, clientId: parseInt(clientId, 10) }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!membre) throw new ErreurTontine(404, "Ce client n'est pas membre du groupe");
            if (membre.statut === 'exclu') throw new ErreurTontine(409, 'Ce membre est deja exclu');

            // C'est le PRESIDENT EN EXERCICE qui est protege, non le
            // createur. La protection portait sur createurId : apres une
            // passation, elle couvrait un simple membre — l'ancien
            // president — et laissait le nouveau exclure-able, donc le
            // groupe exposé a se retrouver sans tete. Un president se
            // demet par passation, pas par exclusion.
            if (membre.role === 'president') {
                throw new ErreurTontine(409,
                    "Le president ne peut pas etre exclu : transmettez d'abord la presidence");
            }

            await membre.update({
                statut: 'exclu',
                ordreBeneficiaire: null   // sort de la rotation
            }, { transaction: t });

            // Ses cotisations encore ouvertes sur des cycles non verses
            // deviennent definitivement impayees : le bureau devra completer
            // le pot par la caution ou par une decision de groupe.
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

            // Le motif etait consigne dans une TontineAmende de 0 FCFA au
            // statut 'annulee' : une fausse amende, qui apparaissait ensuite
            // dans « mes amendes » et dans celles du groupe. Il vit maintenant
            // sur l'adhesion, la ou il decrit ce qu'il decrit.
            await membre.update({
                motifExclusion: motif || 'motif non precise',
                dateExclusion: new Date()
            }, { transaction: t });

            const restants = await TontineMembre.count({
                where: { groupeId, statut: 'actif' }, transaction: t
            });
            await groupe.update({ membresActuels: restants }, { transaction: t });

            await journaliser({
                acteur: acteur.systeme ? { systeme: true } : { clientId: acteur.clientId },
                action: 'TONTINE_MEMBRE_EXCLU',
                cible: `TontineMembre#${membre.id}`,
                details: {
                    groupeId,
                    clientExclu: membre.clientId,
                    motif: motif || null,
                    cotisationsOrphelines: orphelines,
                    membresRestants: restants
                },
                transaction: t
            });

            return { membre, cotisationsOrphelines: orphelines, membresRestants: restants };
        }
    }
}

module.exports = RecouvrementService;

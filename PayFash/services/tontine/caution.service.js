'use strict';

const {
    db, Client,
    TontineGroupe, TontineMembre, TontineCaution, TontineCycle, TontineCotisation, TontineAmende
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, caisseGroupe, portefeuilleCaution,
    exigerRole, exigerGroupeActif, exigerGroupeNonGele, ecrireTransaction, transferer
} = require('./commun');
const { journaliser } = require('../audit.service');
const { exigerActe } = require('./permissions');

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
            exigerGroupeActif(groupe, "le blocage d'une caution");

            // Le controle etait ecrit ici : appartenance, puis le seul statut
            // 'exclu'. Un membre suspendu ou sorti bloquait donc encore une
            // caution sur un groupe qu'il avait quitte. L'acte nomme porte la
            // regle complete, la meme que partout ailleurs.
            await exigerActe('bloquerCaution', groupeId, clientId, t);
            const membre = await TontineMembre.findOne({
                where: { groupeId, clientId }, transaction: t, lock: t.LOCK.UPDATE
            });

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
     * impayee — geste du bureau, possible avant l'echeance. Le calcul et
     * l'imputation sont ceux du moteur de defaut, source 'caution' seule.
     */
    static async saisirPourCotisation(acteur, cotisationId) {
        const DefautService = require('./defaut.service');
        const r = await DefautService.recouvrer(cotisationId, {
            acteur, sources: ['caution'], acte: 'saisirCaution', strict: true
        });
        return {
            cotisation: r.cotisation,
            montantSaisi: r.mobilise,
            cotisationSoldee: r.cotisationSoldee,
            resteAcouvrir: r.resteACouvrir
        };
    }

    /**
     * Preleve sur la caution du debiteur, au plus `besoin`, vers
     * `destination` — la caisse si le cycle n'est pas verse, le
     * beneficiaire lese s'il l'est. Tourne dans la transaction du moteur
     * de defaut, qui impute ensuite le montant sur la cotisation.
     *
     * `strict` : geste manuel, qui doit dire pourquoi il ne prend rien.
     */
    static async preleverDans(acteur, groupe, cotisation, cycle, besoin, destination, t, strict = false) {
        const caution = await TontineCaution.findOne({
            where: { groupeId: groupe.id, clientId: cotisation.clientId },
            transaction: t, lock: t.LOCK.UPDATE
        });
        if (!caution) {
            if (strict) throw new ErreurTontine(409, "Ce membre n'a aucune caution bloquee");
            return 0;
        }
        const dispo = this.disponible(caution);
        if (dispo <= 0) {
            if (strict) throw new ErreurTontine(409, 'La caution de ce membre est deja entierement consommee');
            return 0;
        }
        const saisi = Math.min(dispo, arrondir(besoin));
        if (saisi <= 0) return 0;

        const sequestre = await portefeuilleCaution(groupe, t, true);
        await transferer(sequestre, destination, saisi, t);

        await ecrireTransaction({
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

        // Mobiliser la garantie de quelqu'un se justifie : qui l'a
        // decide, pour quel impaye, et pour combien.
        await journaliser({
            acteur: acteur.systeme ? { systeme: true } : { clientId: acteur.clientId },
            action: 'TONTINE_CAUTION_SAISIE',
            cible: `TontineCaution#${caution.id}`,
            details: {
                groupeId: groupe.id,
                cycleId: cycle.id,
                cotisationId: cotisation.id,
                clientVise: cotisation.clientId,
                montantSaisi: saisi,
                disponibleAvant: dispo,
                versCaisse: destination.id === groupe.portefeuilleId
            },
            transaction: t
        });
        return saisi;
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
            // Un groupe termine libere au contraire ses cautions : seul le gel
            // administratif bloque la restitution.
            exigerGroupeNonGele(groupe, "la restitution d'une caution");
            if (!acteur.systeme) {
                await exigerActe('libererCaution', groupe.id, acteur.clientId, t);
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
        await exigerActe('consulterCautions', groupeId, clientId);

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

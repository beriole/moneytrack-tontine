'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineVote,
    TontineDemandeCredit, TontineRemboursementCredit
} = require('../../models');
const ENV = require('../../config/index');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, portefeuilleEpargne,
    exigerRole, ecrireTransaction, transferer
} = require('./commun');
const { EpargneService } = require('./epargne.service');
const EcheancierService = require('./echeancier.service');

// =====================================================================
//  Caisse 2 — le credit aux membres.
//
//  Interet simple, a la maniere des tontines camerounaises : un taux
//  mensuel applique au capital initial, et des echeances egales. Pas
//  d'amortissement degressif — personne en seance ne calcule un tableau
//  d'amortissement, et un bareme qu'on ne peut pas verifier de tete
//  n'est pas accepte par le groupe.
//
//    total du = montant x (1 + taux/100 x duree)
//
//  L'approbation passe par un vote (phase 4) : le pool appartient au
//  groupe, pas au president.
// =====================================================================

class CreditService {

    static calculer(montant, tauxMensuel, dureeMois) {
        const capital = arrondir(montant);
        const interets = arrondir(capital * (nombre(tauxMensuel) / 100) * dureeMois);
        return { capital, interets, total: arrondir(capital + interets) };
    }

    // -----------------------------------------------------------------
    //  Demande
    // -----------------------------------------------------------------
    static async demander(clientId, groupeId, donnees) {
        const { montant, dureeMois, motif, tauxInteret } = donnees;
        const duree = parseInt(dureeMois, 10);
        if (!(nombre(montant) > 0)) throw new ErreurTontine(400, 'Le montant doit etre strictement positif');
        if (!(duree >= 1 && duree <= 36)) throw new ErreurTontine(400, 'La duree doit etre comprise entre 1 et 36 mois');

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            const membre = await exigerRole(groupeId, clientId, [], t);
            if (membre.statut !== 'actif') throw new ErreurTontine(403, 'Seul un membre actif peut emprunter');

            const pool = await EpargneService.pool(groupeId, t, true);

            const enCours = await TontineDemandeCredit.findOne({
                where: { poolId: pool.id, clientId, statut: { [Op.in]: ['en_attente', 'approuvee', 'decaissee'] } },
                transaction: t
            });
            if (enCours) {
                throw new ErreurTontine(409, `Vous avez deja un credit en cours (statut "${enCours.statut}")`);
            }

            if (arrondir(montant) > arrondir(pool.capitalDisponible)) {
                throw new ErreurTontine(409,
                    `La caisse ne dispose que de ${arrondir(pool.capitalDisponible)} FCFA`);
            }

            const taux = tauxInteret !== undefined && tauxInteret !== null
                ? nombre(tauxInteret) : nombre(pool.tauxInteretDefaut);
            const calcul = this.calculer(montant, taux, duree);

            const demande = await TontineDemandeCredit.create({
                poolId: pool.id,
                membreId: membre.id,
                clientId,
                montant: calcul.capital,
                tauxInteret: taux,
                dureeMois: duree,
                totalARembourser: calcul.total,
                motif: motif || null,
                statut: 'en_attente'
            }, { transaction: t });

            // Le groupe decide, pas le bureau : un scrutin est ouvert d'office.
            const vote = await TontineVote.create({
                groupeId,
                sujet: 'approuver_credit',
                cibleId: demande.id,
                description: `Credit de ${calcul.capital} FCFA sur ${duree} mois a ${taux} %/mois — ${motif || 'sans motif precise'}`,
                payload: { demandeId: demande.id },
                mode: 'majorite',
                dateLimite: new Date(Date.now() + 72 * 3600 * 1000),
                resultat: 'en_attente',
                creePar: clientId
            }, { transaction: t });

            await demande.update({ voteId: vote.id }, { transaction: t });
            return { demande, vote, calcul };
        });
    }

    /**
     * Marque une demande approuvee. Appele par le depouillement du vote
     * (transaction fournie) ; refuse sinon, pour que personne ne
     * court-circuite le scrutin.
     */
    static async marquerApprouvee(demandeId, t) {
        const demande = await TontineDemandeCredit.findByPk(demandeId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!demande) return null;
        if (demande.statut !== 'en_attente') return demande;
        await demande.update({ statut: 'approuvee', dateApprobation: new Date() }, { transaction: t });
        return demande;
    }

    static async rejeter(demandeId, t) {
        const demande = await TontineDemandeCredit.findByPk(demandeId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!demande || demande.statut !== 'en_attente') return demande;
        await demande.update({ statut: 'rejetee' }, { transaction: t });
        return demande;
    }

    // -----------------------------------------------------------------
    //  Decaissement
    // -----------------------------------------------------------------
    static async decaisser(acteur, demandeId) {
        return db.transaction(async (t) => {
            const demande = await TontineDemandeCredit.findByPk(demandeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!demande) throw new ErreurTontine(404, 'Demande introuvable');
            if (demande.statut === 'decaissee') throw new ErreurTontine(409, 'Ce credit est deja decaisse');
            if (demande.statut !== 'approuvee') {
                throw new ErreurTontine(409, `Ce credit n'est pas approuve (statut "${demande.statut}")`);
            }

            const pool = await require('../../models').TontinePoolCredit.findByPk(demande.poolId, {
                transaction: t, lock: t.LOCK.UPDATE
            });
            const groupe = await TontineGroupe.findByPk(pool.groupeId, { transaction: t, lock: t.LOCK.UPDATE });

            if (!acteur.systeme) {
                await exigerRole(groupe.id, acteur.clientId, ['president', 'tresorier'], t,
                    'decaisser un credit');
            }

            await EpargneService.engagerCapital(pool, demande.montant, t);

            const caisse = await portefeuilleEpargne(groupe, t, true);
            const portefeuille = await portefeuilleClient(demande.clientId, t, true);
            await transferer(caisse, portefeuille, arrondir(demande.montant), t);

            const transaction = await ecrireTransaction({
                montant: arrondir(demande.montant),
                type: 'credit_decaissement',
                description: `Credit decaisse — ${groupe.nom}`,
                clientId: demande.clientId,
                groupeId: groupe.id,
                reference: `TNT-CRD-D-${demande.id}`
            }, t);

            // Echeancier : interet simple, echeances egales, reliquat sur la
            // derniere ligne pour que la somme tombe juste au franc pres.
            const n = demande.dureeMois;
            const capital = arrondir(demande.montant);
            const interets = arrondir(nombre(demande.totalARembourser) - capital);
            const capitalParEcheance = Math.floor(capital / n);
            const interetParEcheance = Math.floor(interets / n);

            const dates = EcheancierService.genererDates(new Date(), 'mensuelle', n + 1).slice(1);
            const lignes = [];
            for (let i = 1; i <= n; i++) {
                const dernier = i === n;
                const pc = dernier ? arrondir(capital - capitalParEcheance * (n - 1)) : capitalParEcheance;
                const pi = dernier ? arrondir(interets - interetParEcheance * (n - 1)) : interetParEcheance;
                lignes.push({
                    demandeId: demande.id,
                    numeroEcheance: i,
                    montantDu: arrondir(pc + pi),
                    montantPaye: 0,
                    partCapital: pc,
                    partInteret: pi,
                    dateEcheance: dates[i - 1],
                    statut: 'attendu'
                });
            }
            await TontineRemboursementCredit.bulkCreate(lignes, { transaction: t });

            await demande.update({
                statut: 'decaissee',
                dateDecaissement: new Date(),
                dateEcheance: dates[n - 1],
                transactionDecaissementId: transaction.id
            }, { transaction: t });

            return {
                demande, transaction,
                echeances: lignes.length,
                mensualite: lignes[0].montantDu,
                totalARembourser: arrondir(demande.totalARembourser)
            };
        });
    }

    // -----------------------------------------------------------------
    //  Remboursement
    // -----------------------------------------------------------------
    static async rembourser(clientId, remboursementId, montant) {
        return db.transaction(async (t) => {
            const echeance = await TontineRemboursementCredit.findByPk(remboursementId, {
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (!echeance) throw new ErreurTontine(404, 'Echeance introuvable');
            if (echeance.statut === 'paye') throw new ErreurTontine(409, 'Cette echeance est deja reglee');

            const demande = await TontineDemandeCredit.findByPk(echeance.demandeId, {
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (demande.clientId !== clientId) throw new ErreurTontine(403, "Ce credit n'est pas le votre");

            const pool = await require('../../models').TontinePoolCredit.findByPk(demande.poolId, {
                transaction: t, lock: t.LOCK.UPDATE
            });
            const groupe = await TontineGroupe.findByPk(pool.groupeId, { transaction: t, lock: t.LOCK.UPDATE });

            const dejaPaye = nombre(echeance.montantPaye);
            const reste = arrondir(nombre(echeance.montantDu) - dejaPaye);
            const aVerser = montant !== undefined && montant !== null
                ? Math.min(arrondir(montant), reste) : reste;
            if (aVerser <= 0) throw new ErreurTontine(400, 'Le montant doit etre strictement positif');

            const portefeuille = await portefeuilleClient(clientId, t, true);
            const caisse = await portefeuilleEpargne(groupe, t, true);
            await transferer(portefeuille, caisse, aVerser, t);

            const transaction = await ecrireTransaction({
                montant: aVerser,
                type: 'credit_remboursement',
                description: `Remboursement echeance ${echeance.numeroEcheance}/${demande.dureeMois} — ${groupe.nom}`,
                clientId,
                groupeId: groupe.id,
                reference: `TNT-CRD-R-${echeance.id}-${dejaPaye}`
            }, t);

            // On impute d'abord l'interet, puis le capital : le pool doit
            // savoir a tout moment ce qui est encore dehors.
            const totalApres = arrondir(dejaPaye + aVerser);
            const interetDu = nombre(echeance.partInteret);
            const interetDejaPaye = Math.min(dejaPaye, interetDu);
            const partInteret = arrondir(Math.min(totalApres, interetDu) - interetDejaPaye);
            const partCapital = arrondir(aVerser - partInteret);
            await EpargneService.encaisserRemboursement(pool, partCapital, partInteret, t);

            const solde = totalApres >= nombre(echeance.montantDu);
            await echeance.update({
                montantPaye: totalApres,
                statut: solde ? 'paye' : 'attendu',
                datePaiement: solde ? new Date() : echeance.datePaiement,
                transactionId: transaction.id
            }, { transaction: t });

            const restantes = await TontineRemboursementCredit.count({
                where: { demandeId: demande.id, statut: { [Op.ne]: 'paye' } }, transaction: t
            });
            if (restantes === 0) {
                await demande.update({ statut: 'remboursee' }, { transaction: t });
            }

            return {
                echeance, transaction, partCapital, partInteret,
                echeancesRestantes: restantes,
                creditSolde: restantes === 0,
                soldeRestant: arrondir(portefeuille.solde)
            };
        });
    }

    // -----------------------------------------------------------------
    //  Consultation
    // -----------------------------------------------------------------
    static async echeancier(clientId, demandeId) {
        const demande = await TontineDemandeCredit.findByPk(demandeId, {
            include: [{ model: TontineRemboursementCredit, as: 'echeances' }],
            order: [[{ model: TontineRemboursementCredit, as: 'echeances' }, 'numeroEcheance', 'ASC']]
        });
        if (!demande) throw new ErreurTontine(404, 'Demande introuvable');

        const pool = await require('../../models').TontinePoolCredit.findByPk(demande.poolId);
        await exigerRole(pool.groupeId, clientId, [], null);

        const paye = arrondir(demande.echeances.reduce((s, e) => s + nombre(e.montantPaye), 0));
        return {
            demande,
            totalARembourser: arrondir(demande.totalARembourser),
            dejaRembourse: paye,
            resteADevoir: arrondir(nombre(demande.totalARembourser) - paye),
            echeances: demande.echeances
        };
    }

    static async mesDemandes(clientId) {
        const demandes = await TontineDemandeCredit.findAll({
            where: { clientId },
            include: [{ model: TontineRemboursementCredit, as: 'echeances' }],
            order: [['createdAt', 'DESC']]
        });
        return { demandes };
    }

    static async demandesGroupe(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        const pool = await EpargneService.pool(groupeId, null);
        return {
            demandes: await TontineDemandeCredit.findAll({
                where: { poolId: pool.id },
                include: [{ model: Client, as: 'emprunteur', attributes: ['id', 'nom'] }],
                order: [['createdAt', 'DESC']]
            })
        };
    }

    /** Cron : constate les echeances de credit depassees. */
    static async traiterEcheancesCredit(maintenant = new Date()) {
        const enRetard = await TontineRemboursementCredit.findAll({
            where: { statut: 'attendu', dateEcheance: { [Op.lte]: maintenant } }
        });
        const demandes = new Set();
        for (const e of enRetard) {
            await e.update({ statut: 'en_retard' });
            demandes.add(e.demandeId);
        }
        for (const id of demandes) {
            const impayees = await TontineRemboursementCredit.count({
                where: { demandeId: id, statut: 'en_retard' }
            });
            // Trois echeances de retard : le credit bascule en defaut et le
            // bureau peut actionner la caution ou le garant.
            if (impayees >= 3) {
                await TontineDemandeCredit.update({ statut: 'en_defaut' }, { where: { id, statut: 'decaissee' } });
            }
        }
        return { echeancesEnRetard: enRetard.length, creditsConcernes: demandes.size };
    }
}

module.exports = CreditService;

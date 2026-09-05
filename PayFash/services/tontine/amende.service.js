'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineAmende, TontineCycle, TontineCotisation, TontinePoolCredit
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, caisseGroupe, portefeuilleEpargne,
    exigerRole, ecrireTransaction, transferer
} = require('./commun');

// =====================================================================
//  Caisse 4 — les amendes.
//
//  Entierement neuve : NjanguiPay n'avait qu'un compteur warningCount,
//  sans consequence financiere. Ici une amende est une DETTE : tant
//  qu'elle n'est pas reglee, le membre ne peut plus cotiser.
//
//  Sa destination suit la decision D7, figee au moment de l'infliction :
//    'epargne'   -> caisse 2, redistribuee a tous lors de la casse ;
//    'pot_cycle' -> le pot du cycle, qui indemnise le beneficiaire lese.
//  Jamais la plateforme : elle gagnerait de l'argent sur les retards.
// =====================================================================

const MOTIFS = ['retard', 'absence', 'indiscipline', 'autre'];
const BAREME_DEFAUT = { retard: 1000, absence: 2000, indiscipline: 5000, autre: 1000 };

class AmendeService {

    static bareme(groupe) {
        const perso = groupe.bareme && typeof groupe.bareme === 'object' ? groupe.bareme : {};
        return { ...BAREME_DEFAUT, ...perso };
    }

    static montantBareme(groupe, motif) {
        return arrondir(nombre(this.bareme(groupe)[motif] || BAREME_DEFAUT.autre));
    }

    /**
     * Destination effective. Un groupe purement rotatif n'a pas de caisse
     * d'epargne : l'amende retombe alors sur le pot du cycle.
     */
    static destination(groupe) {
        if (groupe.destinationAmendes === 'epargne' && groupe.type === 'rotative') return 'pot_cycle';
        return groupe.destinationAmendes;
    }

    // -----------------------------------------------------------------
    //  Infliction
    // -----------------------------------------------------------------
    static async infliger(acteur, groupeId, donnees) {
        const { clientId, motif, montant, cycleId, commentaire } = donnees;
        if (!MOTIFS.includes(motif)) throw new ErreurTontine(400, `Motif invalide (attendu : ${MOTIFS.join(', ')})`);
        if (!clientId) throw new ErreurTontine(400, 'Le membre sanctionne est obligatoire');

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            if (!acteur.systeme) {
                await exigerRole(groupeId, acteur.clientId, ['censeur', 'president'], t,
                    'infliger une amende');
            }

            const membre = await TontineMembre.findOne({
                where: { groupeId, clientId: parseInt(clientId, 10) }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!membre) throw new ErreurTontine(404, "Ce client n'est pas membre du groupe");
            if (membre.statut === 'exclu') throw new ErreurTontine(409, 'Ce membre est deja exclu');

            const amende = await TontineAmende.create({
                groupeId,
                membreId: membre.id,
                clientId: membre.clientId,
                cycleId: cycleId || null,
                motif,
                montant: montant !== undefined && montant !== null
                    ? arrondir(montant) : this.montantBareme(groupe, motif),
                statut: 'due',
                infligeePar: acteur.systeme ? null : acteur.clientId,
                destination: this.destination(groupe),
                commentaire: commentaire || null
            }, { transaction: t });

            await membre.update({
                nbAvertissements: membre.nbAvertissements + 1
            }, { transaction: t });

            return { amende, groupe };
        }).then(async ({ amende, groupe }) => {
            const NotificationService = require('./notification.service');
            await NotificationService.amendeInfligee(amende, groupe);
            return amende;
        });
    }

    /**
     * Amendes de retard levees par le cron a l'echeance d'un cycle.
     * Idempotent : une seule amende de retard par membre et par cycle.
     */
    static async leverPourRetard(cycle, groupe, cotisationsImpayees, t) {
        let levees = 0;
        for (const cotisation of cotisationsImpayees) {
            const deja = await TontineAmende.findOne({
                where: { groupeId: groupe.id, clientId: cotisation.clientId, cycleId: cycle.id, motif: 'retard' },
                transaction: t
            });
            if (deja) continue;

            await TontineAmende.create({
                groupeId: groupe.id,
                membreId: cotisation.membreId,
                clientId: cotisation.clientId,
                cycleId: cycle.id,
                motif: 'retard',
                montant: this.montantBareme(groupe, 'retard'),
                statut: 'due',
                infligeePar: null,   // levee par le systeme, pas par le censeur
                destination: this.destination(groupe),
                commentaire: `Cotisation du cycle ${cycle.numeroCycle} non soldee a l'echeance`
            }, { transaction: t });

            await TontineMembre.increment('nbAvertissements', {
                by: 1, where: { id: cotisation.membreId }, transaction: t
            });
            levees++;
        }
        return levees;
    }

    // -----------------------------------------------------------------
    //  Reglement
    // -----------------------------------------------------------------
    static async payer(clientId, amendeId) {
        return db.transaction(async (t) => {
            const amende = await TontineAmende.findByPk(amendeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!amende) throw new ErreurTontine(404, 'Amende introuvable');
            if (amende.clientId !== clientId) throw new ErreurTontine(403, "Cette amende n'est pas la votre");
            if (amende.statut === 'payee') throw new ErreurTontine(409, 'Cette amende est deja reglee');
            if (amende.statut === 'annulee') throw new ErreurTontine(409, 'Cette amende a ete annulee');

            const groupe = await TontineGroupe.findByPk(amende.groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            const montant = arrondir(amende.montant);
            const portefeuille = await portefeuilleClient(clientId, t, true);

            let destinataire, libelle;
            if (amende.destination === 'pot_cycle') {
                destinataire = await caisseGroupe(groupe, t, true);
                libelle = 'pot du cycle';
            } else {
                destinataire = await portefeuilleEpargne(groupe, t, true);
                libelle = "caisse d'epargne";
            }
            await transferer(portefeuille, destinataire, montant, t);

            const transaction = await ecrireTransaction({
                montant,
                type: 'amende',
                description: `Amende (${amende.motif}) reglee vers la ${libelle} — ${groupe.nom}`,
                clientId,
                groupeId: groupe.id,
                cycleId: amende.cycleId,
                reference: `TNT-AMD-${amende.id}`
            }, t);

            // Le pot grossit : le beneficiaire lese par le retard est indemnise.
            if (amende.destination === 'pot_cycle' && amende.cycleId) {
                const cycle = await TontineCycle.findByPk(amende.cycleId, { transaction: t, lock: t.LOCK.UPDATE });
                if (cycle && cycle.statut !== 'complete') {
                    await cycle.update({
                        montantCollecte: arrondir(nombre(cycle.montantCollecte) + montant)
                    }, { transaction: t });
                }
            }

            // Caisse 2 : l'amende est tracee a part des apports et des interets,
            // pour que la casse annuelle reste justifiable ligne a ligne.
            if (amende.destination === 'epargne') {
                const pool = await TontinePoolCredit.findOne({
                    where: { groupeId: groupe.id }, transaction: t, lock: t.LOCK.UPDATE
                });
                if (pool) {
                    await pool.update({
                        amendesCumulees: arrondir(nombre(pool.amendesCumulees) + montant),
                        capitalTotal: arrondir(nombre(pool.capitalTotal) + montant),
                        capitalDisponible: arrondir(nombre(pool.capitalDisponible) + montant),
                        derniereMaj: new Date()
                    }, { transaction: t });
                }
            }

            await amende.update({
                statut: 'payee',
                datePaiement: new Date(),
                transactionId: transaction.id
            }, { transaction: t });

            return { amende, transaction, soldeRestant: arrondir(portefeuille.solde) };
        });
    }

    static async annuler(acteur, amendeId, commentaire) {
        return db.transaction(async (t) => {
            const amende = await TontineAmende.findByPk(amendeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!amende) throw new ErreurTontine(404, 'Amende introuvable');
            if (amende.statut === 'payee') throw new ErreurTontine(409, 'Une amende reglee ne peut pas etre annulee');
            if (amende.statut === 'annulee') throw new ErreurTontine(409, 'Cette amende est deja annulee');

            await exigerRole(amende.groupeId, acteur.clientId, ['censeur', 'president'], t,
                'annuler une amende');

            await amende.update({
                statut: 'annulee',
                commentaire: commentaire || amende.commentaire
            }, { transaction: t });
            return amende;
        });
    }

    // -----------------------------------------------------------------
    //  Consultation et regle de blocage
    // -----------------------------------------------------------------
    static async mesAmendes(clientId, groupeId) {
        const where = { clientId };
        if (groupeId) where.groupeId = groupeId;

        const amendes = await TontineAmende.findAll({
            where,
            include: [
                { model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom'] },
                { model: Client, as: 'censeur', attributes: ['id', 'nom'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        const dues = amendes.filter(a => a.statut === 'due');
        return {
            amendes,
            totalDu: arrondir(dues.reduce((s, a) => s + nombre(a.montant), 0)),
            nombreDues: dues.length
        };
    }

    static async amendesGroupe(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        const amendes = await TontineAmende.findAll({
            where: { groupeId },
            include: [
                { model: Client, as: 'client', attributes: ['id', 'nom'] },
                { model: Client, as: 'censeur', attributes: ['id', 'nom'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        return {
            amendes,
            totalDu: arrondir(amendes.filter(a => a.statut === 'due')
                .reduce((s, a) => s + nombre(a.montant), 0))
        };
    }

    /**
     * Une amende impayee bloque la cotisation suivante. C'est la regle du
     * reglement interieur : on solde ses dettes avant de remettre au pot.
     */
    static async exigerAucuneAmendeDue(clientId, groupeId, t) {
        const dues = await TontineAmende.findAll({
            where: { clientId, groupeId, statut: 'due' }, transaction: t
        });
        if (!dues.length) return;

        const total = arrondir(dues.reduce((s, a) => s + nombre(a.montant), 0));
        throw new ErreurTontine(409,
            `Reglez d'abord vos ${dues.length} amende(s) en cours (${total} FCFA) avant de cotiser`);
    }
}

module.exports = { AmendeService, MOTIFS, BAREME_DEFAUT };

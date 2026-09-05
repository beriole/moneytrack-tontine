'use strict';

const { Op } = require('sequelize');
const {
    db, Client, Portefeuille,
    TontineGroupe, TontineMembre, TontinePartage, TontineDemandeCredit
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, portefeuilleEpargne,
    exigerRole, ecrireTransaction, transferer
} = require('./commun');
const { EpargneService } = require('./epargne.service');

// =====================================================================
//  La casse annuelle.
//
//  Cloture d'exercice de la caisse 2, en decembre le plus souvent. Chacun
//  reprend ses apports, et le produit de l'annee — interets des credits
//  plus amendes versees ici — se partage au prorata de ce que chacun a
//  laisse dormir dans la caisse.
//
//  Deux exigences qui gouvernent tout le calcul :
//
//    1. la somme des parts egale exactement le solde de la caisse ;
//    2. chaque part est justifiable ligne a ligne — apport rendu,
//       quote-part, interets, amendes — et non un total opaque.
//
//  Le reliquat de division va au plus gros apporteur : il faut bien que
//  les centimes tombent quelque part, et c'est lui qui a le plus attendu.
// =====================================================================

class PartageService {

    /**
     * Calcul pur, sans ecriture. Sert autant a l'apercu qu'a la cloture :
     * les deux passent par le meme code, donc l'apercu ne peut pas mentir.
     */
    static async calculer(groupeId, t) {
        const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
        const pool = await EpargneService.pool(groupeId, t);

        const soldeCaisse = groupe.portefeuilleEpargneId
            ? arrondir((await Portefeuille.findByPk(groupe.portefeuilleEpargneId, { transaction: t })).solde)
            : 0;

        const apports = await EpargneService.apportsParMembre(groupeId, t);
        const membres = await TontineMembre.findAll({
            where: { groupeId, statut: 'actif' },
            include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }],
            transaction: t
        });

        const totalApports = arrondir(Object.values(apports).reduce((s, v) => s + v, 0));
        // Ce qui reste au-dela des apports, c'est le produit de l'exercice.
        const produit = arrondir(soldeCaisse - totalApports);

        const parts = membres.map(m => {
            const apport = arrondir(apports[m.clientId] || 0);
            const quotePart = totalApports > 0 ? apport / totalApports : (membres.length ? 1 / membres.length : 0);
            return {
                clientId: m.clientId,
                nom: m.client ? m.client.nom : null,
                apports: apport,
                quotePart: Math.round(quotePart * 10000) / 100,
                partProduit: Math.floor(produit * quotePart),
                total: 0
            };
        });

        for (const p of parts) p.total = arrondir(p.apports + p.partProduit);

        // Reliquat de division : au plus gros apporteur.
        const distribue = arrondir(parts.reduce((s, p) => s + p.total, 0));
        const reliquat = arrondir(soldeCaisse - distribue);
        if (reliquat !== 0 && parts.length) {
            const principal = parts.reduce((a, b) => (b.apports > a.apports ? b : a), parts[0]);
            principal.partProduit = arrondir(principal.partProduit + reliquat);
            principal.total = arrondir(principal.total + reliquat);
        }

        return {
            groupe, pool, soldeCaisse, totalApports, produit,
            interets: arrondir(pool.interetsCumules),
            amendes: arrondir(pool.amendesCumulees),
            parts,
            controle: arrondir(parts.reduce((s, p) => s + p.total, 0)) === soldeCaisse
        };
    }

    static async simuler(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        const calcul = await this.calculer(groupeId, null);
        const bloquants = await this._bloquants(groupeId, null);
        return { ...calcul, groupe: undefined, pool: undefined, cloturePossible: bloquants.length === 0, bloquants };
    }

    /** Ce qui empeche de clore l'exercice. */
    static async _bloquants(groupeId, t) {
        const raisons = [];
        const pool = await EpargneService.pool(groupeId, t);

        if (arrondir(pool.capitalEngage) > 0) {
            raisons.push(`${arrondir(pool.capitalEngage)} FCFA sont encore dehors en credits non rembourses`);
        }
        const ouverts = await TontineDemandeCredit.count({
            where: { poolId: pool.id, statut: { [Op.in]: ['en_attente', 'approuvee', 'decaissee', 'en_defaut'] } },
            transaction: t
        });
        if (ouverts > 0) raisons.push(`${ouverts} demande(s) de credit encore ouverte(s)`);
        return raisons;
    }

    // -----------------------------------------------------------------
    //  Cloture
    // -----------------------------------------------------------------
    static async cloturer(acteur, groupeId, exercice) {
        const annee = parseInt(exercice, 10) || new Date().getFullYear();

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            if (!acteur.systeme) {
                await exigerRole(groupeId, acteur.clientId, ['president', 'tresorier'], t,
                    "clore l'exercice");
            }

            const deja = await TontinePartage.findOne({
                where: { groupeId, exercice: annee }, transaction: t
            });
            if (deja && deja.statut === 'cloture') {
                throw new ErreurTontine(409, `L'exercice ${annee} est deja cloture`);
            }

            const bloquants = await this._bloquants(groupeId, t);
            if (bloquants.length) {
                throw new ErreurTontine(409, `Cloture impossible : ${bloquants.join(' ; ')}`);
            }

            const pool = await EpargneService.pool(groupeId, t, true);
            const calcul = await this.calculer(groupeId, t);
            if (calcul.soldeCaisse <= 0) {
                throw new ErreurTontine(409, "La caisse d'epargne est vide : il n'y a rien a partager");
            }
            if (!calcul.controle) {
                throw new ErreurTontine(500, 'Controle de repartition invalide : la cloture est annulee');
            }

            const caisse = await portefeuilleEpargne(groupe, t, true);
            const detail = [];

            for (const part of calcul.parts) {
                if (part.total <= 0) { detail.push({ ...part, transactionId: null }); continue; }

                const portefeuille = await portefeuilleClient(part.clientId, t, true);
                await transferer(caisse, portefeuille, part.total, t);

                const transaction = await ecrireTransaction({
                    montant: part.total,
                    type: 'partage_epargne',
                    description: `Casse ${annee} — ${groupe.nom} : apport ${part.apports} + produit ${part.partProduit}`,
                    clientId: part.clientId,
                    groupeId,
                    reference: `TNT-PAR-${groupeId}-${annee}-${part.clientId}`
                }, t);

                detail.push({ ...part, transactionId: transaction.id });
            }

            const partage = deja
                ? await deja.update({
                    capitalPartage: calcul.totalApports,
                    interetsPartages: calcul.interets,
                    amendesPartagees: calcul.amendes,
                    nbBeneficiaires: detail.filter(d => d.total > 0).length,
                    detail,
                    statut: 'cloture',
                    dateCloture: new Date()
                }, { transaction: t })
                : await TontinePartage.create({
                    groupeId,
                    exercice: annee,
                    capitalPartage: calcul.totalApports,
                    interetsPartages: calcul.interets,
                    amendesPartagees: calcul.amendes,
                    nbBeneficiaires: detail.filter(d => d.total > 0).length,
                    detail,
                    statut: 'cloture',
                    dateCloture: new Date()
                }, { transaction: t });

            // Le pool repart a zero : le nouvel exercice recommence vierge.
            await pool.update({
                capitalTotal: 0, capitalDisponible: 0, capitalEngage: 0,
                apportsMembres: 0, interetsCumules: 0, amendesCumulees: 0,
                derniereMaj: new Date()
            }, { transaction: t });

            const restant = arrondir((await Portefeuille.findByPk(caisse.id, { transaction: t })).solde);
            if (restant !== 0) {
                throw new ErreurTontine(500,
                    `Cloture annulee : ${restant} FCFA restent dans la caisse apres repartition`);
            }

            return {
                partage,
                exercice: annee,
                totalDistribue: calcul.soldeCaisse,
                apportsRendus: calcul.totalApports,
                produitPartage: calcul.produit,
                detail
            };
        });
    }

    static async historique(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        return {
            partages: await TontinePartage.findAll({
                where: { groupeId }, order: [['exercice', 'DESC']]
            })
        };
    }
}

module.exports = PartageService;

'use strict';

const { fn, col, Op } = require('sequelize');
const {
    db, Client, Transaction,
    TontineGroupe, TontineMembre, TontinePoolCredit
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, portefeuilleEpargne,
    exigerRole, ecrireTransaction, transferer
} = require('./commun');

// =====================================================================
//  Caisse 2 — l'epargne du groupe.
//
//  Trois entrees, volontairement distinguees pour que la casse annuelle
//  soit justifiable ligne a ligne :
//
//    apportsMembres    ce que chacun a volontairement depose
//    interetsCumules   ce que les credits ont rapporte
//    amendesCumulees   ce que la caisse 4 a verse ici (decision D7)
//
//  Les apports PAR MEMBRE ne sont pas stockes : ils se lisent dans le
//  registre des transactions, qui fait foi. Une colonne denormalisee de
//  plus serait une occasion de plus de diverger du grand livre.
// =====================================================================

const TYPE_APPORT = 'apport_epargne';

class EpargneService {

    static async pool(groupeId, t, verrouiller = false) {
        const options = { transaction: t };
        if (verrouiller && t) options.lock = t.LOCK.UPDATE;
        const pool = await TontinePoolCredit.findOne({ where: { groupeId }, ...options });
        if (!pool) {
            throw new ErreurTontine(409,
                "Ce groupe n'a pas de caisse d'epargne : elle n'existe que pour les types 'credit' et 'mixte'");
        }
        return pool;
    }

    /** Apports cumules par membre, lus dans le grand livre. */
    static async apportsParMembre(groupeId, t) {
        const lignes = await Transaction.findAll({
            where: { groupeTontineId: groupeId, type: TYPE_APPORT },
            attributes: ['ClientTransactionId', [fn('SUM', col('montant')), 'total']],
            group: ['ClientTransactionId'],
            raw: true,
            transaction: t
        });
        const parClient = {};
        for (const l of lignes) parClient[l.ClientTransactionId] = arrondir(l.total);
        return parClient;
    }

    // -----------------------------------------------------------------
    //  Apport
    // -----------------------------------------------------------------
    static async apporter(clientId, groupeId, montant) {
        const somme = arrondir(montant);
        if (!(somme > 0)) throw new ErreurTontine(400, "Le montant de l'apport doit etre strictement positif");

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            const membre = await exigerRole(groupeId, clientId, [], t);
            if (membre.statut !== 'actif') throw new ErreurTontine(403, 'Seul un membre actif peut alimenter la caisse');

            const pool = await this.pool(groupeId, t, true);
            const portefeuille = await portefeuilleClient(clientId, t, true);
            const caisse = await portefeuilleEpargne(groupe, t, true);
            await transferer(portefeuille, caisse, somme, t);

            const dejaApporte = (await this.apportsParMembre(groupeId, t))[clientId] || 0;
            const transaction = await ecrireTransaction({
                montant: somme,
                type: TYPE_APPORT,
                description: `Apport a la caisse d'epargne — ${groupe.nom}`,
                clientId,
                groupeId,
                reference: `TNT-APP-${groupeId}-${clientId}-${dejaApporte}`
            }, t);

            await pool.update({
                apportsMembres: arrondir(nombre(pool.apportsMembres) + somme),
                capitalTotal: arrondir(nombre(pool.capitalTotal) + somme),
                capitalDisponible: arrondir(nombre(pool.capitalDisponible) + somme),
                derniereMaj: new Date()
            }, { transaction: t });

            return {
                pool, transaction,
                monApportTotal: arrondir(dejaApporte + somme),
                soldeRestant: arrondir(portefeuille.solde)
            };
        });
    }

    // -----------------------------------------------------------------
    //  Consultation
    // -----------------------------------------------------------------
    static async etat(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        const groupe = await TontineGroupe.findByPk(groupeId);
        const pool = await this.pool(groupeId, null);

        const apports = await this.apportsParMembre(groupeId, null);
        const membres = await TontineMembre.findAll({
            where: { groupeId, statut: 'actif' },
            include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }]
        });

        const totalApports = arrondir(Object.values(apports).reduce((s, v) => s + v, 0));
        const aPartager = arrondir(nombre(pool.interetsCumules) + nombre(pool.amendesCumulees));

        return {
            pool,
            soldeCaisse: groupe.portefeuilleEpargneId
                ? arrondir((await require('../../models').Portefeuille.findByPk(groupe.portefeuilleEpargneId)).solde)
                : 0,
            composition: {
                apports: arrondir(pool.apportsMembres),
                interets: arrondir(pool.interetsCumules),
                amendes: arrondir(pool.amendesCumulees),
                engage: arrondir(pool.capitalEngage),
                disponible: arrondir(pool.capitalDisponible)
            },
            membres: membres.map(m => {
                const apport = apports[m.clientId] || 0;
                return {
                    clientId: m.clientId,
                    nom: m.client ? m.client.nom : null,
                    apports: apport,
                    quotePart: totalApports > 0 ? Math.round((apport / totalApports) * 10000) / 100 : 0,
                    gainEstime: totalApports > 0 ? arrondir((apport / totalApports) * aPartager) : 0
                };
            }),
            monApport: apports[clientId] || 0
        };
    }

    static async mesApports(clientId, groupeId) {
        const where = { type: TYPE_APPORT, ClientTransactionId: clientId };
        if (groupeId) where.groupeTontineId = groupeId;
        const lignes = await Transaction.findAll({ where, order: [['date', 'DESC']] });
        return {
            apports: lignes,
            total: arrondir(lignes.reduce((s, l) => s + nombre(l.montant), 0))
        };
    }

    /**
     * Mouvements internes appeles par le service de credit. Regroupes ici
     * pour que toute variation du pool passe par un seul endroit.
     */
    static async engagerCapital(pool, montant, t) {
        const m = arrondir(montant);
        if (arrondir(pool.capitalDisponible) < m) {
            throw new ErreurTontine(409,
                `Capital disponible insuffisant : ${arrondir(pool.capitalDisponible)} pour ${m} demandes`);
        }
        await pool.update({
            capitalDisponible: arrondir(nombre(pool.capitalDisponible) - m),
            capitalEngage: arrondir(nombre(pool.capitalEngage) + m),
            derniereMaj: new Date()
        }, { transaction: t });
    }

    static async encaisserRemboursement(pool, partCapital, partInteret, t) {
        await pool.update({
            capitalEngage: arrondir(Math.max(0, nombre(pool.capitalEngage) - nombre(partCapital))),
            capitalDisponible: arrondir(nombre(pool.capitalDisponible) + nombre(partCapital) + nombre(partInteret)),
            interetsCumules: arrondir(nombre(pool.interetsCumules) + nombre(partInteret)),
            capitalTotal: arrondir(nombre(pool.capitalTotal) + nombre(partInteret)),
            derniereMaj: new Date()
        }, { transaction: t });
    }
}

module.exports = { EpargneService, TYPE_APPORT };

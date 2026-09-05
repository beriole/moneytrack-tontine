const { fn, col, Op } = require('sequelize');
const { Client, Transaction, Portefeuille, Plan, Litige, Epargne, Projet } = require('../../models/index');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// GET /api/admin/dashboard/stats
const stats = async (req, res) => {
    try {
        const [
            totalClients, clientsActifs, clientsVerifies, nouveaux30j,
            volumeTransactions, benefices, encoursWallets, nbTransactions,
            nbPlans, nbEpargnes, nbProjets
        ] = await Promise.all([
            Client.count(),
            Client.count({ where: { isActive: true } }),
            Client.count({ where: { isVerified: true } }),
            Client.count({ where: { createdAt: { [Op.gte]: daysAgo(30) } } }),
            Transaction.sum('montant'),
            Transaction.sum('frais'),
            Portefeuille.sum('solde'),
            Transaction.count(),
            Plan.count(),
            Epargne.count(),
            Projet.count(),
        ]);

        return res.json({
            success: true,
            data: {
                utilisateurs: {
                    total: totalClients,
                    actifs: clientsActifs,
                    verifies: clientsVerifies,
                    nouveaux30j: nouveaux30j
                },
                finances: {
                    volumeTransactions: volumeTransactions || 0,
                    benefices: benefices || 0,
                    encoursWallets: encoursWallets || 0,
                    nbTransactions
                },
                produits: { plans: nbPlans, epargnes: nbEpargnes, projets: nbProjets }
            }
        });
    } catch (error) {
        console.error('dashboard stats:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/dashboard/charts
const charts = async (req, res) => {
    try {
        // Répartition des transactions par type
        const parType = await Transaction.findAll({
            attributes: ['type', [fn('COUNT', col('id')), 'nombre'], [fn('SUM', col('montant')), 'montant']],
            group: ['type'], raw: true
        });
        // Répartition des transactions par statut
        const parStatut = await Transaction.findAll({
            attributes: ['statut', [fn('COUNT', col('id')), 'nombre']],
            group: ['statut'], raw: true
        });
        // Répartition des portefeuilles par type
        const walletsParType = await Portefeuille.findAll({
            attributes: ['typePortefeuille', [fn('COUNT', col('id')), 'nombre'], [fn('SUM', col('solde')), 'solde']],
            group: ['typePortefeuille'], raw: true
        });

        return res.json({ success: true, data: { transactionsParType: parType, transactionsParStatut: parStatut, walletsParType } });
    } catch (error) {
        console.error('dashboard charts:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { stats, charts };

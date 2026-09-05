const { fn, col, Op } = require('sequelize');
const { Transaction, Client } = require('../../models/index');
const { getConfigValue } = require('./admin.config');

// GET /api/admin/aml/suspectes  — transactions à surveiller (montant élevé + vélocité)
const transactionsSuspectes = async (req, res) => {
    try {
        const seuilMontant = await getConfigValue('aml_seuil_montant', 1000000);
        const seuilVelocite = await getConfigValue('aml_seuil_velocite', 10);

        // 1) Transactions de montant élevé
        const montantEleve = await Transaction.findAll({
            where: { montant: { [Op.gte]: seuilMontant } },
            include: [{ model: Client, as: 'clienttransaction', attributes: ['id', 'nom', 'email'] }],
            order: [['montant', 'DESC']],
            limit: 50
        });

        // 2) Vélocité : clients avec >= seuil transactions sur les dernières 24h
        const depuis = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const velocite = await Transaction.findAll({
            where: { createdAt: { [Op.gte]: depuis } },
            attributes: ['ClientTransactionId', [fn('COUNT', col('id')), 'nombre'], [fn('SUM', col('montant')), 'volume']],
            group: ['ClientTransactionId'],
            having: require('sequelize').where(fn('COUNT', col('id')), { [Op.gte]: seuilVelocite }),
            raw: true
        });

        return res.json({
            success: true,
            data: {
                seuils: { montant: seuilMontant, velocite24h: seuilVelocite },
                montantEleve,
                velociteSuspecte: velocite,
                nbAlertes: montantEleve.length + velocite.length
            }
        });
    } catch (error) {
        console.error('AML suspectes:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { transactionsSuspectes };

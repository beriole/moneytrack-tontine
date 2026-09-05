const { fn, col, Op } = require('sequelize');
const { Transaction, Paiement, Client, Portefeuille } = require('../../models/index');
const { logAction } = require('./audit');

// GET /api/admin/transaction/transaction?page&limit&type&statut&search
const listeTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const { type, statut } = req.query;

        const where = {};
        if (type) where.type = type;
        if (statut) where.statut = statut;

        const { rows, count } = await Transaction.findAndCountAll({
            where,
            include: [{ model: Client, as: 'clienttransaction', attributes: ['id', 'nom', 'email'] }],
            order: [['createdAt', 'DESC']],
            limit, offset
        });

        return res.json({
            success: true,
            data: rows,
            meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
        });
    } catch (error) {
        console.error('listeTransactions:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/transaction/transactions/:id
const detailsTransactions = async (req, res) => {
    try {
        const tx = await Transaction.findByPk(req.params.id, {
            include: [{ model: Client, as: 'clienttransaction', attributes: ['id', 'nom', 'email', 'telephone'] }]
        });
        if (!tx) return res.status(404).json({ success: false, error: 'Transaction introuvable' });
        return res.json({ success: true, data: tx });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/transaction/benefices?dateDebut&dateFin
const benefices = async (req, res) => {
    try {
        const { dateDebut, dateFin } = req.query;
        const where = {};
        if (dateDebut || dateFin) {
            where.date = {};
            if (dateDebut) where.date[Op.gte] = new Date(dateDebut);
            if (dateFin) where.date[Op.lte] = new Date(dateFin);
        }

        const totalFrais = await Transaction.sum('frais', { where });
        const totalVolume = await Transaction.sum('montant', { where });
        const parType = await Transaction.findAll({
            where,
            attributes: ['type', [fn('SUM', col('frais')), 'frais'], [fn('SUM', col('montant')), 'volume'], [fn('COUNT', col('id')), 'nombre']],
            group: ['type'], raw: true
        });

        return res.json({
            success: true,
            data: { beneficesTotal: totalFrais || 0, volumeTotal: totalVolume || 0, parType }
        });
    } catch (error) {
        console.error('benefices:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/transaction/paiements?page&limit&status
const consulterPaiment = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const where = {};
        if (req.query.status) where.status = req.query.status;

        const { rows, count } = await Paiement.findAndCountAll({
            where, order: [['date', 'DESC']], limit, offset
        });
        return res.json({
            success: true, data: rows,
            meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
        });
    } catch (error) {
        console.error('consulterPaiment:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/transaction/pret — module prêts non encore disponible (pas de modèle Loan)
const listePrets = async (req, res) => {
    return res.json({ success: true, data: [], message: 'Module Prêts à venir (V3)' });
};
const detailsPret = async (req, res) => {
    return res.status(501).json({ success: false, error: 'Module Prêts non implémenté' });
};

// POST /api/admin/transaction/:id/rembourser  — recrédite le wallet principal du client
const rembourser = async (req, res) => {
    try {
        const tx = await Transaction.findByPk(req.params.id);
        if (!tx) return res.status(404).json({ success: false, error: 'Transaction introuvable' });
        if (tx.statut === 'remboursée') {
            return res.status(400).json({ success: false, error: 'Transaction déjà remboursée' });
        }

        const clientId = tx.ClientTransactionId;
        let wallet = await Portefeuille.findOne({ where: { ClientPortefeuilleId: clientId, estPrincipal: true } });
        if (!wallet) {
            wallet = await Portefeuille.findOne({ where: { ClientPortefeuilleId: clientId, typePortefeuille: 'courant' } });
        }
        if (!wallet) return res.status(404).json({ success: false, error: 'Portefeuille du client introuvable' });

        wallet.solde += tx.montant;
        await wallet.save();

        const reversal = await Transaction.create({
            montant: tx.montant, date: new Date(), type: 'remboursement', statut: 'Succès',
            description: `Remboursement de la transaction #${tx.id}`, frais: 0, ClientTransactionId: clientId
        });
        tx.statut = 'remboursée';
        await tx.save();

        await logAction(req, 'TRANSACTION_REFUND', `Transaction#${tx.id}`, { montant: tx.montant, walletId: wallet.id });
        return res.json({ success: true, message: 'Remboursement effectué', data: { reversal, nouveauSolde: wallet.solde } });
    } catch (error) {
        console.error('rembourser:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/admin/transaction/wallet/ajuster  body: { walletId, montant, sens, motif }
const ajusterWallet = async (req, res) => {
    const { walletId, montant, sens, motif } = req.body;
    try {
        const valeur = parseFloat(montant);
        if (!walletId || !valeur || valeur <= 0 || !['credit', 'debit'].includes(sens)) {
            return res.status(400).json({ success: false, error: 'Paramètres invalides (walletId, montant>0, sens credit|debit)' });
        }
        const wallet = await Portefeuille.findByPk(walletId);
        if (!wallet) return res.status(404).json({ success: false, error: 'Portefeuille introuvable' });

        if (sens === 'debit' && wallet.solde < valeur) {
            return res.status(400).json({ success: false, error: 'Solde insuffisant pour ce débit' });
        }
        wallet.solde += sens === 'credit' ? valeur : -valeur;
        await wallet.save();

        await Transaction.create({
            montant: valeur, date: new Date(), type: sens === 'credit' ? 'ajustement_credit' : 'ajustement_debit',
            statut: 'Succès', description: `Ajustement admin : ${motif || 'n/c'}`, frais: 0,
            ClientTransactionId: wallet.ClientPortefeuilleId
        });
        await logAction(req, 'WALLET_ADJUST', `Portefeuille#${wallet.id}`, { sens, montant: valeur, motif });
        return res.json({ success: true, message: 'Ajustement effectué', data: { nouveauSolde: wallet.solde } });
    } catch (error) {
        console.error('ajusterWallet:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listeTransactions, detailsTransactions, benefices, consulterPaiment, listePrets, detailsPret, rembourser, ajusterWallet };

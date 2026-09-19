const { fn, col, Op } = require('sequelize');
const { Transaction, Paiement, Client, Portefeuille } = require('../../models/index');
const { ouvrirDemande } = require('./admin.validation');

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

        // Le seul revenu reellement encaisse a ce jour : la commission
        // prelevee sur les pots de tontine, transferee depuis la caisse du
        // groupe vers le compte de la plateforme. La colonne `frais`, elle,
        // a longtemps porte un defaut de 100,3 FCFA que personne ne debitait
        // (voir la migration 20260906120000) : sur une base ancienne elle
        // annonce un revenu fantome. On publie les deux, distinctement.
        const revenuPlateforme = await Transaction.sum('montant', {
            where: { ...where, type: 'frais_plateforme' }
        });

        return res.json({
            success: true,
            data: {
                beneficesTotal: totalFrais || 0,
                revenuPlateforme: revenuPlateforme || 0,
                volumeTotal: totalVolume || 0,
                parType,
                note: "beneficesTotal est la somme de la colonne 'frais' ; seul revenuPlateforme correspond a de l'argent effectivement encaisse."
            }
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

// =====================================================================
//  Operations financieres sensibles : maker uniquement.
//
//  Ces deux routes executaient directement le mouvement, derriere un seul
//  requireRole('ADMIN_FINANCE'). Elles doublonnaient EXACTEMENT les
//  executeurs REFUND et WALLET_ADJUST du maker-checker : un administrateur
//  seul pouvait donc crediter n'importe quel portefeuille, que le client
//  n'avait plus qu'a encaisser par /paiement/retrait. Elles deposent
//  desormais une demande, qu'un SECOND administrateur doit approuver via
//  POST /api/admin/validation/:id/approuver.
// =====================================================================

// POST /api/admin/transaction/:id/rembourser  — ouvre une demande de remboursement
const rembourser = async (req, res) => {
    try {
        const tx = await Transaction.findByPk(req.params.id);
        if (!tx) return res.status(404).json({ success: false, error: 'Transaction introuvable' });
        if (tx.statut === 'remboursée') {
            return res.status(400).json({ success: false, error: 'Transaction déjà remboursée' });
        }

        const action = await ouvrirDemande(
            req, 'REFUND', { transactionId: tx.id },
            req.body?.motif || `Remboursement de la transaction #${tx.id} (${tx.montant})`
        );
        return res.status(202).json({
            success: true,
            message: "Demande de remboursement enregistrée. Elle doit être approuvée par un autre administrateur.",
            data: action
        });
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

        const action = await ouvrirDemande(
            req, 'WALLET_ADJUST', { walletId: wallet.id, montant: valeur, sens, motif: motif || null },
            `Ajustement ${sens} de ${valeur} sur le portefeuille #${wallet.id} : ${motif || 'n/c'}`
        );
        return res.status(202).json({
            success: true,
            message: "Demande d'ajustement enregistrée. Elle doit être approuvée par un autre administrateur.",
            data: action
        });
    } catch (error) {
        console.error('ajusterWallet:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listeTransactions, detailsTransactions, benefices, consulterPaiment, rembourser, ajusterWallet };

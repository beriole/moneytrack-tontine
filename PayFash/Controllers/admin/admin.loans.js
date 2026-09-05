const { Pret, Client, Portefeuille, Transaction } = require('../../models/index');
const { logAction } = require('./audit');

// GET /api/admin/pret/pret?page&limit&statut
const listePrets = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const where = {};
        if (req.query.statut) where.statut = req.query.statut;

        const { rows, count } = await Pret.findAndCountAll({
            where,
            include: [{ model: Client, attributes: ['id', 'nom', 'email'] }],
            order: [['createdAt', 'DESC']],
            limit, offset
        });
        return res.json({
            success: true, data: rows,
            meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
        });
    } catch (error) {
        console.error('admin listePrets:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/pret/pret/:id
const detailPret = async (req, res) => {
    try {
        const pret = await Pret.findByPk(req.params.id, {
            include: [{ model: Client, attributes: ['id', 'nom', 'email', 'telephone'] }]
        });
        if (!pret) return res.status(404).json({ success: false, error: 'Prêt introuvable' });
        return res.json({ success: true, data: pret });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/pret/pret/:id/approuver  — approuve + décaisse sur le wallet principal
const approuverPret = async (req, res) => {
    try {
        const pret = await Pret.findByPk(req.params.id);
        if (!pret) return res.status(404).json({ success: false, error: 'Prêt introuvable' });
        if (pret.statut !== 'demande') {
            return res.status(400).json({ success: false, error: `Prêt déjà traité (statut: ${pret.statut})` });
        }

        // Calcul du montant total dû (intérêt simple)
        const interets = pret.montant * (pret.tauxInteret / 100) * (pret.dureeMois / 12);
        const montantTotalDu = pret.montant + interets;
        const echeance = new Date();
        echeance.setMonth(echeance.getMonth() + pret.dureeMois);

        // Décaissement sur le wallet principal
        let wallet = await Portefeuille.findOne({ where: { ClientPortefeuilleId: pret.clientId, estPrincipal: true } });
        if (!wallet) wallet = await Portefeuille.findOne({ where: { ClientPortefeuilleId: pret.clientId, typePortefeuille: 'courant' } });
        if (!wallet) return res.status(404).json({ success: false, error: 'Portefeuille du client introuvable' });

        wallet.solde += pret.montant;
        await wallet.save();
        await Transaction.create({
            montant: pret.montant, date: new Date(), type: 'pret', statut: 'Succès',
            description: `Décaissement du prêt #${pret.id}`, frais: 0, ClientTransactionId: pret.clientId
        });

        pret.statut = 'actif';
        pret.dateApprobation = new Date();
        pret.dateEcheance = echeance;
        pret.montantTotalDu = montantTotalDu;
        await pret.save();

        await logAction(req, 'LOAN_APPROVE', `Pret#${pret.id}`, { montant: pret.montant, montantTotalDu });
        return res.json({ success: true, message: 'Prêt approuvé et décaissé', data: pret });
    } catch (error) {
        console.error('approuverPret:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/pret/pret/:id/rejeter   body: { motif }
const rejeterPret = async (req, res) => {
    try {
        const pret = await Pret.findByPk(req.params.id);
        if (!pret) return res.status(404).json({ success: false, error: 'Prêt introuvable' });
        if (pret.statut !== 'demande') {
            return res.status(400).json({ success: false, error: `Prêt déjà traité (statut: ${pret.statut})` });
        }
        pret.statut = 'rejete';
        pret.motifRejet = req.body?.motif || null;
        await pret.save();
        await logAction(req, 'LOAN_REJECT', `Pret#${pret.id}`, { motif: pret.motifRejet });
        return res.json({ success: true, message: 'Prêt rejeté', data: pret });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/pret/pret/:id/defaut  — marquer en défaut de paiement
const marquerDefaut = async (req, res) => {
    try {
        const pret = await Pret.findByPk(req.params.id);
        if (!pret) return res.status(404).json({ success: false, error: 'Prêt introuvable' });
        pret.statut = 'defaut';
        await pret.save();
        await logAction(req, 'LOAN_DEFAULT', `Pret#${pret.id}`);
        return res.json({ success: true, message: 'Prêt marqué en défaut', data: pret });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listePrets, detailPret, approuverPret, rejeterPret, marquerDefaut };

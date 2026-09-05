const { Pret } = require('../../models/index');

// POST /loans/publieroffre  — un client demande un prêt
const demanderpret = async (req, res) => {
    try {
        const { montant, dureeMois, motif, tauxInteret } = req.body;
        if (!montant || montant <= 0) {
            return res.status(400).json({ success: false, error: 'Montant invalide' });
        }
        const pret = await Pret.create({
            montant: parseFloat(montant),
            dureeMois: parseInt(dureeMois) || 12,
            tauxInteret: tauxInteret !== undefined ? parseFloat(tauxInteret) : 5,
            motif: motif || null,
            statut: 'demande',
            clientId: req.user.id
        });
        return res.status(201).json({ success: true, message: 'Demande de prêt enregistrée', data: pret });
    } catch (error) {
        console.error('demanderpret:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /loans/listepret  — liste des prêts du client connecté
const liste_des_prets = async (req, res) => {
    try {
        const prets = await Pret.findAll({ where: { clientId: req.user.id }, order: [['createdAt', 'DESC']] });
        return res.json({ success: true, data: prets });
    } catch (error) {
        console.error('liste_des_prets:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /loans/details/:id
const detailsdepret = async (req, res) => {
    try {
        const pret = await Pret.findOne({ where: { id: req.params.id, clientId: req.user.id } });
        if (!pret) return res.status(404).json({ success: false, error: 'Prêt introuvable' });
        return res.json({ success: true, data: pret });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Endpoints non encore implémentés (V3+) — réponses valides pour éviter les crashs
const mettre_a_jour = async (req, res) => res.status(501).json({ success: false, message: 'Non implémenté' });
const chifferun_pret = async (req, res) => res.status(501).json({ success: false, message: 'Non implémenté' });
const souscrire_a_un_pret = async (req, res) => res.status(501).json({ success: false, message: 'Non implémenté' });
const effectuer_remboursement = async (req, res) => res.status(501).json({ success: false, message: 'Non implémenté' });

module.exports = {
    demanderpret, liste_des_prets, detailsdepret,
    mettre_a_jour, chifferun_pret, souscrire_a_un_pret, effectuer_remboursement
};

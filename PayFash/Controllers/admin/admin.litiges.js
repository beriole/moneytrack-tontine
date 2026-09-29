const { Op } = require('sequelize');
const { Client, Litige } = require('../../models/index');
const { LitigeService, OUVERTS } = require('../../services/litige.service');

// GET /api/admin/litige/litige?page&limit&statut
const listeLitiges = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const where = {};
        // « ouvert » regroupe les litiges en attente et en cours : le filtre
        // cherchait la valeur 'ouvert', qu'aucun litige ne porte.
        if (req.query.statut === 'ouvert') where.statut = { [Op.in]: OUVERTS };
        else if (req.query.statut) where.statut = req.query.statut;

        const { rows, count } = await Litige.findAndCountAll({
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
        console.error('listeLitiges:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/litige/litige/:id
const detailsLitige = async (req, res) => {
    try {
        const litige = await Litige.findByPk(req.params.id, {
            include: [{ model: Client, attributes: ['id', 'nom', 'email', 'telephone'] }]
        });
        if (!litige) return res.status(404).json({ success: false, error: 'Litige introuvable' });
        // L'instantane des preuves est-il celui pris a l'ouverture ?
        return res.json({ success: true, data: { ...litige.toJSON(), preuvesIntactes: LitigeService.verifierPreuves(litige) } });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/litige/litige/:id/resoudre   body: { statut, reponse }
// statut : 'en cours' (pris en charge), 'résolu' ou 'rejeté' — ces deux
// derniers exigent une reponse, envoyee au client.
const resoudreLitige = async (req, res) => {
    try {
        const l = await LitigeService.trancher(req.admin, req.params.id, req.body || {}, req);
        return res.json({ success: true, message: 'Litige mis à jour', data: l });
    } catch (error) {
        if (error && error.name === 'ErreurTontine') return res.status(error.code).json({ success: false, error: error.message });
        console.error('resoudreLitige:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listeLitiges, detailsLitige, resoudreLitige };

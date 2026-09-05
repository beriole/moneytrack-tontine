const { Client, Litige } = require('../../models/index');
const { logAction } = require('./audit');

// GET /api/admin/litige/litige?page&limit&statut
const listeLitiges = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const where = {};
        if (req.query.statut) where.statut = req.query.statut;

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
        return res.json({ success: true, data: litige });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/litige/litige/:id/resoudre   body: { statut }
const resoudreLitige = async (req, res) => {
    try {
        const litige = await Litige.findByPk(req.params.id);
        if (!litige) return res.status(404).json({ success: false, error: 'Litige introuvable' });

        litige.statut = req.body?.statut || 'résolu';
        litige.dateResolution = new Date();
        await litige.save();
        await logAction(req, 'LITIGE_RESOLVE', `Litige#${litige.id}`, { statut: litige.statut });
        return res.json({ success: true, message: 'Litige mis à jour', data: litige });
    } catch (error) {
        console.error('resoudreLitige:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listeLitiges, detailsLitige, resoudreLitige };

// KYC = vérification d'identité des clients (Client.isVerified) + document (photo).
const { Op } = require('sequelize');
const { Client, photo } = require('../../models/index');
const { logAction } = require('./audit');

// GET /api/admin/kyc/demandeAky?page&limit  — clients en attente de vérification
const listeDemande = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const { rows, count } = await Client.findAndCountAll({
            where: { isVerified: false },
            attributes: ['id', 'nom', 'email', 'telephone', 'isVerified', 'createdAt'],
            order: [['createdAt', 'ASC']],
            limit, offset
        });
        return res.json({
            success: true, data: rows,
            meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
        });
    } catch (error) {
        console.error('KYC listeDemande:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/kyc/demandeAkyc/:id  — détail (sans renvoyer le BLOB brut)
const detailsDemande = async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id, {
            attributes: ['id', 'nom', 'email', 'telephone', 'isVerified', 'createdAt']
        });
        if (!client) return res.status(404).json({ success: false, error: 'Client introuvable' });

        const doc = await photo.findOne({ where: { clientId: client.id } });
        return res.json({
            success: true,
            data: { client, document: doc ? { id: doc.id, fourni: true } : { fourni: false } }
        });
    } catch (error) {
        console.error('KYC detailsDemande:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/kyc/demandeAkyc/:id/approuve
const approuverDemande = async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id);
        if (!client) return res.status(404).json({ success: false, error: 'Client introuvable' });

        client.isVerified = true;
        await client.save();
        await logAction(req, 'KYC_APPROVE', `Client#${client.id}`);
        return res.json({ success: true, message: 'Demande KYC approuvée', data: { id: client.id, isVerified: true } });
    } catch (error) {
        console.error('KYC approuver:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/kyc/demandeAkyc/:id/rejeter   body: { motif }
const rejeteDemande = async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id);
        if (!client) return res.status(404).json({ success: false, error: 'Client introuvable' });

        client.isVerified = false;
        await client.save();
        await logAction(req, 'KYC_REJECT', `Client#${client.id}`, { motif: req.body?.motif || null });
        return res.json({ success: true, message: 'Demande KYC rejetée', data: { id: client.id, motif: req.body?.motif || null } });
    } catch (error) {
        console.error('KYC rejeter:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listeDemande, detailsDemande, approuverDemande, rejeteDemande };

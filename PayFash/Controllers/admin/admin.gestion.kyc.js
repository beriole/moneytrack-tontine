// KYC = vérification d'identité des clients (Client.isVerified) + document (photo).
const { Op } = require('sequelize');
const { Client, photo } = require('../../models/index');
const { logAction } = require('./audit');
const KycService = require('../../services/kyc.service');

// GET /api/admin/kyc/demandeAky?page&limit  — clients en attente de vérification
const listeDemande = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // La file est celle des IDENTITES a verifier : les comptes qui ont
        // depose une piece et ne sont pas encore au niveau 2 (ou dont la
        // verification a expire). Elle listait les comptes a l'email non
        // confirme — une confirmation par code, que personne n'a a instruire.
        const { rows, count } = await Client.findAndCountAll({
            where: {
                [Op.or]: [
                    { niveauKyc: { [Op.lt]: 2 } },
                    { kycExpireLe: { [Op.lt]: new Date() } }
                ]
            },
            include: [{ model: photo, required: true, attributes: ['id', 'createdAt'] }],
            attributes: ['id', 'nom', 'email', 'telephone', 'isVerified', 'niveauKyc', 'kycExpireLe', 'createdAt'],
            order: [['createdAt', 'ASC']],
            distinct: true,
            limit, offset
        });
        return res.json({
            success: true,
            data: rows.map(c => ({ ...c.toJSON(), kyc: KycService.etat(c) })),
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
//
// Niveau 2, pour la duree de validite configuree. Exige une piece deposee :
// l'approbation n'en verifiait aucune.
const approuverDemande = async (req, res) => {
    try {
        const r = await KycService.approuver(req.params.id);
        if (r.erreur) return res.status(r.erreur).json({ success: false, error: r.message });
        await logAction(req, 'KYC_APPROVE', `Client#${r.client.id}`, { expireLe: r.etat.expireLe });
        return res.json({ success: true, message: 'Identite verifiee', data: { id: r.client.id, ...r.etat } });
    } catch (error) {
        console.error('KYC approuver:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/kyc/demandeAkyc/:id/rejeter   body: { motif }
//
// Retire l'identite verifiee, pas la confirmation de l'email : le rejet
// mettait isVerified a faux.
const rejeteDemande = async (req, res) => {
    try {
        const r = await KycService.rejeter(req.params.id);
        if (r.erreur) return res.status(r.erreur).json({ success: false, error: r.message });
        await logAction(req, 'KYC_REJECT', `Client#${r.client.id}`, { motif: req.body?.motif || null });
        return res.json({ success: true, message: 'Demande KYC rejetee', data: { id: r.client.id, motif: req.body?.motif || null, ...r.etat } });
    } catch (error) {
        console.error('KYC rejeter:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listeDemande, detailsDemande, approuverDemande, rejeteDemande };

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const {
    Client, Portefeuille, Transaction, Epargne, Projet, Plan, Admin
} = require('../../models/index');
const { logAction } = require('./audit');

// GET /api/admin/utilisateur?page&limit&search&statut
const listeUtilisateurs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const { search, statut } = req.query;

        const where = {};
        if (search) {
            where[Op.or] = [
                { nom: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
            ];
        }
        if (statut === 'actif') where.isActive = true;
        if (statut === 'inactif') where.isActive = false;
        if (statut === 'verifie') where.isVerified = true;

        const { rows, count } = await Client.findAndCountAll({
            where,
            attributes: { exclude: ['motDePasse'] },
            order: [['createdAt', 'DESC']],
            limit, offset
        });

        return res.json({
            success: true,
            data: rows,
            meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
        });
    } catch (error) {
        console.error('listeUtilisateurs:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/utilisateur/:id/detail  — vue 360°
const detailsUtilisateurs = async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id, {
            attributes: { exclude: ['motDePasse'] },
            include: [
                { model: Portefeuille, as: 'portefeuille' },
                { model: Epargne },
                { model: Projet },
                { model: Plan },
            ]
        });
        if (!client) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

        const transactions = await Transaction.findAll({
            where: { ClientTransactionId: client.id },
            order: [['createdAt', 'DESC']],
            limit: 20
        });

        const soldeTotal = (client.portefeuille || []).reduce((acc, p) => acc + (p.solde || 0), 0);

        return res.json({ success: true, data: { client, soldeTotal, transactions } });
    } catch (error) {
        console.error('detailsUtilisateurs:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/utilisateur/:id  — activer / désactiver (suspension)
const desactivation = async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id);
        if (!client) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

        client.isActive = !client.isActive;
        await client.save();
        await logAction(req, client.isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', `Client#${client.id}`);

        return res.json({
            success: true,
            message: client.isActive ? 'Compte réactivé' : 'Compte suspendu',
            data: { id: client.id, isActive: client.isActive }
        });
    } catch (error) {
        console.error('desactivation:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// DELETE /api/admin/utilisateur/:id  — suppression (avec nettoyage des dépendances)
const supressionUtilisateur = async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.id);
        if (!client) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

        await Transaction.destroy({ where: { ClientTransactionId: client.id } });
        await Portefeuille.destroy({ where: { ClientPortefeuilleId: client.id } });
        await client.destroy();

        await logAction(req, 'USER_DELETE', `Client#${req.params.id}`, { email: client.email });
        return res.json({ success: true, message: 'Utilisateur supprimé' });
    } catch (error) {
        console.error('supressionUtilisateur:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Helper interne pour créer un agent (admin avec rôle spécifique)
const creerAgent = (role) => async (req, res) => {
    const { nom, prenom, email, motDePasse } = req.body;
    try {
        if (!nom || !email || !motDePasse) {
            return res.status(400).json({ success: false, error: 'Champs requis manquants' });
        }
        const exists = await Admin.findOne({ where: { email } });
        if (exists) return res.status(400).json({ success: false, error: 'Cet email existe déjà' });

        const hash = await bcrypt.hash(motDePasse, 10);
        const agent = await Admin.create({ nom, prenom, email, motDePasse: hash, role });
        await logAction(req, 'AGENT_CREATE', `Admin#${agent.id}`, { role });

        return res.status(201).json({
            success: true,
            data: { id: agent.id, nom: agent.nom, email: agent.email, role: agent.role }
        });
    } catch (error) {
        console.error('creerAgent:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

const creerAgentKYC = creerAgent('AGENT_KYC');
const creerAgentSeller = creerAgent('AGENT_SELLER');

module.exports = {
    listeUtilisateurs, detailsUtilisateurs, desactivation,
    supressionUtilisateur, creerAgentKYC, creerAgentSeller
};

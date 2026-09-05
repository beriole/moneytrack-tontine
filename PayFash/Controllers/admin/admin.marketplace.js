// Gestion du catalogue marketplace = les Plans d'abonnement (vus côté client dans "Souscrire").
const { fn, col } = require('sequelize');
const { Plan, Client } = require('../../models/index');
const { logAction } = require('./audit');

// GET /api/admin/produit/produit
const listeProduits = async (req, res) => {
    try {
        const plans = await Plan.findAll({ order: [['createdAt', 'DESC']] });
        // Nombre de souscripteurs par plan
        const souscriptions = await Client.findAll({
            attributes: ['planId', [fn('COUNT', col('id')), 'abonnes']],
            group: ['planId'], raw: true
        });
        const mapAbo = {};
        souscriptions.forEach(s => { if (s.planId) mapAbo[s.planId] = Number(s.abonnes); });

        const data = plans.map(p => ({ ...p.toJSON(), abonnes: mapAbo[p.id] || 0 }));
        return res.json({ success: true, data });
    } catch (error) {
        console.error('listeProduits:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/admin/produit/produitadd
const ajouterProduit = async (req, res) => {
    const { nom, description, prix } = req.body;
    try {
        if (!nom || prix === undefined) {
            return res.status(400).json({ success: false, error: 'Nom et prix requis' });
        }
        const plan = await Plan.create({ nom, description, prix });
        await logAction(req, 'PLAN_CREATE', `Plan#${plan.id}`, { nom, prix });
        return res.status(201).json({ success: true, data: plan });
    } catch (error) {
        console.error('ajouterProduit:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/produit/produitUpdate/:id
const modifierProduit = async (req, res) => {
    try {
        const plan = await Plan.findByPk(req.params.id);
        if (!plan) return res.status(404).json({ success: false, error: 'Plan introuvable' });

        const { nom, description, prix } = req.body;
        if (nom !== undefined) plan.nom = nom;
        if (description !== undefined) plan.description = description;
        if (prix !== undefined) plan.prix = prix;
        await plan.save();

        await logAction(req, 'PLAN_UPDATE', `Plan#${plan.id}`, req.body);
        return res.json({ success: true, data: plan });
    } catch (error) {
        console.error('modifierProduit:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// DELETE /api/admin/produit/produit/:id
const supprimerProduit = async (req, res) => {
    try {
        const plan = await Plan.findByPk(req.params.id);
        if (!plan) return res.status(404).json({ success: false, error: 'Plan introuvable' });
        await plan.destroy();
        await logAction(req, 'PLAN_DELETE', `Plan#${req.params.id}`, { nom: plan.nom });
        return res.json({ success: true, message: 'Plan supprimé' });
    } catch (error) {
        console.error('supprimerProduit:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listeProduits, ajouterProduit, modifierProduit, supprimerProduit };

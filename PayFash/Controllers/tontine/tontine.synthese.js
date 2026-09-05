const SyntheseService = require('../../services/tontine/synthese.service');
const IntegrationService = require('../../services/tontine/integration.service');
const { repondreErreur } = require('./tontine.groupe');

// =====================================================================
//  Synthese et integration — ce qui relie la tontine au reste de
//  MoneyTrack.
// =====================================================================

// GET /tontine/synthese
const synthese = async (req, res) => {
    try {
        return res.status(200).json(await SyntheseService.complete(req.user.id));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/synthese/solde
const soldeReel = async (req, res) => {
    try {
        return res.status(200).json(await SyntheseService.soldeReel(req.user.id));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/synthese/tresorerie?jours=90
const tresorerie = async (req, res) => {
    try {
        const jours = Math.min(365, Math.max(7, parseInt(req.query.jours, 10) || 90));
        return res.status(200).json(await SyntheseService.tresorerie(req.user.id, jours));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/synthese/financement?montant=450000
const financement = async (req, res) => {
    try {
        const montant = parseFloat(req.query.montant);
        if (!(montant > 0)) return res.status(400).json({ error: 'Indiquez le montant a financer' });
        return res.status(200).json(await SyntheseService.simulerFinancement(req.user.id, montant));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/liens
const etatLiens = async (req, res) => {
    try {
        return res.status(200).json(await IntegrationService.etatLiens(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/:groupeId/lier-budget
const lierBudget = async (req, res) => {
    try {
        const r = await IntegrationService.lierBudget(req.user.id, req.params.groupeId, req.body);
        return res.status(200).json(r);
    } catch (e) { return repondreErreur(res, e); }
};

// DELETE /tontine/groupes/:groupeId/lier-budget
const delierBudget = async (req, res) => {
    try {
        return res.status(200).json(await IntegrationService.delierBudget(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/destinations
const destinations = async (req, res) => {
    try {
        return res.status(200).json(await IntegrationService.destinationsPossibles(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// PUT /tontine/groupes/:groupeId/destination-tour
const routerTour = async (req, res) => {
    try {
        const r = await IntegrationService.routerTour(req.user.id, req.params.groupeId, req.body.portefeuilleId);
        return res.status(200).json(r);
    } catch (e) { return repondreErreur(res, e); }
};

// --- Mandat de prelevement -------------------------------------------
const PrelevementService = require('../../services/tontine/prelevement.service');

// GET /tontine/groupes/:groupeId/prelevement
const etatPrelevement = async (req, res) => {
    try {
        return res.status(200).json(await PrelevementService.etat(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/:groupeId/prelevement
const activerPrelevement = async (req, res) => {
    try {
        return res.status(200).json(await PrelevementService.activer(req.user.id, req.params.groupeId, req.body));
    } catch (e) { return repondreErreur(res, e); }
};

// DELETE /tontine/groupes/:groupeId/prelevement
const desactiverPrelevement = async (req, res) => {
    try {
        return res.status(200).json(await PrelevementService.desactiver(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

module.exports = {
    synthese, soldeReel, tresorerie, financement,
    etatLiens, lierBudget, delierBudget, destinations, routerTour,
    etatPrelevement, activerPrelevement, desactiverPrelevement
};

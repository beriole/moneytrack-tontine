const CycleService = require('../../services/tontine/cycle.service');
const { repondreErreur } = require('./tontine.groupe');

// POST /tontine/cycles/:cycleId/cotiser
const cotiser = async (req, res) => {
    try {
        const r = await CycleService.cotiser(req.user.id, req.params.cycleId, req.body.montant);
        return res.status(201).json({
            message: r.potComplet
                ? 'Cotisation enregistree. Le pot est complet, le versement peut etre declenche.'
                : `Cotisation enregistree. Il reste ${r.cotisationsRestantes} membre(s) a cotiser.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/cycles/:cycleId/cotisations
const etat = async (req, res) => {
    try {
        return res.status(200).json(await CycleService.etatCotisations(req.user.id, req.params.cycleId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/cycles/:cycleId/verser
const verser = async (req, res) => {
    try {
        const r = await CycleService.verser({ clientId: req.user.id }, req.params.cycleId);
        return res.status(200).json({
            message: r.tontineTerminee
                ? 'Pot verse. Tous les membres ont beneficie : la tontine est terminee.'
                : `Pot verse. Le cycle ${r.cycleSuivant.numeroCycle} est ouvert.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

module.exports = { cotiser, etat, verser };

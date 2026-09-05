const CautionService = require('../../services/tontine/caution.service');
const { AmendeService } = require('../../services/tontine/amende.service');
const RecouvrementService = require('../../services/tontine/recouvrement.service');
const { repondreErreur } = require('./tontine.groupe');

// =====================================================================
//  Caisse 4 — caution, amendes, cascade de recours.
// =====================================================================

// --- Caution ---------------------------------------------------------

// POST /tontine/groupes/:groupeId/caution
const bloquerCaution = async (req, res) => {
    try {
        const r = await CautionService.bloquer(req.user.id, req.params.groupeId, req.body.montant);
        return res.status(201).json({
            message: `Caution de ${r.caution.montantBloque} FCFA bloquee. Elle vous sera restituee en fin de tontine.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/cautions/mes-cautions
const mesCautions = async (req, res) => {
    try {
        return res.status(200).json({ cautions: await CautionService.mesCautions(req.user.id) });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/cautions
const cautionsGroupe = async (req, res) => {
    try {
        return res.status(200).json(await CautionService.cautionsGroupe(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/cautions/:cautionId/liberer
const libererCaution = async (req, res) => {
    try {
        const r = await CautionService.liberer({ clientId: req.user.id }, req.params.cautionId);
        return res.status(200).json({
            message: r.montantRestitue > 0
                ? `Caution restituee : ${r.montantRestitue} FCFA rendus au membre.`
                : 'Caution cloturee : elle avait ete entierement consommee.',
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// --- Amendes ---------------------------------------------------------

// POST /tontine/groupes/:groupeId/amendes
const infligerAmende = async (req, res) => {
    try {
        const amende = await AmendeService.infliger({ clientId: req.user.id }, req.params.groupeId, req.body);
        return res.status(201).json({
            message: `Amende de ${amende.montant} FCFA infligee (${amende.motif}). Elle est due avant la prochaine cotisation.`,
            amende
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/amendes/mes-amendes
const mesAmendes = async (req, res) => {
    try {
        return res.status(200).json(await AmendeService.mesAmendes(req.user.id, req.query.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/amendes
const amendesGroupe = async (req, res) => {
    try {
        return res.status(200).json(await AmendeService.amendesGroupe(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/amendes/:amendeId/payer
const payerAmende = async (req, res) => {
    try {
        const r = await AmendeService.payer(req.user.id, req.params.amendeId);
        return res.status(200).json({
            message: `Amende reglee. Elle a alimente ${r.amende.destination === 'epargne' ? "la caisse d'epargne" : 'le pot du cycle'}.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/amendes/:amendeId/annuler
const annulerAmende = async (req, res) => {
    try {
        const amende = await AmendeService.annuler({ clientId: req.user.id }, req.params.amendeId, req.body.commentaire);
        return res.status(200).json({ message: 'Amende annulee.', amende });
    } catch (e) { return repondreErreur(res, e); }
};

// --- Cascade de recours ----------------------------------------------

// PUT /tontine/groupes/:groupeId/garant
const designerGarant = async (req, res) => {
    try {
        const membre = await RecouvrementService.designerGarant(req.user.id, req.params.groupeId, req.body.garantId);
        return res.status(200).json({ message: 'Garant enregistre.', membre });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/cotisations/:cotisationId/recouvrement
const etatRecouvrement = async (req, res) => {
    try {
        return res.status(200).json(await RecouvrementService.etat(req.user.id, req.params.cotisationId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/cotisations/:cotisationId/saisir-caution
const saisirCaution = async (req, res) => {
    try {
        const r = await RecouvrementService.parCaution({ clientId: req.user.id }, req.params.cotisationId);
        return res.status(200).json({
            message: r.cotisationSoldee
                ? `Caution saisie : ${r.montantSaisi} FCFA. La cotisation est soldee, le pot est complet.`
                : `Caution saisie : ${r.montantSaisi} FCFA. Il reste ${r.resteAcouvrir} FCFA a couvrir.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/cotisations/:cotisationId/appeler-garant
const appelerGarant = async (req, res) => {
    try {
        const r = await RecouvrementService.parGarant({ clientId: req.user.id }, req.params.cotisationId);
        return res.status(200).json({
            message: `Garant appele : ${r.montantCouvert} FCFA. La cotisation est soldee.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/:groupeId/exclure
const exclure = async (req, res) => {
    try {
        const r = await RecouvrementService.exclure(
            { clientId: req.user.id }, req.params.groupeId, req.body.clientId, req.body.motif);
        return res.status(200).json({
            message: `Membre exclu. Le groupe compte desormais ${r.membresRestants} membre(s) actif(s).`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

module.exports = {
    bloquerCaution, mesCautions, cautionsGroupe, libererCaution,
    infligerAmende, mesAmendes, amendesGroupe, payerAmende, annulerAmende,
    designerGarant, etatRecouvrement, saisirCaution, appelerGarant, exclure
};

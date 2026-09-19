const CautionService = require('../../services/tontine/caution.service');
const { AmendeService } = require('../../services/tontine/amende.service');
const RecouvrementService = require('../../services/tontine/recouvrement.service');
const DefautService = require('../../services/tontine/defaut.service');
const Politique = require('../../services/tontine/politiqueRecouvrement');
const { exigerRole } = require('../../services/tontine/commun');
const { TontineGroupe } = require('../../models');
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
            // La caisse d'epargne n'existe plus : une amende indemnise le
            // membre lese (pot du cycle, beneficiaire, ou les autres membres).
            message: 'Amende reglee : elle indemnise le membre que le retard a lese.',
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

// --- Defauts -----------------------------------------------------------

// GET /tontine/incidents/mes-incidents
const mesIncidents = async (req, res) => {
    try {
        return res.status(200).json(await DefautService.mesIncidents(req.user.id));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/incidents
const incidentsGroupe = async (req, res) => {
    try {
        return res.status(200).json(await DefautService.incidentsGroupe(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/recouvrement — la politique, pour tout membre
const politiqueRecouvrement = async (req, res) => {
    try {
        await exigerRole(req.params.groupeId, req.user.id, [], null);
        const groupe = await TontineGroupe.findByPk(req.params.groupeId);
        return res.status(200).json({
            ...Politique.de(groupe),
            description: Politique.decrire(groupe),
            sources: Politique.sources()
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/cotisations/:cotisationId/regulariser   { montant? }
const regulariser = async (req, res) => {
    try {
        const r = await DefautService.regulariser(req.user.id, req.params.cotisationId, req.body && req.body.montant);
        return res.status(200).json({
            message: r.soldee
                ? `Cotisation regularisee : ${r.montant} FCFA. Vous ne devez plus rien sur cette echeance.`
                : `${r.montant} FCFA regles. Il reste ${r.resteDu} FCFA a regler.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

module.exports = {
    mesIncidents, incidentsGroupe, politiqueRecouvrement, regulariser,
    bloquerCaution, mesCautions, cautionsGroupe, libererCaution,
    infligerAmende, mesAmendes, amendesGroupe, payerAmende, annulerAmende,
    etatRecouvrement, saisirCaution, exclure
};

const GarantieService = require('../../services/tontine/garantie.service');
const ExpositionService = require('../../services/tontine/exposition.service');
const CouvertureService = require('../../services/tontine/couverture.service');
const { repondreErreur } = require('./tontine.groupe');

// =====================================================================
//  Exposition et garanties.
//
//  Controllers minces : ils authentifient, delegent, traduisent l'erreur.
//  Toute la logique vit dans services/tontine/.
// =====================================================================

// GET /tontine/moi/exposition
const monExposition = async (req, res) => {
    try {
        return res.status(200).json(await ExpositionService.pourClient(req.user.id));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/exposition
const expositionGroupe = async (req, res) => {
    try {
        return res.status(200).json(await ExpositionService.pourMembre(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/couverture
//
// Ce que le membre couvre, ce que le reglement exige de lui, ce qui manque.
const couvertureGroupe = async (req, res) => {
    try {
        return res.status(200).json(await CouvertureService.pourMembre(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/regles-couverture
//
// Les regles toutes faites proposees a la creation d'un groupe.
const modelesCouverture = async (req, res) => {
    try {
        return res.status(200).json({ modeles: CouvertureService.modeles() });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/garanties/sources
const sources = async (req, res) => {
    try {
        return res.status(200).json({
            sources: await GarantieService.sourcesPossibles(req.user.id, req.params.groupeId)
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/garanties/simulation?portefeuilleId=&montant=
//
// Le texte de consentement et son empreinte, plus l'effet sur la
// couverture. C'est ce que l'ecran affiche AVANT que le membre accepte.
const simulation = async (req, res) => {
    try {
        return res.status(200).json(await GarantieService.simuler(
            req.user.id, req.params.groupeId, req.query.portefeuilleId, req.query.montant));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/:groupeId/garanties  { portefeuilleId, montant, hashTexte }
const affecter = async (req, res) => {
    try {
        const r = await GarantieService.affecter(req.user.id, req.params.groupeId, req.body, {
            req, ip: req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || null
        });
        return res.status(201).json({
            message: `${r.garantie.montantInitial} FCFA bloques en garantie. Votre engagement est couvert a ${r.couverture} %.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/garanties
const mesGaranties = async (req, res) => {
    try {
        return res.status(200).json(await GarantieService.mesGaranties(req.user.id));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/garanties/:garantieId
const detail = async (req, res) => {
    try {
        return res.status(200).json(await GarantieService.detail(req.user.id, req.params.garantieId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/garanties/:garantieId/liberer
const liberer = async (req, res) => {
    try {
        const r = await GarantieService.liberer({ clientId: req.user.id }, req.params.garantieId, req.body.motif);
        return res.status(200).json({
            message: `${r.libere} FCFA rendus a votre disponible.`,
            libere: r.libere, portefeuille: r.portefeuille
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/garanties  (president)
const garantiesGroupe = async (req, res) => {
    try {
        return res.status(200).json(await GarantieService.garantiesGroupe(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

module.exports = {
    monExposition, expositionGroupe, couvertureGroupe, modelesCouverture, sources, simulation, affecter,
    mesGaranties, detail, liberer, garantiesGroupe
};

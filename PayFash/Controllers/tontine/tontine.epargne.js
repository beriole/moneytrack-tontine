const { EpargneService } = require('../../services/tontine/epargne.service');
const CreditService = require('../../services/tontine/credit.service');
const PartageService = require('../../services/tontine/partage.service');
const { repondreErreur } = require('./tontine.groupe');

// =====================================================================
//  Caisse 2 — epargne, credit, casse annuelle.
// =====================================================================

// --- Epargne ---------------------------------------------------------

// POST /tontine/groupes/:groupeId/epargne
const apporter = async (req, res) => {
    try {
        const r = await EpargneService.apporter(req.user.id, req.params.groupeId, req.body.montant);
        return res.status(201).json({
            message: `Apport enregistre. Votre part dans la caisse s'eleve a ${r.monApportTotal} FCFA.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/epargne
const etatEpargne = async (req, res) => {
    try {
        return res.status(200).json(await EpargneService.etat(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/epargne/mes-apports
const mesApports = async (req, res) => {
    try {
        return res.status(200).json(await EpargneService.mesApports(req.user.id, req.query.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// --- Credit ----------------------------------------------------------

// POST /tontine/groupes/:groupeId/credits
const demanderCredit = async (req, res) => {
    try {
        const r = await CreditService.demander(req.user.id, req.params.groupeId, req.body);
        return res.status(201).json({
            message: `Demande enregistree : ${r.calcul.capital} FCFA a rembourser ${r.calcul.total} FCFA (${r.calcul.interets} d'interets). Un scrutin est ouvert, le groupe doit l'approuver.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/credits
const creditsGroupe = async (req, res) => {
    try {
        return res.status(200).json(await CreditService.demandesGroupe(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/credits/mes-credits
const mesCredits = async (req, res) => {
    try {
        return res.status(200).json(await CreditService.mesDemandes(req.user.id));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/credits/:demandeId/echeancier
const echeancier = async (req, res) => {
    try {
        return res.status(200).json(await CreditService.echeancier(req.user.id, req.params.demandeId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/credits/:demandeId/decaisser
const decaisser = async (req, res) => {
    try {
        const r = await CreditService.decaisser({ clientId: req.user.id }, req.params.demandeId);
        return res.status(200).json({
            message: `Credit decaisse. ${r.echeances} echeances de ${r.mensualite} FCFA, total a rembourser ${r.totalARembourser} FCFA.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/remboursements/:remboursementId/payer
const rembourser = async (req, res) => {
    try {
        const r = await CreditService.rembourser(req.user.id, req.params.remboursementId, req.body.montant);
        return res.status(200).json({
            message: r.creditSolde
                ? 'Echeance reglee. Votre credit est entierement rembourse.'
                : `Echeance reglee. Il reste ${r.echeancesRestantes} echeance(s).`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// --- Casse annuelle --------------------------------------------------

// GET /tontine/groupes/:groupeId/partage/simulation
const simulerPartage = async (req, res) => {
    try {
        return res.status(200).json(await PartageService.simuler(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/:groupeId/partage
const cloturerExercice = async (req, res) => {
    try {
        const r = await PartageService.cloturer({ clientId: req.user.id }, req.params.groupeId, req.body.exercice);
        return res.status(200).json({
            message: `Exercice ${r.exercice} cloture : ${r.totalDistribue} FCFA repartis entre ${r.partage.nbBeneficiaires} membre(s), dont ${r.produitPartage} FCFA de produit.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/partage
const historiquePartages = async (req, res) => {
    try {
        return res.status(200).json(await PartageService.historique(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

module.exports = {
    apporter, etatEpargne, mesApports,
    demanderCredit, creditsGroupe, mesCredits, echeancier, decaisser, rembourser,
    simulerPartage, cloturerExercice, historiquePartages
};

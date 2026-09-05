const { PaiementService } = require('../../services/paiement/paiement.service');
const { FapshiService } = require('../../services/paiement/fapshi.service');

// =====================================================================
//  Paiements reels via Fapshi.
// =====================================================================

function repondreErreur(res, e) {
    if (e && (e.name === 'ErreurPaiement' || e.name === 'ErreurFapshi' || e.name === 'ErreurTontine')) {
        return res.status(e.code || 400).json({ error: e.message });
    }
    console.error('[paiement] ', e);
    return res.status(500).json({ error: e.message || 'Erreur interne' });
}

// POST /paiement/recharge
const recharger = async (req, res) => {
    try {
        const r = await PaiementService.initierRecharge(req.user.id, req.body);
        return res.status(201).json(r);
    } catch (e) { return repondreErreur(res, e); }
};

// POST /paiement/retrait
const retirer = async (req, res) => {
    try {
        const r = await PaiementService.initierRetrait(req.user.id, req.body);
        return res.status(201).json(r);
    } catch (e) { return repondreErreur(res, e); }
};

// GET /paiement/:reference/verifier
// L'application interroge cette route apres le paiement. C'est le chemin
// principal en developpement, ou Fapshi ne peut pas joindre une machine
// sur un reseau local.
const verifier = async (req, res) => {
    try {
        await PaiementService.detail(req.user.id, req.params.reference);
        const r = await PaiementService.confirmer(req.params.reference);
        return res.status(200).json(r);
    } catch (e) { return repondreErreur(res, e); }
};

// GET /paiement/mes-paiements
const mesPaiements = async (req, res) => {
    try {
        return res.status(200).json({ paiements: await PaiementService.mesPaiements(req.user.id) });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /paiement/etat
const etatService = async (req, res) => {
    try {
        if (!FapshiService.configure()) {
            return res.status(200).json({ disponible: false, motif: 'Fapshi non configure' });
        }
        const solde = await FapshiService.solde();
        return res.status(200).json({ disponible: true, mode: FapshiService.mode, service: solde });
    } catch (e) {
        return res.status(200).json({ disponible: false, motif: e.message });
    }
};

// POST /paiement/webhook   (public — Fapshi n'envoie aucun jeton)
//
// On repond 200 quoi qu'il arrive : un rappel non acquitte est reessaye
// en boucle par le fournisseur. Le corps recu ne sert qu'a identifier
// l'operation ; son statut n'est jamais cru, il est redemande a l'API.
const webhook = async (req, res) => {
    try {
        const r = await PaiementService.traiterWebhook(req.body);
        return res.status(200).json({ recu: true, ...r });
    } catch (e) {
        console.error('[paiement] webhook :', e.message, JSON.stringify(req.body || {}).slice(0, 300));
        return res.status(200).json({ recu: true, traite: false, motif: e.message });
    }
};

module.exports = { recharger, retirer, verifier, mesPaiements, etatService, webhook };

const { RestrictionService } = require('../../services/restriction.service');
const EligibiliteService = require('../../services/tontine/eligibilite.service');
const KycService = require('../../services/kyc.service');
const { Client } = require('../../models/index');

// =====================================================================
//  Restrictions et decisions d'eligibilite, cote administration.
//
//  Une restriction ferme une porte precise — rejoindre, encherir,
//  recevoir un pot, reprendre une garantie, creer une tontine — sans
//  desactiver le compte : le membre peut toujours consulter, payer ses
//  dettes et contester. Chaque pose et chaque levee sont journalisees.
// =====================================================================

function repondre(res, e) {
    if (e && Number.isInteger(e.code) && e.code >= 400 && e.code < 600) {
        return res.status(e.code).json({ success: false, error: e.message });
    }
    console.error('[restrictions]', e);
    return res.status(500).json({ success: false, error: e.message });
}

// GET /api/admin/restriction/types
const types = async (req, res) => res.json({ success: true, data: RestrictionService.types() });

// GET /api/admin/restriction/client/:clientId
//
// Tout ce qui limite un client, et pourquoi : niveau KYC, restrictions en
// vigueur, dernieres decisions d'eligibilite.
const situationClient = async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.clientId);
        if (!client) return res.status(404).json({ success: false, error: 'Client introuvable' });
        const restrictions = await RestrictionService.actives(client.id);
        const decisions = await EligibiliteService.historique(client.id);
        return res.json({
            success: true,
            data: {
                client: { id: client.id, nom: client.nom, email: client.email, isActive: client.isActive },
                kyc: KycService.etat(client),
                restrictions: restrictions.map(r => RestrictionService.vue(r)),
                decisions: decisions.map(d => ({
                    id: d.id, operation: d.operation, resultat: d.resultat, groupeId: d.groupeId,
                    cycleId: d.cycleId, date: d.createdAt, versionMoteur: d.versionMoteur,
                    refus: (d.controles || []).filter(c => !c.ok).map(c => c.motif)
                }))
            }
        });
    } catch (e) { return repondre(res, e); }
};

// POST /api/admin/restriction   { clientId, type, motif, actifJusqu? }
const poser = async (req, res) => {
    try {
        const r = await RestrictionService.poser({ admin: req.admin }, req.body, req);
        return res.status(201).json({ success: true, data: RestrictionService.vue(r) });
    } catch (e) { return repondre(res, e); }
};

// POST /api/admin/restriction/:id/lever   { motif? }
const lever = async (req, res) => {
    try {
        const r = await RestrictionService.lever({ admin: req.admin }, req.params.id, req.body && req.body.motif, req);
        return res.json({ success: true, data: RestrictionService.vue(r) });
    } catch (e) { return repondre(res, e); }
};

module.exports = { types, situationClient, poser, lever };

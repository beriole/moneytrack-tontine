const { journaliser } = require('../../services/audit.service');

// =====================================================================
//  Journalisation d'un acte d'administration.
//
//  L'implementation vit desormais dans services/audit.service.js, ou les
//  services metier peuvent l'atteindre : AuditLog n'acceptait qu'un
//  administrateur, si bien qu'un pot verse par un president ou une caution
//  saisie par la regle de recouvrement ne laissaient aucune trace.
//
//  Cette fonction reste : quarante appels la nomment, et sa signature —
//  (req, action, cible, details, statut) — est commode depuis un
//  controleur. Elle n'est plus qu'une facade.
// =====================================================================

// Best-effort, ne bloque jamais la reponse.
async function logAction(req, action, cible, details = null, statut = 'SUCCESS') {
    return journaliser({
        acteur: { admin: req.admin },
        action,
        cible,
        details,
        statut,
        req
    });
}

module.exports = { logAction };

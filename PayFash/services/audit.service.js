'use strict';

const { AuditLog } = require('../models');

// =====================================================================
//  Le journal d'audit, pour tous les acteurs.
//
//  Il n'existait que sous la forme de logAction(req, ...), dans
//  Controllers/admin/audit.js : il lisait req.admin, et n'etait donc
//  appelable que depuis une route d'administration. Les services metier —
//  la ou l'argent bouge — n'avaient aucun moyen de journaliser quoi que ce
//  soit. Un pot de 500 000 FCFA se versait sans laisser de trace d'audit.
//
//  Deux differences avec la journalisation des notifications :
//
//    - une notification manquee est un desagrement, une ecriture d'audit
//      manquee est un trou dans la piste. Quand une transaction SQL est
//      fournie, l'ecriture s'y inscrit : l'acte et sa trace sont commits
//      ensemble, ou aucun des deux ;
//    - hors transaction, on reste en best-effort — journaliser ne doit
//      jamais faire echouer une operation deja accomplie.
// =====================================================================

/**
 * Normalise un acteur en { type, id, libelle }.
 *
 * Accepte ce que les differentes couches ont sous la main :
 *
 *   { systeme: true }                  le planificateur, le recouvrement
 *   { clientId, nom }                  un membre, un president
 *   { admin: <Admin> } ou un req       l'administration
 *   { service: 'fapshi' }              une API externe
 */
function normaliser(acteur) {
    if (!acteur) return { type: 'SYSTEME', id: null, libelle: 'MoneyTrack' };

    if (acteur.systeme === true) {
        return { type: 'SYSTEME', id: null, libelle: acteur.libelle || 'MoneyTrack' };
    }
    if (acteur.service) {
        return { type: 'SERVICE_EXTERNE', id: null, libelle: String(acteur.service) };
    }

    // Un objet requete d'administration : req.admin est pose par verifyAdmin.
    const admin = acteur.admin || (acteur.headers && acteur.admin);
    if (admin) {
        return { type: 'ADMIN', id: admin.id || null, libelle: admin.email || null };
    }
    if (acteur.adminId) {
        return { type: 'ADMIN', id: acteur.adminId, libelle: acteur.adminEmail || null };
    }
    if (acteur.clientId) {
        return { type: 'CLIENT', id: parseInt(acteur.clientId, 10), libelle: acteur.nom || null };
    }
    return { type: 'SYSTEME', id: null, libelle: 'MoneyTrack' };
}

/** Adresse de l'appelant, quand l'acte vient d'une requete HTTP. */
function adresse(req) {
    if (!req || !req.headers) return null;
    return req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || null;
}

/**
 * Inscrit un acte au journal.
 *
 * @param {object}  e
 * @param {object}  e.acteur     voir normaliser()
 * @param {string}  e.action     verbe stable en majuscules : TONTINE_POT_VERSE
 * @param {string}  [e.cible]    'TontineCycle#42'
 * @param {object}  [e.details]  avant / apres, montants, motif
 * @param {string}  [e.statut]   SUCCESS (defaut) ou FAILURE
 * @param {object}  [e.req]      requete HTTP, pour l'adresse et requestId
 * @param {object}  [e.transaction] transaction SQL de l'acte journalise
 */
async function journaliser(e) {
    const a = normaliser(e.acteur);
    const ligne = {
        acteurType: a.type,
        acteurId: a.id,
        acteurLibelle: a.libelle,
        // Doublons conserves : le back-office lit encore ces deux colonnes.
        adminId: a.type === 'ADMIN' ? a.id : null,
        adminEmail: a.type === 'ADMIN' ? a.libelle : null,
        action: e.action,
        cible: e.cible || null,
        details: e.details || null,
        ip: e.ip || adresse(e.req),
        requestId: e.requestId || (e.req && e.req.headers && e.req.headers['x-request-id']) || null,
        statut: e.statut || 'SUCCESS'
    };

    // Dans une transaction, l'echec doit remonter : c'est le prix de
    // l'atomicite entre l'acte et sa trace.
    if (e.transaction) {
        return AuditLog.create(ligne, { transaction: e.transaction });
    }

    try {
        return await AuditLog.create(ligne);
    } catch (err) {
        console.error("[audit] ecriture impossible :", err.message);
        return null;
    }
}

module.exports = { journaliser, normaliser };

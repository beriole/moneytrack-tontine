const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.tontine');
const { requireRole } = require('../../middleware/verifyAdmin');

// =====================================================================
//  Back-office tontine.
//
//  Lecture ouverte a tout administrateur authentifie : le support doit
//  pouvoir repondre a un appel sans demander une elevation de droits.
//
//  Ecriture reservee : geler un groupe suspend l'argent de plusieurs
//  personnes, ce n'est pas une action de consultation. Et le versement
//  force n'est meme pas ici : il passe par /api/admin/validation, qui
//  exige deux administrateurs distincts.
// =====================================================================

// --- Consultation ---
route.get('/stats', CONTROLLER.stats);
route.get('/anomalies', CONTROLLER.anomalies);
route.get('/groupes', CONTROLLER.listeGroupes);
route.get('/groupes/:id', CONTROLLER.detailGroupe);
route.get('/membres/:clientId', CONTROLLER.ficheClient);

// --- Export ---
route.get('/export', requireRole('ADMIN_FINANCE', 'COMPLIANCE'), CONTROLLER.exporter);

// --- Mesures conservatoires ---
route.post('/groupes/:id/geler', requireRole('ADMIN_FINANCE', 'COMPLIANCE'), CONTROLLER.geler);
route.post('/groupes/:id/degeler', requireRole('ADMIN_FINANCE', 'COMPLIANCE'), CONTROLLER.degeler);

module.exports = route;

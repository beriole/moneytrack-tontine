const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/client/client.budget.advanced');
const verifyToken = require('../../middleware/verificationtoken');

// ============================================
// Routes Budget Avancés
// ============================================

// Budget cyclique
route.post('/cyclique', verifyToken, CONTROLLER.creerBudgetCyclique);
route.post('/:budgetId/renouveler', verifyToken, CONTROLLER.renouvelBudget);

// Alertes
route.get('/alertes', verifyToken, CONTROLLER.getBudgetsAvecAlertes);
route.put('/:budgetId/depenses', verifyToken, CONTROLLER.mettreAJourDepensesBudget);

// Budget collaboratif
route.post('/:budgetId/inviter', verifyToken, CONTROLLER.inviterCollaborateur);
route.post('/invitation/:invitationId/repondre', verifyToken, CONTROLLER.repondreInvitation);
route.get('/:budgetId/collaborateurs', verifyToken, CONTROLLER.listerCollaborateurs);

// Budget smart - suggestions IA
route.get('/suggestions', verifyToken, CONTROLLER.getSuggestionsBudget);

module.exports = route;

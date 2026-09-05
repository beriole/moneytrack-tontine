const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/client/controller.epargne.advanced');
const verifyToken = require('../../middleware/verificationtoken');

// ============================================
// Routes Épargne Avancées
// ============================================

// Épargne avec taux d'intérêt
route.post('/avancee', verifyToken, CONTROLLER.creerEpargneAvancee);
route.post('/:epargneId/deposer', verifyToken, CONTROLLER.deposerEpargne);
route.post('/:epargneId/retirer', verifyToken, CONTROLLER.retirerEpargne);

// Simulations
route.get('/simulateur', CONTROLLER.simulatorInterets);

// Objectifs avec progression
route.get('/avec-progression', verifyToken, CONTROLLER.getEpargnesAvecProgression);

// Épargne automatique (Round-up)
route.post('/automatique/configurer', verifyToken, CONTROLLER.configurerEpargneAutomatique);
route.get('/automatique', verifyToken, CONTROLLER.getEpargneAutomatique);
route.post('/automatique/trigger', verifyToken, CONTROLLER.triggerArrondi);
route.post('/automatique/toggle', verifyToken, CONTROLLER.toggleEpargneAutomatique);
route.delete('/automatique', verifyToken, CONTROLLER.supprimerEpargneAutomatique);

// Tire-lire
route.post('/tirelire', verifyToken, CONTROLLER.creerTireLire);

// Citations motivantes
route.get('/citation', CONTROLLER.getCitationMotivation);

module.exports = route;

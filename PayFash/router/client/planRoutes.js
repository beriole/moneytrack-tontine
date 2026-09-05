const express = require('express');
const router = express.Router();
const planController = require('../../Controllers/client/planController');
const verifyToken = require('../../middleware/verificationtoken');

// Routes publiques
router.get('/plans', verifyToken, planController.listerPlans);
router.get('/plan/:planId', verifyToken, planController.getPlanById);

// Souscription et renouvellement
router.post('/plan/souscrire', verifyToken, planController.souscrirePlan);
router.post('/plan/renouveler', verifyToken, planController.renouvelerPlan);

// Admin : créer un plan
router.post('/plan', verifyToken, planController.creerPlan);
router.post("/paiement/create",verifyToken,planController.enregistrerPaiement)
module.exports = router;

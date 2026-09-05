const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/client/client.ai');
const verifyToken = require('../../middleware/verificationtoken');

// ============================================
// Routes Intelligence Artificielle
// ============================================

// Chatbot conversationnel
route.post('/chatbot', verifyToken, CONTROLLER.chatbot);

// Analyse financière complète
route.get('/analyse-financiere', verifyToken, CONTROLLER.analyserSituationFinanciere);

// Recommandations marketplace
route.get('/recommandations', verifyToken, CONTROLLER.getRecommandationsProduits);

// Analyse de sentiments (pour monitoring)
route.post('/sentiment', CONTROLLER.analyserSentiment);

module.exports = route;

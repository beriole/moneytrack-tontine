const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/client/client.ai');
const ASSISTANT = require('../../Controllers/client/client.assistant');
const verifyToken = require('../../middleware/verificationtoken');

// ============================================
// Routes Intelligence Artificielle
// ============================================

// Assistant conversationnel servi par le backend (Groq).
// L'application appelait Groq directement, avec la cle embarquee dans son
// bundle : elle passe desormais par ici. Jeton exige — sans quoi la route
// serait un LLM gratuit pour le premier venu.
route.get('/chat/etat', verifyToken, ASSISTANT.etat);
route.post('/chat', verifyToken, ASSISTANT.chat);

// Chatbot local a base de brain.js, anterieur a l'assistant Groq et
// qu'aucun ecran n'appelle. Conserve tel quel.
route.post('/chatbot', verifyToken, CONTROLLER.chatbot);

// Analyse financière complète
route.get('/analyse-financiere', verifyToken, CONTROLLER.analyserSituationFinanciere);

// Recommandations marketplace
route.get('/recommandations', verifyToken, CONTROLLER.getRecommandationsProduits);

// Analyse de sentiments (pour monitoring). Elle etait la seule route du
// fichier sans jeton.
route.post('/sentiment', verifyToken, CONTROLLER.analyserSentiment);

module.exports = route;

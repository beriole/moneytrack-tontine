const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/client/client.export');
const verifyToken = require('../../middleware/verificationtoken');

// ============================================
// Routes d'export et d'analyse
// ============================================

// Export Excel des transactions
route.get('/transactions/excel', verifyToken, CONTROLLER.exportTransactionsExcel);

// Export PDF des transactions
route.get('/transactions/pdf', verifyToken, CONTROLLER.exportTransactionsPDF);

// Export PDF d'un portefeuille spécifique
route.get('/portefeuille/:walletId/pdf', verifyToken, CONTROLLER.exportRelevéPDF);

// Analyse IA des dépenses
route.get('/analyse', verifyToken, CONTROLLER.analyserDepenses);

module.exports = route;

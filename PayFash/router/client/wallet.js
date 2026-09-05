const express=require('express');
const route=express.Router();
const CONTROLLER=require('../../Controllers/client/client.wallet');
const verifyToken = require('../../middleware/verificationtoken');

// ============================================
// Routes existantes
// ============================================
route.get("/solde",verifyToken,CONTROLLER.solde);
route.post("/deposit",verifyToken,CONTROLLER.depot);
route.post("/withdraw",verifyToken,CONTROLLER.retrait);
route.post("/transfer",verifyToken,CONTROLLER.transfer);
route.get("/transactions",verifyToken,CONTROLLER.transaction);

// ============================================
// Nouvelles routes - Sous-comptes illimités
// ============================================

// Créer un nouveau portefeuille personnalisé
route.post("/create", verifyToken, CONTROLLER.creerPortefeuille);

// Lister tous les portefeuille avec filtres
route.get("/list", verifyToken, CONTROLLER.listerPortefeuilles);

// Obtenir les détails d'un portefeuille spécifique
route.get("/:walletId", verifyToken, CONTROLLER.getPortefeuilleDetails);

// Modifier un portefeuille
route.put("/:walletId", verifyToken, CONTROLLER.modifierPortefeuille);

// Supprimer/désactiver un portefeuille
route.delete("/:walletId", verifyToken, CONTROLLER.supprimerPortefeuille);

// Définir un objectif d'épargne
route.post("/:walletId/objectif", verifyToken, CONTROLLER.setObjectifEpargne);

// Vérifier les objectifs atteints
route.get("/objectifs/check", verifyToken, CONTROLLER.checkObjectifsAtteints);

module.exports=route;

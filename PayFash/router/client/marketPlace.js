const express=require('express');
const route=express.Router();
const CONTROLLER=require('../../Controllers/client/client.marketplace');
const verifyToken=require('../../middleware/verificationtoken');

// Panier et commandes sont nominatifs : aucune de ces routes ne doit etre
// ouverte. (Le controleur est encore un jeu de reponses fixes — voir l'audit.)
route.get("/produit",verifyToken,CONTROLLER.listeProduits);
route.get("/produit/:id",verifyToken,CONTROLLER.detailsProduit);
route.get("/categorie",verifyToken,CONTROLLER.categorieProduits);
route.post("/panier/produit",verifyToken,CONTROLLER.ajouterPanier);
route.get("/panier",verifyToken,CONTROLLER.consulterPanier)
route.delete("/panier/:items",verifyToken,CONTROLLER.supprimerDuPanier);
route.post("/commande",verifyToken,CONTROLLER.passerCommande);
route.get("/commande",verifyToken,CONTROLLER.consulterCommande);
route.get("/commande/:id",verifyToken,CONTROLLER.detailsCommande);
route.post("/commande/:id/retour",verifyToken,CONTROLLER.demandeRetour);


module.exports=route;
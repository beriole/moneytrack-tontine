const express=require('express');
const route=express.Router();
const CONTROLLER=require('../../Controllers/vendors/vendors.boutique.controllers');
route.post("/connexion",CONTROLLER.connexion);
route.post("/deconnexion",CONTROLLER.deconnexion);
route.post("/produits/agent",CONTROLLER.ajouterProduit);
route.patch("/produit/:id",CONTROLLER.modifierProduit);
route.delete("/produit/:id",CONTROLLER.supprimerProduit);
route.post("/categorie",CONTROLLER.creerCategorie);
route.get("/produits",CONTROLLER.listeProduits);
route.get("/commande",CONTROLLER.listeCommande);
route.patch("/commande/:id",CONTROLLER.changerStatusCommande);
route.get("/solde",CONTROLLER.soldeMarchand);
route.get("/paiement",CONTROLLER.paiement);


module.exports=route;
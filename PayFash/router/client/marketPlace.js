const express=require('express');
const route=express.Router();
const CONTROLLER=require('../../Controllers/client/client.marketplace');
route.get("/produit",CONTROLLER.listeProduits);
route.get("/produit/:id",CONTROLLER.detailsProduit);
route.get("/categorie",CONTROLLER.categorieProduits);
route.post("/panier/produit",CONTROLLER.ajouterPanier);
route.get("/panier",CONTROLLER.consulterPanier)
route.delete("/panier/:items",CONTROLLER.supprimerDuPanier);
route.post("/commande",CONTROLLER.passerCommande);
route.get("/commande",CONTROLLER.consulterCommande);
route.get("/commande/:id",CONTROLLER.detailsCommande);
route.post("/commande/:id/retour",CONTROLLER.demandeRetour);


module.exports=route;
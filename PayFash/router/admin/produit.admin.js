const express= require('express');
const route= express.Router();
const CONTROLLER=require('../../Controllers/admin/admin.marketplace');
const { requireRole } = require('../../middleware/verifyAdmin');
route.get("/produit",CONTROLLER.listeProduits);
route.delete("/produit/:id",requireRole('MARKETING'),CONTROLLER.supprimerProduit);
route.post("/produitadd",requireRole('MARKETING'),CONTROLLER.ajouterProduit);
route.patch("/produitUpdate/:id",requireRole('MARKETING'),CONTROLLER.modifierProduit);

module.exports=route;
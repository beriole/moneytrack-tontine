const express= require('express');
const route= express.Router();
const CONTROLLER=require('../../Controllers/admin/admin.gestion.users');

route.get("/utilisateur",CONTROLLER.listeUtilisateurs);
route.get("/utilisateur/:id/detail",CONTROLLER.detailsUtilisateurs);
route.delete("/utilisateur/:id",CONTROLLER.supressionUtilisateur);
route.post("/Agentkyc",CONTROLLER.creerAgentKYC);
route.post("/Agentsellers",CONTROLLER.creerAgentSeller);
route.patch("/utilisateur/:id",CONTROLLER.desactivation);

module.exports=route;
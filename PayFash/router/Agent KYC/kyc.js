const express=require('express');
const route=express.Router();
const CONTROLLER=require('../../Controllers/kyc/kyc.controller');
route.post("/login",CONTROLLER.connexion);
route.post("/logout",CONTROLLER.deconnexion);
route.patch("/profile",CONTROLLER.informationsProfile);
route.get("/demande",CONTROLLER.listeDemande);
route.get("/demande/:id",CONTROLLER.detailsDemande);
route.patch("/demande/:id/approuve",CONTROLLER.approuverDemande);
route.patch("/demande/:id/rejeter",CONTROLLER.rejeteDemande);
route.patch("/demande/:id/revision",CONTROLLER.encoursRevision);
route.get("/demande/historique",CONTROLLER.historiqueVerification);
route.get("/demande/historique/:id",CONTROLLER.detailsVerification);
route.get("/demande/document/:id",CONTROLLER.telechargerDocument);

module.exports=route;










module.exports=route;
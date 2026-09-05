const express=require('express');
const route=express.Router();
const CONTROLLER=require('../../Controllers/client/client.pret');
const CONTROLLERS=require('../../Controllers/ModelsChatbot');
const verifyToken =require('../../middleware/verificationtoken')
route.get("/listepret",verifyToken,CONTROLLER.liste_des_prets);
route.post("/publieroffre",verifyToken,CONTROLLER.demanderpret);
route.get("/details/:id",verifyToken,CONTROLLER.detailsdepret);
route.patch("/update/:id",CONTROLLER.mettre_a_jour);
route.post("/rembourser/:id",CONTROLLER.effectuer_remboursement);
route.post("/souscrire/:id",CONTROLLER.souscrire_a_un_pret);
route.post("/chiffrer/:id",CONTROLLER.chifferun_pret);
route.post("/chatBot",verifyToken,CONTROLLERS.chatbot)

module.exports=route;

const express=require('express');
const route=express.Router();
//importation du controlleur de la boutique
const CONTROLLER=require('../Controllers/controllers.boutique')
//route vers la creation de la boutique
route.post("/boutique",CONTROLLER.createboutique)





module.exports=route;
const express=require('express');
const route= express.Router();
//importation du controlleur du produit
const CONTROLLER=require('../Controllers/controller.produit');
//route vers la liste de tout les produit
route.get("/getallproduit",CONTROLLER.getallproduit);





module.exports=route;
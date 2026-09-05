const express= require('express');
const route= express.Router();
const CONTROLLER=require('../../Controllers/admin/admin.transactions');
const { requireRole } = require('../../middleware/verifyAdmin');

route.get("/transaction",CONTROLLER.listeTransactions);
route.get("/transactions/:id",CONTROLLER.detailsTransactions);
route.get("/benefices",requireRole('ADMIN_FINANCE'),CONTROLLER.benefices);
route.get("/paiements",CONTROLLER.consulterPaiment);
route.get("/pret",CONTROLLER.listePrets);
route.get("/prets/:id",CONTROLLER.detailsPret);
// Opérations financières sensibles
route.post("/:id/rembourser",requireRole('ADMIN_FINANCE'),CONTROLLER.rembourser);
route.post("/wallet/ajuster",requireRole('ADMIN_FINANCE'),CONTROLLER.ajusterWallet);

module.exports=route;

const express= require('express');
const route= express.Router();
const CONTROLLER=require('../../Controllers/admin/admin.transactions');
const { requireRole } = require('../../middleware/verifyAdmin');

route.get("/transaction",CONTROLLER.listeTransactions);
route.get("/transactions/:id",CONTROLLER.detailsTransactions);
route.get("/benefices",requireRole('ADMIN_FINANCE'),CONTROLLER.benefices);
route.get("/paiements",CONTROLLER.consulterPaiment);
// Operations financieres sensibles.
// Ces routes n'executent plus rien : elles ouvrent une demande (volet
// "maker"). L'execution reclame l'approbation d'un SECOND administrateur,
// via POST /api/admin/validation/:id/approuver. Reponse : 202.
route.post("/:id/rembourser",requireRole('ADMIN_FINANCE'),CONTROLLER.rembourser);
route.post("/wallet/ajuster",requireRole('ADMIN_FINANCE'),CONTROLLER.ajusterWallet);

module.exports=route;

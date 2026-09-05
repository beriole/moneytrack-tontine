const express= require('express');
const route= express.Router();
const CONTROLLER=require('../../Controllers/admin/admin.gestion.kyc');
const { requireRole } = require('../../middleware/verifyAdmin');
route.get("/demandeAky",CONTROLLER.listeDemande);
route.get("/demandeAkyc/:id",CONTROLLER.detailsDemande);
route.patch("/demandeAkyc/:id/approuve",requireRole('COMPLIANCE'),CONTROLLER.approuverDemande);
route.patch("/demandeAkyc/:id/rejeter",requireRole('COMPLIANCE'),CONTROLLER.rejeteDemande);

module.exports=route;
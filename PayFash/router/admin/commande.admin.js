const express= require('express');
const route= express.Router();
const CONTROLLER=require('../../Controllers/admin/admin.gestion.kyc');
const { requireRole } = require('../../middleware/verifyAdmin');
route.get("/demandeAky",CONTROLLER.listeDemande);
route.get("/demandeAkyc/:id",CONTROLLER.detailsDemande);
// L'agent KYC instruit les demandes : c'est la raison d'etre du role.
// La garde ne mentionnait que COMPLIANCE, si bien qu'un compte AGENT_KYC —
// creable depuis POST /api/admin/Agentkyc — pouvait se connecter au
// back-office sans avoir le droit d'approuver ni de rejeter quoi que ce
// soit. C'etait le seul role de la plateforme sans aucune action permise.
route.patch("/demandeAkyc/:id/approuve",requireRole('COMPLIANCE'),CONTROLLER.approuverDemande);
route.patch("/demandeAkyc/:id/rejeter",requireRole('COMPLIANCE'),CONTROLLER.rejeteDemande);

module.exports=route;
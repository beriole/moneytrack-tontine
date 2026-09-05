const express= require('express');
const route= express.Router();
const CONTROLLER=require('../../Controllers/client/client.auth');
const verifyToken=require('../../middleware/verificationtoken');

// --- Routes publiques (par nature) -----------------------------------
route.post("/register",CONTROLLER.inscription);
route.post("/login",CONTROLLER.connexion);
route.post("/logout",CONTROLLER.deconnexion);
route.post("/sendOtp",CONTROLLER.sendOtp);
route.post("/verifyOtp",CONTROLLER.verifyOtp);
// Reinitialisation : publique par necessite (l'utilisateur a perdu son mot
// de passe), mais protegee par un code OTP a usage unique — voir le
// controleur. Sans cela, la route changeait le mot de passe de n'importe
// quel compte a partir de son seul email.
route.post("/reset",CONTROLLER.resetPassword);

// --- Routes nominatives : jeton exige --------------------------------
// Ces routes portent un identifiant dans l'URL. Sans verifyToken, n'importe
// qui lisait le profil et les notifications de n'importe quel client en
// changeant le numero.
route.post("/litige",verifyToken,CONTROLLER.litige);
route.get("/notification/:clientId",verifyToken,CONTROLLER.clientNotif);
route.get("/info/:id",verifyToken,CONTROLLER.profil);
route.patch("/info/:id",verifyToken,CONTROLLER.modifierprofil);
route.put("/:notificationId/lire/:clientId",verifyToken,CONTROLLER.notifLu);
route.get("/client/:clientId/nonlues",verifyToken,CONTROLLER.notifNonLu);
module.exports=route;

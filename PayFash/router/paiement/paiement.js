const express = require('express');
const route = express.Router();
const verifyToken = require('../../middleware/verificationtoken');
const PAIE = require('../../Controllers/paiement/paiement.controller');

// =====================================================================
//  Paiements reels (Fapshi).
// =====================================================================

// Le webhook est public : Fapshi n'envoie aucun jeton. La securite ne
// repose donc pas sur l'authentification de l'appelant mais sur le fait
// que le corps recu n'est jamais cru — le statut est toujours redemande
// a l'API avant qu'un solde bouge.
route.post("/webhook", PAIE.webhook);

route.get("/etat", verifyToken, PAIE.etatService);
route.get("/mes-paiements", verifyToken, PAIE.mesPaiements);
route.post("/recharge", verifyToken, PAIE.recharger);
route.post("/retrait", verifyToken, PAIE.retirer);
route.get("/:reference/verifier", verifyToken, PAIE.verifier);

module.exports = route;

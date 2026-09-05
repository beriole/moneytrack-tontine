const express = require("express");
const router = express.Router();
const EpargneController = require("../../Controllers/client/controller.epargne");
const verifyToken =require('../../middleware/verificationtoken')

router.post("/epargnes",verifyToken,EpargneController.creerEpargne);

router.get("/epargnes",verifyToken,EpargneController.listerEpargnes);


router.post("/epargnes/:epargneId/transactions",EpargneController.ajouterTransaction);


router.delete("/epargnes/:epargneId", verifyToken,EpargneController.supprimerEpargne);


router.get("/epargnes/:epargneId/statistiques",verifyToken, EpargneController.getStatistiquesEpargne);

module.exports = router;

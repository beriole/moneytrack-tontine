const express = require('express');
const route = express.Router();
const verifyToken = require('../../middleware/verificationtoken');
const GROUPE = require('../../Controllers/tontine/tontine.groupe');
const CYCLE = require('../../Controllers/tontine/tontine.cycle');
const DISC = require('../../Controllers/tontine/tontine.discipline');
const GOUV = require('../../Controllers/tontine/tontine.gouvernance');
const EPAR = require('../../Controllers/tontine/tontine.epargne');
const SYNT = require('../../Controllers/tontine/tontine.synthese');

// =====================================================================
//  Module tontine — caisse 1 (le tour rotatif).
//  Tout est reserve aux membres : aucune route publique, aucun
//  contributeur anonyme.
// =====================================================================

// =====================================================================
//  Synthese — la tontine vue depuis le reste de MoneyTrack.
//  Ces routes viennent en tete : ce sont elles que l'accueil interroge.
// =====================================================================
route.get("/synthese", verifyToken, SYNT.synthese);
route.get("/synthese/solde", verifyToken, SYNT.soldeReel);
route.get("/synthese/tresorerie", verifyToken, SYNT.tresorerie);
route.get("/synthese/financement", verifyToken, SYNT.financement);

// --- Groupes ---------------------------------------------------------
route.post("/groupes", verifyToken, GROUPE.creer);
route.get("/groupes/mes-groupes", verifyToken, GROUPE.mesGroupes);
route.post("/groupes/rejoindre", verifyToken, GROUPE.rejoindre);
// Apres les routes litterales, sinon "mes-groupes" serait pris pour un id
route.get("/groupes/:groupeId", verifyToken, GROUPE.details);
route.post("/groupes/:groupeId/demarrer", verifyToken, GROUPE.demarrer);

// --- Cycles ----------------------------------------------------------
route.get("/cycles/:cycleId/cotisations", verifyToken, CYCLE.etat);
route.post("/cycles/:cycleId/cotiser", verifyToken, CYCLE.cotiser);
route.post("/cycles/:cycleId/verser", verifyToken, CYCLE.verser);

// =====================================================================
//  Caisse 4 — discipline et garanties
// =====================================================================

// --- Caution ---------------------------------------------------------
route.get("/cautions/mes-cautions", verifyToken, DISC.mesCautions);
route.post("/cautions/:cautionId/liberer", verifyToken, DISC.libererCaution);
route.post("/groupes/:groupeId/caution", verifyToken, DISC.bloquerCaution);
route.get("/groupes/:groupeId/cautions", verifyToken, DISC.cautionsGroupe);

// --- Amendes ---------------------------------------------------------
route.get("/amendes/mes-amendes", verifyToken, DISC.mesAmendes);
route.post("/amendes/:amendeId/payer", verifyToken, DISC.payerAmende);
route.post("/amendes/:amendeId/annuler", verifyToken, DISC.annulerAmende);
route.post("/groupes/:groupeId/amendes", verifyToken, DISC.infligerAmende);
route.get("/groupes/:groupeId/amendes", verifyToken, DISC.amendesGroupe);

// --- Cascade de recours ----------------------------------------------
route.put("/groupes/:groupeId/garant", verifyToken, DISC.designerGarant);
route.post("/groupes/:groupeId/exclure", verifyToken, DISC.exclure);
route.get("/cotisations/:cotisationId/recouvrement", verifyToken, DISC.etatRecouvrement);
route.post("/cotisations/:cotisationId/saisir-caution", verifyToken, DISC.saisirCaution);
route.post("/cotisations/:cotisationId/appeler-garant", verifyToken, DISC.appelerGarant);

// =====================================================================
//  Gouvernance
// =====================================================================

// --- Votes -----------------------------------------------------------
route.get("/votes/:voteId", verifyToken, GOUV.detailVote);
route.post("/votes/:voteId/repondre", verifyToken, GOUV.repondreVote);
route.post("/votes/:voteId/depouiller", verifyToken, GOUV.depouillerVote);
route.post("/groupes/:groupeId/votes", verifyToken, GOUV.creerVote);
route.get("/groupes/:groupeId/votes", verifyToken, GOUV.votesGroupe);

// --- Marche des tours ------------------------------------------------
route.get("/echanges/mes-echanges", verifyToken, GOUV.mesEchanges);
route.post("/echanges/:echangeId/accepter", verifyToken, GOUV.accepterEchange);
route.post("/echanges/:echangeId/refuser", verifyToken, GOUV.refuserEchange);
route.post("/echanges/:echangeId/annuler", verifyToken, GOUV.annulerEchange);
route.post("/groupes/:groupeId/echanges", verifyToken, GOUV.proposerEchange);
route.get("/groupes/:groupeId/echanges", verifyToken, GOUV.echangesGroupe);

// --- Encheres --------------------------------------------------------
route.post("/encheres/:enchereId/retirer", verifyToken, GOUV.retirerEnchere);
route.get("/cycles/:cycleId/enchere", verifyToken, GOUV.offresEnchere);
route.post("/cycles/:cycleId/enchere/ouvrir", verifyToken, GOUV.ouvrirEnchere);
route.post("/cycles/:cycleId/enchere/offrir", verifyToken, GOUV.offrirEnchere);
route.post("/cycles/:cycleId/enchere/adjuger", verifyToken, GOUV.adjugerEnchere);

// --- Reglement interieur ---------------------------------------------
route.post("/reglements/:contratId/signer", verifyToken, GOUV.signerReglement);
route.get("/groupes/:groupeId/reglement/versions", verifyToken, GOUV.versionsReglement);
route.post("/groupes/:groupeId/reglement", verifyToken, GOUV.genererReglement);
route.get("/groupes/:groupeId/reglement", verifyToken, GOUV.reglementCourant);

// =====================================================================
//  Caisse 2 — epargne, credit, casse annuelle
// =====================================================================

// --- Epargne ---------------------------------------------------------
route.get("/epargne/mes-apports", verifyToken, EPAR.mesApports);
route.post("/groupes/:groupeId/epargne", verifyToken, EPAR.apporter);
route.get("/groupes/:groupeId/epargne", verifyToken, EPAR.etatEpargne);

// --- Credit ----------------------------------------------------------
route.get("/credits/mes-credits", verifyToken, EPAR.mesCredits);
route.get("/credits/:demandeId/echeancier", verifyToken, EPAR.echeancier);
route.post("/credits/:demandeId/decaisser", verifyToken, EPAR.decaisser);
route.post("/remboursements/:remboursementId/payer", verifyToken, EPAR.rembourser);
route.post("/groupes/:groupeId/credits", verifyToken, EPAR.demanderCredit);
route.get("/groupes/:groupeId/credits", verifyToken, EPAR.creditsGroupe);

// --- Casse annuelle --------------------------------------------------
route.get("/groupes/:groupeId/partage/simulation", verifyToken, EPAR.simulerPartage);
route.post("/groupes/:groupeId/partage", verifyToken, EPAR.cloturerExercice);
route.get("/groupes/:groupeId/partage", verifyToken, EPAR.historiquePartages);

// --- Liens avec le budget et les projets ------------------------------
route.get("/groupes/:groupeId/liens", verifyToken, SYNT.etatLiens);
route.post("/groupes/:groupeId/lier-budget", verifyToken, SYNT.lierBudget);
route.delete("/groupes/:groupeId/lier-budget", verifyToken, SYNT.delierBudget);
route.get("/groupes/:groupeId/destinations", verifyToken, SYNT.destinations);
route.put("/groupes/:groupeId/destination-tour", verifyToken, SYNT.routerTour);

// --- Mandat de prelevement -------------------------------------------
route.get("/groupes/:groupeId/prelevement", verifyToken, SYNT.etatPrelevement);
route.post("/groupes/:groupeId/prelevement", verifyToken, SYNT.activerPrelevement);
route.delete("/groupes/:groupeId/prelevement", verifyToken, SYNT.desactiverPrelevement);

module.exports = route;

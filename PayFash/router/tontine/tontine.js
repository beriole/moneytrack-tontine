const express = require('express');
const route = express.Router();
const verifyToken = require('../../middleware/verificationtoken');
const GROUPE = require('../../Controllers/tontine/tontine.groupe');
const CYCLE = require('../../Controllers/tontine/tontine.cycle');
const DISC = require('../../Controllers/tontine/tontine.discipline');
const GOUV = require('../../Controllers/tontine/tontine.gouvernance');
const SYNT = require('../../Controllers/tontine/tontine.synthese');
const GAR = require('../../Controllers/tontine/tontine.garantie');

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
route.get("/groupes/:groupeId/permissions", verifyToken, GROUPE.permissions);
route.get("/groupes/:groupeId/presidence", verifyToken, GROUPE.etatPresidence);
route.post("/groupes/:groupeId/presidence", verifyToken, GROUPE.transmettrePresidence);
route.post("/groupes/:groupeId/quitter", verifyToken, GROUPE.quitter);

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

// --- Cascade de recours : amende de retard -> caution -> exclusion ----
route.post("/groupes/:groupeId/exclure", verifyToken, DISC.exclure);
route.get("/cotisations/:cotisationId/recouvrement", verifyToken, DISC.etatRecouvrement);
route.post("/cotisations/:cotisationId/saisir-caution", verifyToken, DISC.saisirCaution);

// --- Litiges : contester une operation, preuves conservees -----------
route.get("/litiges/objets", verifyToken, DISC.objetsLitige);
route.get("/litiges/mes-litiges", verifyToken, DISC.mesLitiges);
route.post("/litiges", verifyToken, DISC.ouvrirLitige);

// --- Defauts : politique de recouvrement, incidents, regularisation ---
route.get("/incidents/mes-incidents", verifyToken, DISC.mesIncidents);
route.get("/groupes/:groupeId/incidents", verifyToken, DISC.incidentsGroupe);
route.get("/groupes/:groupeId/recouvrement", verifyToken, DISC.politiqueRecouvrement);
route.post("/cotisations/:cotisationId/regulariser", verifyToken, DISC.regulariser);

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
//  La tontine se limite au tour rotatif. Les routes de la caisse 2 —
//  apports d'epargne, credits entre membres, casse annuelle — ont ete
//  retirees avec elle.
// =====================================================================

// =====================================================================
//  Exposition et garanties — ce qu'un membre doit encore, et ce qui le
//  couvre. Les routes litterales precedent celles a parametre.
// =====================================================================
route.get("/moi/exposition", verifyToken, GAR.monExposition);
route.get("/regles-couverture", verifyToken, GAR.modelesCouverture);
route.get("/moi/situation", verifyToken, GAR.maSituation);
route.get("/moi/risque", verifyToken, GAR.monRisque);
route.get("/garanties", verifyToken, GAR.mesGaranties);
route.get("/garanties/:garantieId", verifyToken, GAR.detail);
route.post("/garanties/:garantieId/liberer", verifyToken, GAR.liberer);
route.get("/groupes/:groupeId/exposition", verifyToken, GAR.expositionGroupe);
route.get("/groupes/:groupeId/couverture", verifyToken, GAR.couvertureGroupe);
route.get("/groupes/:groupeId/eligibilite", verifyToken, GAR.eligibilite);
route.get("/groupes/:groupeId/garanties/sources", verifyToken, GAR.sources);
route.get("/groupes/:groupeId/garanties/simulation", verifyToken, GAR.simulation);
route.get("/groupes/:groupeId/garanties/excedent", verifyToken, GAR.excedent);
route.post("/groupes/:groupeId/garanties/reprendre-excedent", verifyToken, GAR.reprendreExcedent);
route.get("/groupes/:groupeId/garanties", verifyToken, GAR.garantiesGroupe);
route.post("/groupes/:groupeId/garanties", verifyToken, GAR.affecter);

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

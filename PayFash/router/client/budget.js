const express=require('express');
const CONTROLLER=require('../../Controllers/client/client.budget');
const verifyToken =require('../../middleware/verificationtoken')
const route=express.Router();
route.get("/budget",verifyToken,CONTROLLER.budgets);
route.post("/budget/:nom",verifyToken,CONTROLLER.ajouter_categorie)
route.post("/budget",verifyToken,CONTROLLER.creerBudget);
//route.post("/expense",CONTROLLER.ajouter_depense);
route.patch("/budget/:id/:nom/:nomCategorie",verifyToken,CONTROLLER.modifier_categorie);
route.delete("/budget/:nom/:nomCategorie",verifyToken,CONTROLLER.supprimer_categorie);
route.post("/planning",verifyToken,CONTROLLER.planification);
route.get("/statics",verifyToken,CONTROLLER.statistique);
//gestion des projets
route.post('/createProjet',verifyToken, CONTROLLER.creerProjet);
route.delete('/:deleteProjetId',verifyToken, CONTROLLER.supprimerProjet);
route.get('/client/projet',verifyToken, CONTROLLER.listerProjetsClient);
route.get('/projet/:projetId',verifyToken, CONTROLLER.getProjetDetails);
route.get('/budget/:budgetId/:categorieId/depenses', verifyToken, CONTROLLER.listeDepensesCategorieBudget);
route.get('/contexte',verifyToken,CONTROLLER.getContextesUtilisateur);
route.post('/depenses',verifyToken,CONTROLLER.enregistrerDepense);
route.get("/projet/:projetId/categorie/:categorieId/transactions",verifyToken,CONTROLLER.listeTransactionsCategorieProjet);
route.delete("/budget/:budgetId",verifyToken, CONTROLLER.supprimerBudget);
route.get('/projet/:projetId/statistiques',verifyToken,CONTROLLER.getStatistiquesProjet);


module.exports=route;
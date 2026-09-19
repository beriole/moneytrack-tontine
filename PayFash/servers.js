console.log('demarrage du serveur en cour');
const fs=require('fs');
const express =require('express');
const server=express();
//importation du contenue du fichiers d'environnement
const ENV=require('./config/index');
//importation de la base de donnée du modele
const {db}=require('./models')
const cors = require("cors");


//importation des routes de gestion d'action client
const inscription=require('./router/client/authentification');
const wallet=require('./router/client/wallet');
const budgetManager=require('./router/client/budget');
const Plan=require('./router/client/planRoutes')
const Epargne=require('./router/client/epargne')
const exportManager=require('./router/client/export');
const budgetAvance=require('./router/client/budget.advanced');
const projetAvance=require('./router/client/projet.advanced');
const epargneAvance=require('./router/client/epargne.advanced');
const aiManager=require('./router/client/ai');
//module tontine (caisse 1 : le tour rotatif)
const tontineManager=require('./router/tontine/tontine');
//paiements reels via l'agregateur Fapshi
const paiementManager=require('./router/paiement/paiement');
//importation des routes pour l'administrateur
const AdminKYCmanager= require('./router/admin/commande.admin');
const AdminPlanManager= require('./router/admin/produit.admin');
const AdminTransactionManager=require('./router/admin/transactions.admin');
const AdminUserManager=require('./router/admin/users.admin');
const AdminAuthManager=require('./router/admin/auth.admin');
const AdminDashboardManager=require('./router/admin/dashboard.admin');
const AdminLitigeManager=require('./router/admin/litiges.admin');
const AdminConfigManager=require('./router/admin/config.admin');
const AdminAmlManager=require('./router/admin/aml.admin');
const AdminNotifManager=require('./router/admin/notifications.admin');
const AdminValidationManager=require('./router/admin/validation.admin');
const AdminExportManager=require('./router/admin/export.admin');
const { verifyAdmin }=require('./middleware/verifyAdmin');

//midlleware pour la lecture des json
server.use(express.json());
server.use(cors());

// Le back-office. Quarante-six routes d'administration existaient sans la
// moindre interface : le RBAC, le maker-checker et le journal d'audit ne
// s'utilisaient qu'au curl. L'interface est servie ici, a la meme origine
// que l'API — ce qui evite d'ouvrir CORS aux jetons d'administration.
//   http://localhost:3000/backoffice
server.use("/backoffice", express.static(require('path').join(__dirname, 'backoffice')));
//middleware de fonctionnalite pour les clients de l'application
server.use("/auth",inscription);
server.use("/wallet",wallet);
server.use("/budget",budgetManager);
server.use("/plan",Plan);
server.use("/Epargne",Epargne);
server.use("/export",exportManager);
server.use("/budget/advanced",budgetAvance);
server.use("/projet/advanced",projetAvance);
server.use("/epargne/advanced",epargneAvance);
server.use("/ai",aiManager);
server.use("/tontine",tontineManager);
server.use("/paiement",paiementManager);
//middleware pour les agent identificatin
//middleware de gestion administrateur
//  Auth admin : /login public, /me & /create protégés dans le routeur
server.use("/api/admin/auth",AdminAuthManager);
//  Toutes les autres routes admin exigent un JWT admin valide (verifyAdmin)
server.use("/api/admin/dashboard",verifyAdmin,AdminDashboardManager);
server.use("/api/admin/litige",verifyAdmin,AdminLitigeManager);
server.use("/api/admin/config",verifyAdmin,AdminConfigManager);
server.use("/api/admin/aml",verifyAdmin,AdminAmlManager);
server.use("/api/admin/notification",verifyAdmin,AdminNotifManager);
server.use("/api/admin/validation",verifyAdmin,AdminValidationManager);
server.use("/api/admin/tontine",verifyAdmin,require('./router/admin/tontine.admin'));
server.use("/api/admin/export",verifyAdmin,AdminExportManager);
server.use("/api/admin/restriction",verifyAdmin,require('./router/admin/restrictions.admin'));
server.use("/api/admin/kyc",verifyAdmin,AdminKYCmanager);
server.use("/api/admin/transaction",verifyAdmin,AdminTransactionManager);
//  /produit gere en realite le catalogue des PLANS d'abonnement, pas des
//  produits marchands : la boutique a ete retiree, les plans sont restes.
server.use("/api/admin/produit",verifyAdmin,AdminPlanManager);
server.use("/api/admin",verifyAdmin,AdminUserManager);
//synchronisation des modele avec la base de donnee;
const startserver=async ()=>{
    try {
        // La connexion se faisait en effet de bord a l'import de config/bd.js,
        // et son echec n'etait qu'un console.log. Elle est etablie ici, une
        // fois, et son echec arrete le processus (voir le catch).
        console.log("tentative de connexion a la base de donnée");
        await db.authenticate();
        console.log("tentative de synchronisation de la base de donnée");
        // alter:false — un sync simple cree les tables manquantes (CREATE TABLE
        // IF NOT EXISTS) sans reecrire les tables existantes. Avec alter:true,
        // chaque redemarrage tentait de re-aligner les ~35 tables du schema :
        // lent, et destructeur des qu'une colonne est modifiee a la main.
        // Les modifications de tables EXISTANTES passent desormais par
        // migrations/ (npx sequelize-cli db:migrate).
        await db.sync({alter:false});
        console.log("connexion a la base de donnee reussie");
        server.listen(ENV.PORT,"0.0.0.0",_=>{
            console.log('serveur emarrer sur le port 3000 et le domaine localhost');
        });

        // Module tontine : rappels de cotisation, mise en defaut,
        // depouillement des scrutins echus, expiration des echanges.
        // Sans lui, ces traitements existaient sans jamais s'executer.
        require('./services/tontine/planificateur').demarrer();
    } catch (err) {
        // Sans exit, le processus restait vivant sans jamais ecouter : ni
        // serveur, ni erreur visible d'un superviseur. Un demarrage rate doit
        // se voir.
        console.error("demarrage impossible — base de donnée injoignable :", err.message);
        process.exit(1);
    }
} 
startserver();

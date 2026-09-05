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
const loansManager=require('./router/client/loans');
const marketplaceManager=require('./router/client/marketPlace');
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
//importation des routes des gestion des ventes(services en charge des ventes de produits)
const sellerManager=require('./router/vendors/commande.vendors');
//importation des routes de gestion des agents
const kycAgentManager=require('./router/Agent KYC/kyc');
//importation des routes pour l'administrateur
const AdminKYCmanager= require('./router/admin/commande.admin');
const AdminProduitManger= require('./router/admin/produit.admin');
const AdminTransactionManager=require('./router/admin/transactions.admin');
const AdminUserManager=require('./router/admin/users.admin');
const AdminAuthManager=require('./router/admin/auth.admin');
const AdminDashboardManager=require('./router/admin/dashboard.admin');
const AdminLitigeManager=require('./router/admin/litiges.admin');
const AdminPretManager=require('./router/admin/pret.admin');
const AdminConfigManager=require('./router/admin/config.admin');
const AdminAmlManager=require('./router/admin/aml.admin');
const AdminNotifManager=require('./router/admin/notifications.admin');
const AdminValidationManager=require('./router/admin/validation.admin');
const AdminExportManager=require('./router/admin/export.admin');
const { verifyAdmin }=require('./middleware/verifyAdmin');

//midlleware pour la lecture des json
server.use(express.json());
server.use(cors());
//middleware de fonctionnalite pour les clients de l'application
server.use("/auth",inscription);
server.use("/wallet",wallet);
server.use("/budget",budgetManager);
server.use("/plan",Plan);
server.use("/Epargne",Epargne);
server.use("/loans",loansManager);
server.use("/marketplace",marketplaceManager);
server.use("/export",exportManager);
server.use("/budget/advanced",budgetAvance);
server.use("/projet/advanced",projetAvance);
server.use("/epargne/advanced",epargneAvance);
server.use("/ai",aiManager);
server.use("/tontine",tontineManager);
server.use("/paiement",paiementManager);
//middleware pour les agent identificatin
server.use("/api/kyc",kycAgentManager);
//middleware pour le service de vente
server.use("/api/vendors",sellerManager);
//middleware de gestion administrateur
//  Auth admin : /login public, /me & /create protégés dans le routeur
server.use("/api/admin/auth",AdminAuthManager);
//  Toutes les autres routes admin exigent un JWT admin valide (verifyAdmin)
server.use("/api/admin/dashboard",verifyAdmin,AdminDashboardManager);
server.use("/api/admin/litige",verifyAdmin,AdminLitigeManager);
server.use("/api/admin/pret",verifyAdmin,AdminPretManager);
server.use("/api/admin/config",verifyAdmin,AdminConfigManager);
server.use("/api/admin/aml",verifyAdmin,AdminAmlManager);
server.use("/api/admin/notification",verifyAdmin,AdminNotifManager);
server.use("/api/admin/validation",verifyAdmin,AdminValidationManager);
server.use("/api/admin/tontine",verifyAdmin,require('./router/admin/tontine.admin'));
server.use("/api/admin/export",verifyAdmin,AdminExportManager);
server.use("/api/admin/kyc",verifyAdmin,AdminKYCmanager);
server.use("/api/admin/transaction",verifyAdmin,AdminTransactionManager);
server.use("/api/admin/produit",verifyAdmin,AdminProduitManger);
server.use("/api/admin",verifyAdmin,AdminUserManager);
//synchronisation des modele avec la base de donnee;
const startserver=async ()=>{
    try {
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
        console.log("erreur lors de la synchronisation avec la base de donnée",err);
    }
} 
startserver();




//importation des routes
/*
const routerproduit= require('./router/router.produit')
const routerboutique= require('./router/router.boutique')
//creation des prefixe api
server.use("/api/produit",routerproduit)
server.use("/api/boutique",routerboutique)





//recuperation de la liste des produits
server.get("/produit",(req,res)=>{
    const data=produit.filter((p)=>p.id>0)
    res.status(200).json(data)
})

//Ajout  d'un produit
server.post("/produit",(req,res)=>{
    const {id}=req.params;
    const newid=parseInt(id);

    const nouvelid=produit.length+1;
    const {body}=req;
    console.log(body);
  
        const data={
            id:nouvelid,
            ...body
        }
        produit.push(data);
        res.json(data);


});
//modification
server.put("/produit/:id",(req,res)=>{
    const {id}=req.params;
    const newid=parseInt(id);
    const {body}=req;
    const search= produit.find((q)=>q.id===newid);
    if(!search){
        res.json({
            error:"le produit n'existe pas"
        })
    }else{
        search.titre=body.titre;
        search.prix=body.prix;
        produit[search.id]=search;
        res.status(201).json({
            message:"produit modifier avec succes"
        });
    }
})
//suppression des donnees
server.delete("/produit/:id",(req,res)=>{
    const {id}=req.params;
    const newid=parseInt(id);
    const search=produit.find((p)=>p.id===newid);
    if(search){
        produit.splice(produit.indexOf(search),1);
        res.status(2002).json({
            sucess:"produit suprimer avec succes"
        })
    }else{
        res.status(404).json({
            error_message:"produit introuvable"
        })
    }
})
fs.readFile("./.private/public.pem","utf-8",(erreur,data)=>{
    if(erreur){
        console.log(erreur);
    }else{
        console.log(data);
    }
})*/
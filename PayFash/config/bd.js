const Sequelize=require('sequelize');
require('dotenv').config();
const {DATABASE,DBUSER,PORT,DIALECT,DBPASSWORD,HOSTNAME, DBPORT} =require('./index');
const db=new Sequelize(DATABASE,DBUSER,DBPASSWORD,
    {
        host:HOSTNAME,
        port:DBPORT,
        dialect:DIALECT, 
        logging:false
    })
    //DATABASE,USERNAME,PASSWORD
    //connexion a la base de donnée(fonction d'authentification dans server de base de donnée)
    const connexion=async()=>{
        try {
            console.log("tentative de connexion a la base de donnée");

            await db.authenticate();
        } catch (err) {
            console.log("erreur lors de la connexion a la base de donnée",err);
        }
    }
    connexion();
    module.exports=db;
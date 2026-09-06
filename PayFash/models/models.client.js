const {DataTypes}=require('sequelize');
const bd=require('../config/bd');
const client=bd.define("client",{
    nom:{
        type:DataTypes.STRING,
        allowNull:false,
    }
    ,
    email:{
        type:DataTypes.STRING,
        allowNull:false,
        unique:true
    },
     telephone:{
        // Un numero n'est pas un nombre. En INTEGER, un zero initial
        // disparaissait et un numero avec indicatif — 237670000000 — depassait
        // la capacite d'un INT signe (2 147 483 647) : l'insertion echouait ou
        // le numero etait tronque. Tout le code qui le consomme le traite deja
        // comme une chaine (normaliserTelephone, modifierprofil).
        type:DataTypes.STRING(20),
        allowNull:false,
        unique:true
    },
    addresse:{
        // Le controleur d'inscription lisait ce champ dans le corps de la
        // requete, le passait a Client.create et le renvoyait dans sa reponse
        // — alors que le modele ne le declarait pas. Sequelize le jetait en
        // silence : l'adresse etait acceptee, jamais enregistree, et toujours
        // renvoyee vide.
        type:DataTypes.STRING(255),
        allowNull:true
    },
    motDePasse:{
        type:DataTypes.STRING,
        allowNull:false,

    },
    isActive:{
        type:DataTypes.BOOLEAN,
        defaultValue:true,
        allowNull:false
    },
    dateInscription:{
        type:DataTypes.DATE,
        allowNull:false,
        defaultValue:DataTypes.NOW
    },
    isVerified:{
        type:DataTypes.BOOLEAN,
        allowNull:false,
        defaultValue:false
    }

},{timesTamp:true});
module.exports=client;
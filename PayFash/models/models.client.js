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
        type:DataTypes.INTEGER,
        allowNull:false,
        unique:true
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
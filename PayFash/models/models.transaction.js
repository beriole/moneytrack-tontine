const {DataTypes}=require('sequelize');
const bd=require('../config/bd');
const transaction=bd.define("transaction",{
    montant:{
        type:DataTypes.FLOAT,
        allowNull:false,
    },
    date:{
        type:DataTypes.DATE,
        allowNull:false
    },
    type:{
        type:DataTypes.STRING,
        allowNull:false,
        defaultValue:"recharge"
    },

    statut:{
        type:DataTypes.STRING,
        allowNull:false,
        defaultValue:"En confirmation"
    },
    description:{
        type:DataTypes.TEXT,
        allowNull:true
    },
    frais:{
        type:DataTypes.FLOAT,
        allowNull:false,
        defaultValue:100.3
        // NB module tontine : ce defaut de 100,3 FCFA s'applique a toute
        // transaction creee sans preciser les frais. Les mouvements internes
        // d'une tontine (cotisation, versement, caution, amende) doivent
        // passer frais: 0 explicitement.
    },
    // --- Module tontine : references souples, sans contrainte ---
    groupeTontineId:{
        type:DataTypes.INTEGER,
        allowNull:true
    },
    cycleTontineId:{
        type:DataTypes.INTEGER,
        allowNull:true
    },
    reference:{
        type:DataTypes.STRING(64),
        allowNull:true,
        unique:true,
        comment:"Reference unique d'idempotence : un rejeu ne cree pas de doublon"
    }
},{timesTamp:true});
module.exports=transaction;
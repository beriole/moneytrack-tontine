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
        defaultValue:0
        // Le defaut etait de 100,3 FCFA : toute ecriture creee sans preciser
        // les frais en heritait, alors qu'aucun portefeuille n'etait debite
        // de ce montant. Le tableau de bord, qui somme cette colonne pour
        // annoncer les benefices, comptait donc un revenu jamais encaisse.
        //
        // Des frais doivent correspondre a de l'argent reellement preleve :
        // le defaut est 0, et c'est a l'operation qui prend une commission de
        // l'inscrire explicitement.
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
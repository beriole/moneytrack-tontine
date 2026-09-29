const {DataTypes}=require('sequelize');
const bd=require('../config/bd');
const transaction=bd.define("transaction",{
    montant:{
        type:DataTypes.DECIMAL(15, 2),
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

    // Six etats fixes, definis dans services/statutTransaction.js : c'etait
    // du texte libre, ou chaque appelant ecrivait sa propre formule.
    statut:{
        type:DataTypes.ENUM('PENDING','PROCESSING','SUCCESS','FAILED','REVERSED','CANCELLED'),
        allowNull:false,
        defaultValue:'PENDING'
    },
    description:{
        type:DataTypes.TEXT,
        allowNull:true
    },
    frais:{
        type:DataTypes.DECIMAL(15, 2),
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
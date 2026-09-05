const {DataTypes}=require('sequelize');
const bd=require('../config/bd');
const depenseProjet=bd.define("depenseProjet",{
    montant:{
        type:DataTypes.INTEGER,
        allowNull:false
    },
    dateDeblocage:{
        type:DataTypes.DATE,
        allowNull:false,
        defaultValue:DataTypes.NOW
    },
    statut:{
        type:DataTypes.ENUM("bloqué","débloqué"),
        allowNull:false,
        defaultValue:"bloqué"
    }
});
module.exports=depenseProjet;
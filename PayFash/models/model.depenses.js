const {DataTypes}=require('sequelize');
const db=require('../config/bd');
const depense= db.define("depenses",{
    montant:{
        type:DataTypes.INTEGER,
        allowNul:false
    },
    date:{
        type:DataTypes.DATE,
        allowNul:false,
        defaultValue:DataTypes.NOW
    },
    description:{
        type:DataTypes.STRING,
        allowNul:true,
    }
});
module.exports=depense;
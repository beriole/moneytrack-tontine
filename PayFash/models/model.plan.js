const {DataTypes}=require('sequelize');
const db=require('../config/bd');

const Produit=db.define("Plan",{
    nom:{
        type:DataTypes.STRING,
        allownull:false,

    },
    description:{
        type:DataTypes.TEXT,
        allownull:false
    },
    prix:{
        type:DataTypes.FLOAT,
        allowNull:false
    }
},
{
    timesTamp:true,

}
);
module.exports=Produit;




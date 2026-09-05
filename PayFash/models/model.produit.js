const {DataTypes}=require('sequelize');
const db=require('../config/bd');

const Produit=db.define("Produit",{
    non:{
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
    },
    reduction:{
        type:DataTypes.INTEGER,
        allowNull:true
    },
    Stock:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
    }
},
{
    timesTamp:true,

}
);
module.exports=Produit;




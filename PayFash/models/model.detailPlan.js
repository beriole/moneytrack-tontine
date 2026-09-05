const {DataTypes}=require('sequelize');
const db=require('../config/bd');

const Produit=db.define("detailPlans",{
    detail:{
        type:DataTypes.STRING,
        allownull:false,

    }
},
{
    timesTamp:true,
}
);
module.exports=Produit;




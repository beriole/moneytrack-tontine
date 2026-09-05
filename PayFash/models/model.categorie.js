const {DataTypes}=require('sequelize');
const db=require('../config/bd');
const Categorie=db.define("Categorie",{
    nomCategorie:{
        type:DataTypes.STRING,
        allowNull:false,     
    },
    description:{
        type:DataTypes.STRING,
        allowNull:false,
        
    }
});
module.exports=Categorie;
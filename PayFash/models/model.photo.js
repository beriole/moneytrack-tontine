const{DataTypes}= require('sequelize');
const db=require('../config/bd');
const { toDefaultValue } = require('sequelize/lib/utils');
const photo=db.define("photo",{
    photo_url:{
        type:DataTypes.BLOB,
        allowNull: false
    },
    inActive:{
        type:DataTypes.BOOLEAN,
        allowNull:false,
        defaultValue:true
    }
},{
    timesTamp:true,
});
module.exports=photo;
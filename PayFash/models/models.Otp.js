const {DataTypes}=require('sequelize');
const db=require('../config/bd');
const { EMAIL } = require('../config');
const Otp= db.define("Otp",{
    OtpCode:{
        type:DataTypes.INTEGER,
        allowNul: false,
    },
    email:{
        type:DataTypes.STRING,
        allowNul:false,
        
    },
    dateExpiration:{
        type:DataTypes.DATE,
        allowNul:false
    }
});
module.exports=Otp;
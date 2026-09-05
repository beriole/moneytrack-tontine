const {DataTypes}=require('sequelize');
const db=require('../config/bd');
const NotificationEnvoyer = db.define("NotificationEnvoyer", {
    lu: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
});
module.exports=NotificationEnvoyer;
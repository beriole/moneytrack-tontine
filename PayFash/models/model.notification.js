const {DataTypes}=require('sequelize');
const db=require('../config/bd');
const Notification=db.define("Notification",{
    message:{
        type:DataTypes.TEXT,
        allowNull:false
    },
    dateEnvoie:{
        type:DataTypes.DATE,
        allowNull:false,
        defaultValue:DataTypes.NOW
    },
    Type:{
        type:DataTypes.ENUM("system","promo","alerte"),
        allowNull:false,
        defaultValue:"system"
    },
    // Domaine metier, pour filtrer et grouper le flux de notifications.
    categorie:{
        type:DataTypes.STRING(40),
        allowNull:true
    },
    // Destination dans l'application : { ecran, params }. Sans elle, une
    // alerte « cotisation due dans 3 jours » oblige a chercher l'ecran.
    lien:{
        type:DataTypes.JSON,
        allowNull:true,
        get(){
            const v=this.getDataValue('lien');
            if(typeof v!=='string') return v;
            try{ return JSON.parse(v); }catch(e){ return v; }
        }
    }
});
module.exports=Notification;

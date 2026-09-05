const {DataTypes}=require('sequelize');
const db=require('../config/bd');

const Projet=db.define("Projet",{
    nom:{
        type:DataTypes.STRING,
        allowNull:false,
    },
    budgetTotall:{
        type:DataTypes.FLOAT,
        allowNull:false
    },
    etat:{
        type:DataTypes.ENUM("en cours","terminé", "en pause", "annulé"),
        allowNull:false,
        defaultValue:"en cours"
    },
    // ============================================
    // NOUVEAUX CHAMPS POUR PROJET AVANCÉ
    // ============================================
    
    // Hiérarchie (sous-projets)
    projetParentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "ID du projet parent (null si projet principal)"
    },
    niveau: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Niveau dans la hiérarchie (0 = principal)"
    },
    
    // Jalons (Milestones)
    dateDebut: {
        type: DataTypes.DATE,
        allowNull: true
    },
    dateFinPrevue: {
        type: DataTypes.DATE,
        allowNull: true
    },
    dateFinReelle: {
        type: DataTypes.DATE,
        allowNull: true
    },
    progression: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Pourcentage de progression (0-100)"
    },
    
    // Suivi financier
    montantDepense: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    montantBloque: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    
    // Description et média
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    imageCouverture: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "URL de l'image de couverture"
    },
    
    // Statut de visibilité
    estPrive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    
    // Objectif principal
    objectif: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Description de l'objectif du projet"
    }
});

module.exports=Projet;

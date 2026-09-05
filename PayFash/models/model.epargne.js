const {DataTypes}=require('sequelize');
const db=require('../config/bd');

const Epargne = db.define('Epargne', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  objectif: { type: DataTypes.STRING, allowNull: false },
  date_debut: { type: DataTypes.DATE, allowNull: false },
  date_fin: { type: DataTypes.DATE },
  montant_total: { type: DataTypes.FLOAT, allowNull: false },
  montant_cumule: { type: DataTypes.FLOAT, defaultValue: 0 },
  statut: { type: DataTypes.ENUM('en cours', 'termine', 'en pause', 'annule'), defaultValue: 'en cours' },
  
  // ============================================
  // NOUVEAUX CHAMPS POUR ÉPARGNE AVANCÉE
  // ============================================
  
  // Taux d'intérêt
  tauxInteret: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
    comment: "Taux d'intérêt annuel en pourcentage"
  },
  interetCumule: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
    comment: "Intérêts générés"
  },
  capitalInitial: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: "Montant initial du dépôt"
  },
  
  // Objectifs visuels
  imageObjectif: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "URL de l'image de motivation"
  },
  couleur: {
    type: DataTypes.STRING(7),
    allowNull: true,
    defaultValue: '#3498db',
    comment: "Couleur de la tire-lire"
  },
  icone: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'piggy-bank',
    comment: "Icône de la tire-lire"
  },
  descriptionMotivation: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Texte de motivation"
  },
  
  // Fréquence de dépôt
  frequenceDepot: {
    type: DataTypes.ENUM('quotidien', 'hebdomadaire', 'mensuel'),
    allowNull: true,
    comment: "Fréquence automatique des dépôts"
  },
  montantRecurrent: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: "Montant du dépôt automatique"
  },
  
  // Tire-lire
  estTireLire: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: "Indique si c'est une tire-lire"
  },
  estSecrete: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: "Cacher le montant aux autres"
  },
  motivationQuote: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: "Citation motivante"
  },
  
  // Suivi
  dernierCalculInterets: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "Date du dernier calcul des intérêts"
  },
  progression: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: "Pourcentage de progression (0-100)"
  }
});

module.exports=Epargne;

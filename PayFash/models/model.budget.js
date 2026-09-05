const { DataTypes } = require('sequelize');
const db = require('../config/bd');

const Budget = db.define("Budget", {
    nom: {
        type: DataTypes.STRING,
        allowNull: false
    },
    montantAllouer: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    periodeDebut: {
        type: DataTypes.DATE,
        allowNull: false
    },
    periodeFin: {
        type: DataTypes.DATE,
        allowNull: false
    },
    // ============================================
    // NOUVEAUX CHAMPS POUR BUDGET AVANCÉ
    // ============================================
    
    // Budget cyclique (hebdomadaire, mensuel, annuel)
    typeCycle: {
        type: DataTypes.ENUM('unique', 'hebdomadaire', 'mensuel', 'annuel'),
        allowNull: false,
        defaultValue: 'unique'
    },
    estActif: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    estPartage: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Budget partagé avec un partenaire"
    },
    // Alertes seuils (pourcentage d'alerte)
    seuilAlerte: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 80,
        comment: "Pourcentage du budget à partir duquel alerter (ex: 80%)"
    },
    alerteEnvoyee: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Indique si l'alerte a déjà été envoyée cette période"
    },
    // Suggestions basées sur l'historique
    estSuggere: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Indique si ce budget est suggéré par l'IA"
    },
    historiqueReference: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Données historiques utilisées pour la suggestion"
    },
    // Montants réels dépensés
    montantDepense: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    // Description
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    // Couleur pour l'UI
    couleur: {
        type: DataTypes.STRING(7),
        allowNull: true,
        defaultValue: '#3498db'
    },
    // Icône
    icone: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: 'wallet'
    }
});

module.exports = Budget;

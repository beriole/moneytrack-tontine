const { DataTypes } = require('sequelize');
const db = require('../config/bd');

const Milestone = db.define("Milestone", {
    projetId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Projets',
            key: 'id'
        }
    },
    nom: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Nom du jalon"
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Description du jalon"
    },
    dateDebutPrevue: {
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
    budgetAlloue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: "Budget alloué pour ce jalon"
    },
    depenses: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: "Dépenses réelles pour ce jalon"
    },
    progression: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Pourcentage de progression (0-100)"
    },
    statut: {
        type: DataTypes.ENUM('planifie', 'en_cours', 'termine', 'en_retard', 'annule'),
        allowNull: false,
        defaultValue: 'planifie'
    },
    priorite: {
        type: DataTypes.ENUM('basse', 'moyenne', 'haute', 'critique'),
        allowNull: false,
        defaultValue: 'moyenne'
    },
    ordre: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Ordre d'affichage des jalons"
    }
});

module.exports = Milestone;

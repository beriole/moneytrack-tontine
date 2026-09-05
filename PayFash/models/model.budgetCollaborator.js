const { DataTypes } = require('sequelize');
const db = require('../config/bd');

const BudgetCollaborator = db.define("BudgetCollaborator", {
    budgetId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Budgets',
            key: 'id'
        }
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "ID de l'utilisateur collaborateur"
    },
    nom: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Nom du collaborateur"
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            isEmail: true
        }
    },
    role: {
        type: DataTypes.ENUM('lecture', 'contribution', 'admin'),
        allowNull: false,
        defaultValue: 'lecture',
        comment: "Rôle du collaborateur: lecture seule, contribution, admin"
    },
    peutDepenser: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Permission de faire des dépenses"
    },
    limiteDepense: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "Limite de dépense pour ce collaborateur"
    },
    statut: {
        type: DataTypes.ENUM('en_attente', 'accepte', 'refuse'),
        allowNull: false,
        defaultValue: 'en_attente'
    },
    dateAcceptation: {
        type: DataTypes.DATE,
        allowNull: true
    }
});

module.exports = BudgetCollaborator;

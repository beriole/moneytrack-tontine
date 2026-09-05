const { DataTypes } = require('sequelize');
const db = require('../config/bd');

const ProjetCollaborator = db.define("ProjetCollaborator", {
    projetId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Projets',
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
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            isEmail: true
        }
    },
    role: {
        type: DataTypes.ENUM('contributeur', 'observateur', 'responsable'),
        allowNull: false,
        defaultValue: 'contributeur'
    },
    peutDepenser: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    limiteDepense: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    contribution: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: "Montant contribué au projet"
    },
    statut: {
        type: DataTypes.ENUM('invite', 'accepte', 'refuse'),
        allowNull: false,
        defaultValue: 'invite'
    },
    dateAcceptation: {
        type: DataTypes.DATE,
        allowNull: true
    }
});

module.exports = ProjetCollaborator;

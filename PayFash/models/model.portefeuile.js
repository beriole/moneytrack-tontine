const { DataTypes } = require('sequelize');
const db = require('../config/bd');

const Portefeuille = db.define("Portefeuille", {
    nom: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Nom personnalisé du portefeuille"
    },
    solde: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    devise: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'XAF',
        comment: "Devise du portefeuille (XAF, EUR, USD, etc.)"
    },
    typePortefeuille: {
        type: DataTypes.ENUM('courant', 'epargne', 'projet', 'personnel', 'affaires', 'autre', 'tontine'),
        allowNull: false,
        defaultValue: 'personnel'
    },
    groupeTontineId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Groupe proprietaire quand typePortefeuille = 'tontine'. La caisse d'une tontine n'appartient a aucun client : ClientPortefeuilleId est alors nul, et les routes /wallet/withdraw et /wallet/transfer doivent refuser ce portefeuille."
    },
    estPrincipal: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Indique si c'est le portefeuille principal"
    },
    estActif: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Statut du portefeuille"
    },
    objectifMontant: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "Montant objectif pour l'épargne"
    },
    objectifDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Date objectif pour atteindre l'objectif"
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Description du portefeuille"
    },
    couleur: {
        type: DataTypes.STRING(7),
        allowNull: true,
        comment: "Couleur hexadécimale pour l'UI"
    },
    icone: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Nom de l'icône (ex: wallet, savings, briefcase)"
    }
});

module.exports = Portefeuille;

const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Caisse 2. Trois entrees a distinguer pour que la casse annuelle soit
// justifiable ligne a ligne : apports des membres, interets percus, amendes.
const TontinePoolCredit = db.define("TontinePoolCredit", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    capitalTotal: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    capitalDisponible: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    capitalEngage: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Capital sorti en credits non encore rembourses"
    },
    apportsMembres: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    interetsCumules: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    amendesCumulees: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Produit de la caisse 4 quand destinationAmendes = 'epargne'"
    },
    tauxInteretDefaut: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 5.00,
        comment: "Taux mensuel en pourcentage, usage courant au Cameroun : 5 a 10"
    },
    derniereMaj: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'tontine_pool_credit',
    timestamps: true
});

module.exports = TontinePoolCredit;

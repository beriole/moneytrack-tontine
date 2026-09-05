const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// Prêt / crédit accordé à un client.
const Pret = db.define("Pret", {
    montant: { type: DataTypes.FLOAT, allowNull: false },
    tauxInteret: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 5 }, // % annuel
    dureeMois: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    motif: { type: DataTypes.STRING, allowNull: true },
    statut: {
        type: DataTypes.ENUM('demande', 'approuve', 'rejete', 'actif', 'rembourse', 'defaut'),
        allowNull: false,
        defaultValue: 'demande'
    },
    montantRembourse: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    montantTotalDu: { type: DataTypes.FLOAT, allowNull: true }, // capital + intérêts
    dateApprobation: { type: DataTypes.DATE, allowNull: true },
    dateEcheance: { type: DataTypes.DATE, allowNull: true },
    motifRejet: { type: DataTypes.STRING, allowNull: true },
    clientId: { type: DataTypes.INTEGER, allowNull: false }
});

module.exports = Pret;

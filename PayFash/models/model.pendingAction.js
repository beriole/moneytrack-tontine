const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// Action sensible en attente de double validation (maker-checker).
const PendingAction = db.define("PendingAction", {
    type: {
        // TONTINE_VERSEMENT_FORCE : seule porte de sortie quand un pot
        // reste bloque par un membre injoignable. Elle exige deux
        // administrateurs distincts, comme un remboursement.
        type: DataTypes.ENUM('REFUND', 'WALLET_ADJUST', 'USER_DELETE', 'TONTINE_VERSEMENT_FORCE'),
        allowNull: false
    },
    payload: { type: DataTypes.JSON, allowNull: false },     // données nécessaires à l'exécution
    description: { type: DataTypes.STRING, allowNull: true },
    statut: {
        type: DataTypes.ENUM('EN_ATTENTE', 'APPROUVE', 'REJETE'),
        allowNull: false,
        defaultValue: 'EN_ATTENTE'
    },
    demandeurId: { type: DataTypes.INTEGER, allowNull: false },   // maker
    demandeurEmail: { type: DataTypes.STRING, allowNull: true },
    validateurId: { type: DataTypes.INTEGER, allowNull: true },   // checker
    motifRejet: { type: DataTypes.STRING, allowNull: true }
});

module.exports = PendingAction;

const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Une ligne par echeance de l'echeancier, generees au decaissement.
const TontineRemboursementCredit = db.define("TontineRemboursementCredit", {
    demandeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    numeroEcheance: {
        type: DataTypes.SMALLINT,
        allowNull: false
    },
    montantDu: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    montantPaye: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    partCapital: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Separee de l'interet : seul l'interet alimente interetsCumules"
    },
    partInteret: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    dateEcheance: {
        type: DataTypes.DATE,
        allowNull: false
    },
    datePaiement: {
        type: DataTypes.DATE,
        allowNull: true
    },
    statut: {
        type: DataTypes.ENUM('attendu', 'paye', 'en_retard', 'impaye'),
        allowNull: false,
        defaultValue: 'attendu'
    },
    transactionId: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'tontine_remboursements_credit',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['demandeId', 'numeroEcheance'] }
    ]
});

module.exports = TontineRemboursementCredit;

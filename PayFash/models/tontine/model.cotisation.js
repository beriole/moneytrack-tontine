const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// La table qui manquait le plus dans NjanguiPay : elle dit QUI a paye pour
// QUEL cycle. Sans elle, un versement peut partir sur un pot incomplet des
// lors que le solde global du groupe suffit.
const TontineCotisation = db.define("TontineCotisation", {
    cycleId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    membreId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Denormalise pour interroger les cotisations d'un client sans jointure"
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
    statut: {
        type: DataTypes.ENUM('attendue', 'payee', 'partielle', 'en_retard', 'impayee'),
        allowNull: false,
        defaultValue: 'attendue'
    },
    dateEcheance: {
        type: DataTypes.DATE,
        allowNull: false
    },
    datePaiement: {
        type: DataTypes.DATE,
        allowNull: true
    },
    transactionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Ecriture correspondante dans la table transactions"
    }
}, {
    tableName: 'tontine_cotisations',
    timestamps: true,
    indexes: [
        // Invariant metier : une seule ligne de cotisation par membre et par cycle
        { unique: true, fields: ['cycleId', 'membreId'] },
        { fields: ['clientId', 'statut'] }
    ]
});

module.exports = TontineCotisation;

const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Caisse 4. Entierement neuve : NjanguiPay n'avait qu'un compteur
// warningCount sans consequence. Une amende est une DETTE : elle se regle
// avant la cotisation suivante, et son produit indemnise le membre lese —
// le beneficiaire du cycle concerne. Voir AmendeService.payerDans.
const TontineAmende = db.define("TontineAmende", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    membreId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    cycleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Cycle concerne quand l'amende sanctionne un retard de cotisation"
    },
    motif: {
        type: DataTypes.ENUM('retard', 'absence', 'indiscipline', 'autre'),
        allowNull: false
    },
    montant: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    statut: {
        type: DataTypes.ENUM('due', 'payee', 'annulee'),
        allowNull: false,
        defaultValue: 'due'
    },
    infligeePar: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Membre du bureau qui a inflige l'amende. Null = levee automatiquement par le planificateur"
    },
    commentaire: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    datePaiement: {
        type: DataTypes.DATE,
        allowNull: true
    },
    transactionId: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'tontine_amendes',
    timestamps: true,
    indexes: [
        { fields: ['clientId', 'statut'] },
        { fields: ['groupeId', 'statut'] }
    ]
});

module.exports = TontineAmende;

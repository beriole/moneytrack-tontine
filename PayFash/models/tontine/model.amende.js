const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Caisse 4. Entierement neuve : NjanguiPay n'avait qu'un compteur
// warningCount sans consequence. Une amende est une DETTE : elle se regle
// avant la cotisation suivante, et son produit va la ou dit destinationAmendes.
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
        comment: "Client censeur. Null = levee automatiquement par le cron"
    },
    destination: {
        type: DataTypes.ENUM('epargne', 'pot_cycle'),
        allowNull: false,
        defaultValue: 'epargne',
        comment: "Fige la destination au moment de l'infliction (decision D7)"
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

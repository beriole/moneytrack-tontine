const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Caution bloquee a l'entree du groupe. Contrairement a NjanguiPay, la
// liberation doit RECREDITER le portefeuille du membre (voir piege n.4) :
// transactionLiberationId n'est jamais nul sur une caution 'liberee'.
const TontineCaution = db.define("TontineCaution", {
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
    montantBloque: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    montantUtilise: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Part saisie pour couvrir une cotisation impayee ou une amende"
    },
    statut: {
        type: DataTypes.ENUM('bloquee', 'liberee', 'partiellement_utilisee', 'totalement_utilisee'),
        allowNull: false,
        defaultValue: 'bloquee'
    },
    transactionBlocageId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    transactionLiberationId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    dateBlocage: {
        type: DataTypes.DATE,
        allowNull: true
    },
    dateLiberation: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'tontine_cautions',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['groupeId', 'clientId'] }
    ]
});

module.exports = TontineCaution;

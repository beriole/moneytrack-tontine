const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

const TontineDemandeCredit = db.define("TontineDemandeCredit", {
    poolId: {
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
    montant: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    tauxInteret: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        comment: "Fige a l'approbation, ne suit pas les changements du pool"
    },
    dureeMois: {
        type: DataTypes.SMALLINT,
        allowNull: false
    },
    totalARembourser: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    motif: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    statut: {
        type: DataTypes.ENUM('en_attente', 'approuvee', 'rejetee', 'decaissee', 'remboursee', 'en_defaut'),
        allowNull: false,
        defaultValue: 'en_attente'
    },
    voteId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Vote d'approbation du groupe"
    },
    dateApprobation: {
        type: DataTypes.DATE,
        allowNull: true
    },
    dateDecaissement: {
        type: DataTypes.DATE,
        allowNull: true
    },
    dateEcheance: {
        type: DataTypes.DATE,
        allowNull: true
    },
    transactionDecaissementId: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'tontine_demandes_credit',
    timestamps: true,
    indexes: [
        { fields: ['poolId', 'statut'] },
        { fields: ['clientId', 'statut'] }
    ]
});

module.exports = TontineDemandeCredit;

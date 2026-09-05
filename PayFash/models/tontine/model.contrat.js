const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Reglement interieur du groupe, hache et horodate. C'est la piece qui
// tranche un litige entre membres.
const TontineContrat = db.define("TontineContrat", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    version: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 1
    },
    contenu: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    hashContenu: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "SHA-256 du contenu au moment de la generation"
    },
    urlPdf: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    statut: {
        type: DataTypes.ENUM('brouillon', 'en_attente_signatures', 'signe', 'amende'),
        allowNull: false,
        defaultValue: 'brouillon'
    },
    dateGeneration: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    dateSignatureComplete: {
        type: DataTypes.DATE,
        allowNull: true
    },
    contratAmendeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Version precedente que ce contrat remplace"
    }
}, {
    tableName: 'tontine_contrats',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['groupeId', 'version'] }
    ]
});

module.exports = TontineContrat;

const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

const TontineSignature = db.define("TontineSignature", {
    contratId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    empreinte: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Hash de (hashContenu + clientId + horodatage)"
    },
    signeLe: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    adresseIp: {
        type: DataTypes.STRING(45),
        allowNull: true
    }
}, {
    tableName: 'tontine_signatures',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['contratId', 'clientId'] }
    ]
});

module.exports = TontineSignature;

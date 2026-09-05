const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// Journal d'audit immuable des actions effectuées par les administrateurs.
const AuditLog = db.define("AuditLog", {
    adminId: { type: DataTypes.INTEGER, allowNull: true },
    adminEmail: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false },       // ex: USER_DEACTIVATE
    cible: { type: DataTypes.STRING, allowNull: true },         // ex: Client#12
    details: { type: DataTypes.JSON, allowNull: true },        // avant/après, payload
    ip: { type: DataTypes.STRING, allowNull: true },
    statut: { type: DataTypes.ENUM('SUCCESS', 'FAILURE'), allowNull: false, defaultValue: 'SUCCESS' }
}, {
    updatedAt: false // log immuable
});

module.exports = AuditLog;

const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// Paramètres globaux de la plateforme (clé/valeur typée).
const SystemConfig = db.define("SystemConfig", {
    cle: { type: DataTypes.STRING, allowNull: false, unique: true },
    valeur: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('number', 'string', 'boolean'), allowNull: false, defaultValue: 'string' },
    description: { type: DataTypes.STRING, allowNull: true },
    categorie: { type: DataTypes.STRING, allowNull: true, defaultValue: 'general' }
});

module.exports = SystemConfig;

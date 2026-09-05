const { DataTypes } = require('sequelize');
const db = require('../config/bd');

const budgetCategorie = db.define("budgetCategorie", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    montant: {
        type: DataTypes.FLOAT,
        allowNull: false
    }
}, {
    timestamps: false
});

module.exports = budgetCategorie;

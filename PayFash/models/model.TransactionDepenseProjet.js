const { DataTypes } = require('sequelize');
const db = require('../config/bd');
const TransactionDepenseProjet = db.define("TransactionDepenseProjet", {
    type: {
        type: DataTypes.ENUM("deblocage", "utilisation", "remboursement"),
        allowNull: false
    },
    montant: {
        type: DataTypes.DECIMAL(15,2),
        allowNull: false,
        validate: {
            min: 0
        }
    },
    dateTransaction: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

module.exports = TransactionDepenseProjet;

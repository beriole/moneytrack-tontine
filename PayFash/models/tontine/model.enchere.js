const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Mode 'enchere' : celui qui accepte la plus forte decote prend le pot en
// avance, et la decote est redistribuee aux autres membres au prorata.
// Declare dans l'ENUM de NjanguiPay, jamais implemente.
const TontineEnchere = db.define("TontineEnchere", {
    cycleId: {
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
    montantDecote: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Somme que l'encherisseur accepte de perdre sur le pot"
    },
    statut: {
        type: DataTypes.ENUM('active', 'retiree', 'gagnante', 'perdante'),
        allowNull: false,
        defaultValue: 'active'
    },
    dateOffre: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'tontine_encheres',
    timestamps: true,
    indexes: [
        { fields: ['cycleId', 'statut'] }
    ]
});

module.exports = TontineEnchere;

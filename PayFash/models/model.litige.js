const { DataTypes } = require("sequelize");
const db = require("../config/bd");

const Litige = db.define("Litige", {
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    statut: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "en attente"
    },
    dateSoummission: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    dateResolution: {
        type: DataTypes.DATE,
        allowNull: true,
    }
});

module.exports = Litige;

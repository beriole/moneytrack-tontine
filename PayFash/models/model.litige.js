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
    },
    // L'operation contestee — voir services/litige.service.js.
    objetType: { type: DataTypes.STRING(32), allowNull: true },
    objetId: { type: DataTypes.INTEGER, allowNull: true },
    groupeId: { type: DataTypes.INTEGER, allowNull: true },
    // Instantane pris par le serveur a l'ouverture, et son empreinte.
    preuves: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
            const v = this.getDataValue('preuves');
            if (typeof v !== 'string') return v;
            try { return JSON.parse(v); } catch (e) { return v; }
        }
    },
    empreintePreuves: { type: DataTypes.STRING(64), allowNull: true },
    reponse: { type: DataTypes.TEXT, allowNull: true },
    traitePar: { type: DataTypes.INTEGER, allowNull: true }
});

module.exports = Litige;

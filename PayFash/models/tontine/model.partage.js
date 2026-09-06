const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// La casse annuelle : cloture d'exercice de la caisse 2, partage du capital
// et des interets au prorata des apports, puis remise a zero.
const TontinePartage = db.define("TontinePartage", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    exercice: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Annee de l'exercice cloture"
    },
    capitalPartage: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    interetsPartages: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    amendesPartagees: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    nbBeneficiaires: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 0
    },
    detail: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Part par membre : [{ clientId, apports, partCapital, partInterets }]",
        // Voir model.groupe.js : MariaDB ne re-parse pas les colonnes JSON.
        get() {
            const valeur = this.getDataValue('detail');
            if (typeof valeur !== 'string') return valeur;
            try { return JSON.parse(valeur); } catch (e) { return valeur; }
        }
    },
    statut: {
        type: DataTypes.ENUM('en_cours', 'cloture'),
        allowNull: false,
        defaultValue: 'en_cours'
    },
    dateCloture: {
        type: DataTypes.DATE,
        allowNull: true
    },
    dernierApportId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Derniere ecriture d'apport incluse dans cette casse. La borne etait une DATE : MySQL tronque les DATETIME a la seconde, si bien qu'un apport depose dans la meme seconde que la cloture etait attribue a l'exercice deja clos. Un identifiant, lui, est strictement croissant et sans ambiguite."
    }
}, {
    tableName: 'tontine_partages',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['groupeId', 'exercice'] }
    ]
});

module.exports = TontinePartage;

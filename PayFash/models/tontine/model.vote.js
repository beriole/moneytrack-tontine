const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

const TontineVote = db.define("TontineVote", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    sujet: {
        type: DataTypes.ENUM('admettre', 'exclure', 'modifier_regles', 'dissoudre', 'elire_ordre', 'approuver_credit'),
        allowNull: false
    },
    cibleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Id de l'objet vote : membre a exclure, demande de credit, etc."
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    payload: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Ce que le vote applique s'il est adopte : ordre propose, regles modifiees...",
        // MariaDB expose JSON comme LONGTEXT et ne re-parse pas a la lecture.
        get() {
            const valeur = this.getDataValue('payload');
            if (typeof valeur !== 'string') return valeur;
            try { return JSON.parse(valeur); } catch (e) { return valeur; }
        }
    },
    mode: {
        type: DataTypes.ENUM('majorite', 'qualifiee', 'unanimite'),
        allowNull: false,
        defaultValue: 'majorite'
    },
    dateLimite: {
        type: DataTypes.DATE,
        allowNull: false
    },
    resultat: {
        type: DataTypes.ENUM('en_attente', 'approuve', 'rejete', 'egalite'),
        allowNull: false,
        defaultValue: 'en_attente'
    },
    creePar: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    dateResolution: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Non nul une fois l'effet du vote reellement applique"
    }
}, {
    tableName: 'tontine_votes',
    timestamps: true,
    indexes: [
        { fields: ['groupeId', 'resultat'] }
    ]
});

module.exports = TontineVote;

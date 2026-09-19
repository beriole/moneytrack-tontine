const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// Une evaluation de risque conservee : facteurs, donnees, regles, version.
// Ecrite une fois, jamais modifiee. Voir services/risque.service.js.
const json = (champ) => ({
    type: DataTypes.JSON,
    allowNull: false,
    get() {
        const v = this.getDataValue(champ);
        if (typeof v !== 'string') return v;
        try { return JSON.parse(v); } catch (e) { return v; }
    }
});

const EvaluationRisque = db.define('EvaluationRisque', {
    clientId: { type: DataTypes.INTEGER, allowNull: false },
    groupeId: { type: DataTypes.INTEGER, allowNull: true },
    contexte: { type: DataTypes.STRING(32), allowNull: false },
    niveau: { type: DataTypes.ENUM('FAIBLE', 'MODERE', 'ELEVE'), allowNull: false },
    score: { type: DataTypes.INTEGER, allowNull: false },
    donneesSuffisantes: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    facteurs: json('facteurs'),
    donnees: json('donnees'),
    regles: json('regles'),
    versionMoteur: { type: DataTypes.STRING(32), allowNull: false }
}, {
    tableName: 'evaluations_risque',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['clientId', 'createdAt'] }]
});

module.exports = EvaluationRisque;

const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Ce qu'aucune source de recouvrement n'a couvert. Un incident par
// cotisation : ouvert quand le recouvrement s'arrete avant le solde, clos
// quand la cotisation est enfin soldee. Voir services/tontine/defaut.service.js.
const TontineIncidentDefaut = db.define('TontineIncidentDefaut', {
    groupeId: { type: DataTypes.INTEGER, allowNull: false },
    cycleId: { type: DataTypes.INTEGER, allowNull: false },
    cotisationId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    clientId: { type: DataTypes.INTEGER, allowNull: false },
    montantInitial: {
        type: DataTypes.DECIMAL(15, 2), allowNull: false,
        comment: 'Reste du a l ouverture, apres epuisement des sources'
    },
    resteDu: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    statut: { type: DataTypes.ENUM('ouvert', 'regle'), allowNull: false, defaultValue: 'ouvert' },
    sourcesEssayees: {
        type: DataTypes.JSON, allowNull: true,
        get() {
            const v = this.getDataValue('sourcesEssayees');
            if (typeof v !== 'string') return v;
            try { return JSON.parse(v); } catch (e) { return v; }
        }
    },
    modeReglement: { type: DataTypes.ENUM('membre', 'recouvrement', 'retenue_pot'), allowNull: true },
    ouvertLe: { type: DataTypes.DATE, allowNull: false },
    regleLe: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'tontine_incidents_defaut',
    timestamps: true,
    indexes: [
        { fields: ['clientId', 'statut'] },
        { fields: ['groupeId', 'statut'] }
    ]
});

module.exports = TontineIncidentDefaut;

const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// =====================================================================
//  Evaluation d'eligibilite — la trace d'une decision.
//
//  Chaque fois que MoneyTrack autorise ou refuse un acte sensible —
//  rejoindre une tontine, encherir, recevoir un pot —, il conserve la
//  liste des controles passes, leur resultat et la version du moteur. Un
//  refus doit pouvoir etre explique a celui qui le conteste, sans avoir a
//  reconstituer l'etat du systeme a cette date.
// =====================================================================
const TontineEvaluationEligibilite = db.define("TontineEvaluationEligibilite", {
    clientId: { type: DataTypes.INTEGER, allowNull: false },
    groupeId: { type: DataTypes.INTEGER, allowNull: true },
    cycleId: { type: DataTypes.INTEGER, allowNull: true },
    operation: { type: DataTypes.ENUM('creation', 'adhesion', 'enchere', 'versement'), allowNull: false },
    resultat: { type: DataTypes.ENUM('ELIGIBLE', 'NON_ELIGIBLE'), allowNull: false },
    controles: {
        type: DataTypes.JSON,
        allowNull: false,
        get() {
            const v = this.getDataValue('controles');
            if (typeof v !== 'string') return v;
            try { return JSON.parse(v); } catch (e) { return v; }
        }
    },
    versionMoteur: { type: DataTypes.STRING(20), allowNull: false }
}, {
    tableName: 'tontine_evaluations_eligibilite',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['clientId'] }, { fields: ['groupeId'] }]
});

module.exports = TontineEvaluationEligibilite;

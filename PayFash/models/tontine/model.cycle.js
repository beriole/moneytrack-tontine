const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

const TontineCycle = db.define("TontineCycle", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    numeroCycle: {
        type: DataTypes.SMALLINT,
        allowNull: false
    },
    beneficiaireId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Client qui mange le pot de ce cycle"
    },
    montantAttendu: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Taille du pot = montantParPeriode x (nb membres actifs - 1)"
    },
    montantCollecte: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    statut: {
        type: DataTypes.ENUM('actif', 'complete', 'en_defaut', 'suspendu'),
        allowNull: false,
        defaultValue: 'actif',
        comment: "en_defaut : echeance atteinte avec un pot incomplet"
    },
    dateDebut: {
        type: DataTypes.DATE,
        allowNull: false
    },
    dateFinPrevue: {
        type: DataTypes.DATE,
        allowNull: false
    },
    dateFin: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'tontine_cycles',
    timestamps: true,
    indexes: [
        // Invariant metier : un seul cycle par numero et par groupe
        { unique: true, fields: ['groupeId', 'numeroCycle'] }
    ]
});

module.exports = TontineCycle;

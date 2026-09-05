const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Marche des tours. Dans une vraie tontine le tour se vend : d'ou
// montantCompensation, absent de NjanguiPay.
const TontineEchangeTour = db.define("TontineEchangeTour", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    demandeurId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    destinataireId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    tourDemandeur: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        comment: "Fige l'ordre au moment de la proposition, pour detecter un ordre modifie depuis"
    },
    tourDestinataire: {
        type: DataTypes.SMALLINT,
        allowNull: false
    },
    montantCompensation: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Somme versee par le demandeur pour avancer son tour"
    },
    statut: {
        type: DataTypes.ENUM('en_attente', 'accepte', 'rejete', 'annule', 'expire'),
        allowNull: false,
        defaultValue: 'en_attente'
    },
    expireLe: {
        type: DataTypes.DATE,
        allowNull: false
    },
    transactionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Ecriture de la compensation, si elle est non nulle"
    }
}, {
    tableName: 'tontine_echanges_tour',
    timestamps: true,
    indexes: [
        { fields: ['groupeId', 'statut'] }
    ]
});

module.exports = TontineEchangeTour;

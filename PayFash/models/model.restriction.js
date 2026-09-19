const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// =====================================================================
//  Restriction — une porte fermee, pas un compte bloque.
//
//  Desactiver un compte (Client.isActive) coupe tout, y compris ce qu'un
//  membre en difficulte doit pouvoir faire : payer sa dette, consulter ses
//  garanties, contester une decision. Une restriction ne ferme qu'un acte
//  precis ; tout le reste demeure.
//
//    JOIN_TONTINE_DISABLED        rejoindre une tontine
//    RECEIVE_POT_DISABLED         recevoir un pot
//    AUCTION_DISABLED             encherir sur un pot
//    WITHDRAW_GUARANTEE_DISABLED  reprendre une garantie
//    CREATE_TONTINE_DISABLED      creer une tontine
//
//  Elle est active tant qu'elle n'est pas levee et que sa date de fin,
//  si elle en a une, n'est pas passee.
// =====================================================================
const Restriction = db.define("Restriction", {
    clientId: { type: DataTypes.INTEGER, allowNull: false },
    type: {
        type: DataTypes.ENUM('JOIN_TONTINE_DISABLED', 'RECEIVE_POT_DISABLED', 'AUCTION_DISABLED',
            'WITHDRAW_GUARANTEE_DISABLED', 'CREATE_TONTINE_DISABLED'),
        allowNull: false
    },
    motif: { type: DataTypes.STRING(255), allowNull: false },
    origine: { type: DataTypes.ENUM('ADMIN', 'SYSTEME'), allowNull: false, defaultValue: 'ADMIN' },
    adminId: { type: DataTypes.INTEGER, allowNull: true },
    actifJusqu: { type: DataTypes.DATE, allowNull: true },
    leveeLe: { type: DataTypes.DATE, allowNull: true },
    leveePar: { type: DataTypes.INTEGER, allowNull: true },
    motifLevee: { type: DataTypes.STRING(255), allowNull: true }
}, {
    tableName: 'restrictions',
    timestamps: true,
    indexes: [{ fields: ['clientId', 'type'] }]
});

module.exports = Restriction;

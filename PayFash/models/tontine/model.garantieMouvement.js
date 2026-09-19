const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// =====================================================================
//  Mouvement de garantie — l'histoire d'une garantie, ligne par ligne.
//
//  Une garantie change trois fois de forme : on la bloque, on en mobilise
//  une part pour couvrir un impaye, on rend le reste. Les trois montants
//  portes par la garantie disent ou elle en est ; ils ne disent pas quand,
//  pourquoi, ni par qui. En cas de litige — « on m'a pris 25 000 FCFA sur
//  mon epargne » — c'est cette table qui repond, sans avoir a deduire
//  l'histoire des transactions.
// =====================================================================
const TontineGarantieMouvement = db.define("TontineGarantieMouvement", {
    garantieId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    sens: {
        type: DataTypes.ENUM('blocage', 'mobilisation', 'liberation'),
        allowNull: false
    },
    montant: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    motif: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Ce qui a declenche le mouvement : cotisation #12 impayee, fin de tontine..."
    },
    acteurType: {
        type: DataTypes.ENUM('CLIENT', 'ADMIN', 'SYSTEME'),
        allowNull: false,
        defaultValue: 'CLIENT'
    },
    acteurId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    transactionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "L'ecriture comptable, quand de l'argent a reellement bouge (mobilisation)"
    }
}, {
    tableName: 'tontine_garantie_mouvements',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['garantieId'] }]
});

module.exports = TontineGarantieMouvement;

const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// =====================================================================
//  Grand livre en partie double (section 30). Voir services/ledger.service.js.
//
//  Un compte dit OU l'argent se trouve, un mouvement dit CE QUI s'est
//  passe, et ses ecritures disent d'ou a ou. Pour chaque mouvement, la
//  somme des debits egale la somme des credits : c'est ce qui permet de
//  prouver qu'aucun franc n'a ete cree ni perdu.
// =====================================================================

const LedgerCompte = db.define('LedgerCompte', {
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    type: { type: DataTypes.ENUM('PORTEFEUILLE', 'EXTERNE', 'SYSTEME'), allowNull: false },
    libelle: { type: DataTypes.STRING(160), allowNull: false },
    portefeuilleId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
    devise: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'XAF' }
}, { tableName: 'ledger_comptes', timestamps: true });

const LedgerMouvement = db.define('LedgerMouvement', {
    // Deux fois la meme reference, c'est deux fois le meme mouvement :
    // l'unicite en base est la barriere d'idempotence (section 32).
    reference: { type: DataTypes.STRING(80), allowNull: true, unique: true },
    type: { type: DataTypes.STRING(40), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    montant: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    clientId: { type: DataTypes.INTEGER, allowNull: true },
    groupeTontineId: { type: DataTypes.INTEGER, allowNull: true },
    cycleTontineId: { type: DataTypes.INTEGER, allowNull: true },
    transactionId: { type: DataTypes.INTEGER, allowNull: true },
    date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: 'ledger_mouvements',
    timestamps: true,
    indexes: [{ fields: ['clientId', 'date'] }, { fields: ['groupeTontineId'] }]
});

const LedgerEcriture = db.define('LedgerEcriture', {
    mouvementId: { type: DataTypes.INTEGER, allowNull: false },
    compteId: { type: DataTypes.INTEGER, allowNull: false },
    sens: { type: DataTypes.ENUM('debit', 'credit'), allowNull: false },
    montant: { type: DataTypes.DECIMAL(15, 2), allowNull: false }
}, {
    tableName: 'ledger_ecritures',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['compteId'] }, { fields: ['mouvementId'] }]
});

module.exports = { LedgerCompte, LedgerMouvement, LedgerEcriture };

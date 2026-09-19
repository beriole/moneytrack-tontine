const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// Journal d'audit immuable.
//
// Il ne connaissait que l'administrateur : adminId, adminEmail, et rien
// d'autre. Les actes les plus lourds du systeme n'y laissaient donc aucune
// trace — un pot verse par un president, une caution saisie par la regle de
// recouvrement, une presidence transmise, un paiement confirme par webhook.
//
// L'acteur est maintenant decrit par sa nature. SYSTEME n'est pas un acteur
// de la conception — MoneyTrack n'est pas acteur de son propre systeme :
// c'est la mention qui distingue « le president a saisi la caution » de
// « la regle l'a saisie ».
const AuditLog = db.define("AuditLog", {
    acteurType: {
        type: DataTypes.ENUM('CLIENT', 'ADMIN', 'SYSTEME', 'SERVICE_EXTERNE'),
        allowNull: false,
        defaultValue: 'ADMIN'
    },
    acteurId: { type: DataTypes.INTEGER, allowNull: true },
    // Le nom au moment de l'acte : un journal d'audit qui a besoin d'une
    // jointure pour se lire ment des que le compte est renomme ou supprime.
    acteurLibelle: { type: DataTypes.STRING(160), allowNull: true },
    // Conserves pour les entrees deja ecrites et pour le back-office, qui
    // les affiche. Redondants avec acteurId/acteurLibelle des que
    // acteurType vaut ADMIN.
    adminId: { type: DataTypes.INTEGER, allowNull: true },
    adminEmail: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false },       // ex: USER_DEACTIVATE
    cible: { type: DataTypes.STRING, allowNull: true },         // ex: Client#12
    details: { type: DataTypes.JSON, allowNull: true },        // avant/après, payload
    ip: { type: DataTypes.STRING, allowNull: true },
    // Correle les ecritures issues d'une meme requete.
    requestId: { type: DataTypes.STRING(64), allowNull: true },
    statut: { type: DataTypes.ENUM('SUCCESS', 'FAILURE'), allowNull: false, defaultValue: 'SUCCESS' }
}, {
    updatedAt: false // log immuable
});

module.exports = AuditLog;

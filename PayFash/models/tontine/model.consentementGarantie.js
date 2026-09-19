const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// =====================================================================
//  Consentement — la preuve qu'un membre a accepte de bloquer son argent.
//
//  MoneyTrack ne bloque jamais l'epargne de quelqu'un de sa propre
//  initiative. Avant qu'un franc soit immobilise, le membre lit un texte
//  qui dit combien, sur quel portefeuille, pour quelle tontine, et dans
//  quelles conditions cet argent pourra servir. Il l'accepte, et c'est ce
//  texte-la — pas une version ulterieure — qui fait foi.
//
//  Le texte est conserve en entier, avec son empreinte : le client envoie
//  l'empreinte de ce qu'il a lu, le serveur verifie qu'elle correspond au
//  texte qu'il aurait genere pour les memes parametres. Un texte modifie
//  entre l'affichage et l'acceptation est ainsi refuse.
// =====================================================================
const TontineConsentementGarantie = db.define("TontineConsentementGarantie", {
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    portefeuilleId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    montant: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    texte: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Le texte integral accepte, tel qu'affiche"
    },
    hashTexte: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "SHA-256 du texte"
    },
    versionReglement: {
        type: DataTypes.SMALLINT,
        allowNull: true,
        comment: "Version du reglement interieur en vigueur a l'acceptation, s'il en existe une"
    },
    accepteLe: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    adresseIp: {
        type: DataTypes.STRING(45),
        allowNull: true
    }
}, {
    tableName: 'tontine_consentements_garantie',
    timestamps: true,
    updatedAt: false
});

module.exports = TontineConsentementGarantie;

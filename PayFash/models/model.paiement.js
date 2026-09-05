const { DataTypes } = require('sequelize');
const db = require('../config/bd');

// Modèle Paiement
const Paiement = db.define("Paiement", {
    type: {
        type: DataTypes.STRING,
        allowNull: false,   // ⚠️ tu avais écrit allowNul (erreur)
        defaultValue: "achat"
    },
    montant: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW  // met automatiquement la date actuelle
    },
    payToken: { 
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue:'succes_ORANGE_MONEY'// stocker le token renvoyé par Orange Money
    },
    status: { 
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "PENDING" // état par défaut
    },
    motif: {
        type: DataTypes.STRING,
        allowNull: true,
    },

    // ---- Paiements externes (agregateur) ----
    // C'est la reference qui rend l'operation idempotente : un webhook
    // rejoue trois fois ne doit crediter qu'une seule fois.
    reference: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true
    },
    providerTxId: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    fournisseur: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    medium: {
        type: DataTypes.STRING(30),
        allowNull: true
    },
    sens: {
        type: DataTypes.ENUM('entrant', 'sortant'),
        allowNull: true,
        comment: 'entrant = recharge, sortant = retrait'
    },
    portefeuilleId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    lienPaiement: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    dateConfirmation: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Reponse brute du fournisseur : on ne rejoue pas un paiement de memoire.
    donnees: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
            const v = this.getDataValue('donnees');
            if (typeof v !== 'string') return v;
            try { return JSON.parse(v); } catch (e) { return v; }
        }
    }
});

// Association avec Client (1 client a plusieurs paiements)


module.exports = Paiement;

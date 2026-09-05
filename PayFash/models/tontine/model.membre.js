const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

const TontineMembre = db.define("TontineMembre", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('president', 'tresorier', 'censeur', 'secretaire', 'membre'),
        allowNull: false,
        defaultValue: 'membre',
        comment: "Bureau : le censeur inflige les amendes, le tresorier encaisse"
    },
    statut: {
        type: DataTypes.ENUM('invite', 'actif', 'suspendu', 'exclu'),
        allowNull: false,
        defaultValue: 'invite'
    },
    cautionPayee: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    montantCaution: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
    },
    aBeneficie: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "true une fois que le membre a mange son tour"
    },
    ordreBeneficiaire: {
        type: DataTypes.SMALLINT,
        allowNull: true,
        comment: "Rang dans la rotation, attribue au demarrage du groupe"
    },
    garantId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Client qui se porte aval pour ce membre (cascade de recours)"
    },
    nbAvertissements: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 0
    },
    invitePar: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    dateAdhesion: {
        type: DataTypes.DATE,
        allowNull: true
    },

    // ---- Liens vers le reste de MoneyTrack ----
    // Portes par l'adhesion, pas par le groupe : chaque membre gere son
    // propre budget et sa propre destination de tour.
    budgetId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Budget ou la cotisation de ce membre est imputee"
    },
    categorieId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Categorie de ce budget qui porte l'engagement tontine"
    },
    portefeuilleDestinationId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Portefeuille qui recoit le tour. Null = portefeuille courant."
    },

    // ---- Mandat de prelevement ----
    // Autorise tontine par tontine : donner un blanc-seing sur tous ses
    // groupes n'est pas la meme decision que sur un seul.
    prelevementAuto: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Reglement automatique de la cotisation avant l'echeance"
    },
    prelevementJoursAvant: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 2,
        comment: "Delai avant echeance auquel le prelevement est tente"
    }
}, {
    tableName: 'tontine_membres',
    timestamps: true,
    indexes: [
        // Invariant metier : un client ne peut etre membre du meme groupe qu'une fois
        { unique: true, fields: ['groupeId', 'clientId'] }
    ]
});

module.exports = TontineMembre;

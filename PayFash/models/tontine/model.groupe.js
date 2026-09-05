const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Caisse 1 (le tour) + caisse 2 (epargne/credit) + caisse 4 (amendes).
// La caisse de solidarite est hors perimetre : pas de type 'social'.
const TontineGroupe = db.define("TontineGroupe", {
    nom: {
        type: DataTypes.STRING(150),
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    photoUrl: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    type: {
        type: DataTypes.ENUM('rotative', 'credit', 'mixte'),
        allowNull: false,
        defaultValue: 'rotative',
        comment: "rotative = caisse 1 seule, credit = caisse 2 seule, mixte = les deux"
    },
    montantParPeriode: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Cotisation due par membre et par periode"
    },
    devise: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'XAF'
    },
    frequence: {
        type: DataTypes.ENUM('hebdomadaire', 'quinzaine', 'mensuelle', 'trimestrielle'),
        allowNull: false,
        defaultValue: 'mensuelle'
    },
    membresMax: {
        type: DataTypes.SMALLINT,
        allowNull: false
    },
    membresActuels: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 0
    },
    modeOrdre: {
        type: DataTypes.ENUM('tirage', 'vote', 'enchere', 'anciennete'),
        allowNull: false,
        defaultValue: 'tirage',
        comment: "Mode de determination de l'ordre de passage"
    },
    pourcentageCaution: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 10.00,
        comment: "Pourcentage du montant par periode bloque en caution a l'entree"
    },
    bareme: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Bareme des amendes par motif, ex: { retard: 500, absence: 1000 }",
        // MariaDB expose JSON comme un simple LONGTEXT : le pilote ne re-parse
        // pas a la lecture, contrairement a MySQL 8. Ce getter garantit un
        // objet cote application quel que soit le serveur.
        get() {
            const valeur = this.getDataValue('bareme');
            if (typeof valeur !== 'string') return valeur;
            try { return JSON.parse(valeur); } catch (e) { return valeur; }
        }
    },
    destinationAmendes: {
        type: DataTypes.ENUM('epargne', 'pot_cycle'),
        allowNull: false,
        defaultValue: 'epargne',
        comment: "Decision D7 : ou tombe l'argent des amendes (caisse 4)"
    },
    portefeuilleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Caisse du groupe : porte le pot du cycle, revient a zero a chaque versement"
    },
    portefeuilleCautionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Sequestre des cautions. Distinct de la caisse, qui doit revenir a zero."
    },
    portefeuilleEpargneId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Caisse d'epargne (caisse 2), alimentee par les amendes si destinationAmendes = 'epargne'"
    },
    modeAcces: {
        type: DataTypes.ENUM('prive', 'lien', 'public'),
        allowNull: false,
        defaultValue: 'prive'
    },
    codeInvitation: {
        type: DataTypes.STRING(12),
        allowNull: false,
        unique: true
    },
    statut: {
        type: DataTypes.ENUM('en_attente', 'actif', 'termine', 'suspendu'),
        allowNull: false,
        defaultValue: 'en_attente'
    },
    createurId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Client organisateur, president par defaut"
    },
    dateDebut: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    numeroCycleActuel: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'tontine_groupes',
    timestamps: true
});

module.exports = TontineGroupe;

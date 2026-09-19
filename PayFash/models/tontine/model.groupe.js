const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// Un groupe de tontine est un tour rotatif : chacun cotise a chaque
// periode, et le pot revient a un membre par cycle jusqu'a ce que tous
// aient ete servis. La caution et les amendes en sont la discipline.
//
// La colonne `type` distinguait trois formules — rotative, credit, mixte —
// selon que le groupe tenait aussi une caisse d'epargne et de credit. Cette
// caisse a ete retiree : il ne reste qu'une formule, et plus rien a
// distinguer.
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
    // Couverture exigee avant de recevoir le pot, en part de ce qui reste
    // a payer : { tauxParDefaut, paliers: [{ jusquAuTour | jusquAuTiers, taux }] }.
    // Null : aucune exigence. Voir services/tontine/couverture.service.js.
    reglesCouverture: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Couverture exigee par rang de tour ; null = aucune exigence",
        get() {
            const valeur = this.getDataValue('reglesCouverture');
            if (typeof valeur !== 'string') return valeur;
            try { return JSON.parse(valeur); } catch (e) { return valeur; }
        }
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
    modeAcces: {
        type: DataTypes.ENUM('prive', 'lien', 'public'),
        allowNull: false,
        defaultValue: 'prive'
    },
    preuveTirage: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: "Empreinte SHA-256 du tirage d'ordre, figee au demarrage. Elle etait calculee puis jetee : personne ne pouvait verifier a posteriori que l'ordre n'avait pas ete rejoue."
    },
    cautionObligatoire: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Si vrai, le groupe refuse de demarrer tant qu'un membre actif n'a pas bloque sa caution"
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

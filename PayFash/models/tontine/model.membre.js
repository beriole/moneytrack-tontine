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
        type: DataTypes.ENUM('president', 'membre'),
        allowNull: false,
        defaultValue: 'membre',
        comment: "Une seule charge humaine : le president. Censeur, secretaire puis tresorier ont ete retires — ce qui relevait de la decision revient au president, ce qui relevait de l'execution (encaisser, saisir, decaisser, depouiller) revient au systeme. Le role est porte par l'adhesion, jamais par le compte : on preside un groupe, pas l'application."
    },
    statut: {
        // 'sorti' et 'termine' manquaient : quitter un groupe n'etait
        // representable que par une exclusion — un depart volontaire
        // prenait la couleur d'une sanction — et un membre restait 'actif'
        // indefiniment dans une tontine achevee.
        type: DataTypes.ENUM('invite', 'actif', 'suspendu', 'exclu', 'sorti', 'termine'),
        allowNull: false,
        defaultValue: 'invite',
        comment: "invite/actif/suspendu = en cours ; exclu = sanction, sorti = depart volontaire, termine = rotation achevee"
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
    },
    motifExclusion: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Motif de l'exclusion. Il etait consigne dans une TontineAmende de 0 FCFA au statut 'annulee', qui polluait ensuite la liste des amendes du membre."
    },
    dateExclusion: {
        type: DataTypes.DATE,
        allowNull: true
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

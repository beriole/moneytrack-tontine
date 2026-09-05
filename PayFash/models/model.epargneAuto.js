const { DataTypes } = require('sequelize');
const db = require('../config/bd');

const EpargneAutomatique = db.define('EpargneAutomatique', {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "ID de l'utilisateur"
    },
    estActif: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Activation/désactivation"
    },
    
    // Type d'épargne automatique
    type: {
        type: DataTypes.ENUM('arrondi', 'montant_fixe', 'pourcentage_depot', 'solde_arrondi'),
        allowNull: false,
        comment: "Type: arrondi, montant fixe, pourcentage dépôt, arrondi du solde"
    },
    
    // Pour l'arrondi
    arrondiSuperieur: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Arrondir au supérieur"
    },
    pasArrondi: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: "Pas d'arrondi (100, 500, 1000, etc.)"
    },
    
    // Pour montant fixe
    montantFixe: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "Montant à déposer automatiquement"
    },
    
    // Pourcentage du dépôt
    pourcentageDepot: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "Pourcentage du montant du dépôt"
    },
    
    // Fréquence
    frequence: {
        type: DataTypes.ENUM('quotidien', 'hebdomadaire', 'mensuel', 'a_chaque_depot'),
        allowNull: false,
        defaultValue: 'a_chaque_depot',
        comment: "Fréquence de l'épargne automatique"
    },
    
    // Portefeuille cible
    portefeuilleCibleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "ID du portefeuille d'épargne cible"
    },
    
    // Limites
    depotMinimal: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "Dépôt minimum pour activer l'arrondi"
    },
    depotMaximal: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "Montant maximum par arrondi"
    },
    
    // Jours de dépôt (pour hebdomadaire/mensuel)
    jourDepot: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Jour de la semaine (0=dimanche) ou du mois (1-31)"
    },
    
    // Suivi
    totalEpargne: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: "Total économisé depuis le début"
    },
    nbOperations: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Nombre d'opérations effectuées"
    },
    dernierArrondi: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Date du dernier arrondi"
    },
    
    // Notifications
    notifierArrondi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Notifier à chaque arrondi"
    }
});

module.exports = EpargneAutomatique;

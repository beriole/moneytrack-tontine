const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

// =====================================================================
//  Garantie — des fonds du membre, bloques pour couvrir ses cotisations
//  futures dans UN groupe.
//
//  Plus un membre recoit le pot tot, plus il lui reste a payer : celui qui
//  mange au tour 3 d'une tontine de 10 doit encore 7 cotisations. La
//  caution existante — un pourcentage d'une seule cotisation, depose au
//  sequestre du groupe — ne couvre qu'une fraction de cet engagement.
//
//  La garantie complete la caution, avec deux differences :
//
//    - l'argent NE BOUGE PAS. Il reste sur le portefeuille du membre, qui
//      le voit et le possede ; seule sa part disponible baisse
//      (Portefeuille.montantReserve). Il n'est deplace que si une
//      cotisation reste impayee — et pour le seul montant manquant ;
//    - elle n'existe que par consentement explicite : une ligne de
//      ConsentementGarantie porte le texte exact accepte, son empreinte,
//      et la version du reglement en vigueur.
//
//  Trois montants la decrivent : ce qui a ete bloque a l'origine, ce qui
//  a ete mobilise pour couvrir un impaye, ce qui a ete rendu. Le solde
//  encore bloque est initial - utilise - libere.
// =====================================================================
const TontineGarantie = db.define("TontineGarantie", {
    groupeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    membreId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    portefeuilleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Le portefeuille dont une part est bloquee. C'est lui, pas un compteur d'objectif, qui porte l'argent."
    },
    type: {
        type: DataTypes.ENUM('EPARGNE', 'PROJET', 'PORTEFEUILLE'),
        allowNull: false,
        comment: "Nature du portefeuille source, figee a l'affectation pour l'affichage"
    },
    montantInitial: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    montantUtilise: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Mobilise pour couvrir des cotisations impayees"
    },
    montantLibere: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Rendu au disponible du membre"
    },
    statut: {
        type: DataTypes.ENUM('active', 'partiellement_utilisee', 'utilisee', 'liberee', 'annulee'),
        allowNull: false,
        defaultValue: 'active'
    },
    consentementId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    expireLe: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Sans valeur, la garantie court jusqu'a l'extinction des engagements"
    }
}, {
    tableName: 'tontine_garanties',
    timestamps: true,
    indexes: [
        { fields: ['clientId'] },
        { fields: ['groupeId', 'clientId'] },
        { fields: ['portefeuilleId'] }
    ]
});

module.exports = TontineGarantie;

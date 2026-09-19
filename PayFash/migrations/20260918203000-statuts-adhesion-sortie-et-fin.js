'use strict';

// =====================================================================
//  Deux statuts d'adhesion manquaient.
//
//  TontineMembre.statut connaissait quatre etats : invite, actif, suspendu,
//  exclu. Il manquait les deux fins de parcours qui ne sont pas des
//  sanctions :
//
//    sorti    le membre s'est retire de lui-meme, avant que la rotation ne
//             commence. C'etait impossible a representer : quitter un
//             groupe se faisait en etant exclu — le depart volontaire
//             prenait la couleur d'une sanction, et le motif d'exclusion
//             restait vide.
//
//    termine  la rotation s'est achevee et le membre est alle au bout de
//             ses engagements. Il restait 'actif' indefiniment dans un
//             groupe clos, ce qui faussait tout comptage de membres
//             actifs et toute reprise d'historique.
//
//  Migration purement additive : aucune ligne existante ne change d'etat.
// =====================================================================

const TABLE = 'tontine_membres';

const ANCIENS = ['invite', 'actif', 'suspendu', 'exclu'];
const NOUVEAUX = ['invite', 'actif', 'suspendu', 'exclu', 'sorti', 'termine'];

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.changeColumn(TABLE, 'statut', {
            type: Sequelize.ENUM(...NOUVEAUX),
            allowNull: false,
            defaultValue: 'invite'
        });
    },

    async down(queryInterface, Sequelize) {
        // Les etats retires n'ont pas d'equivalent ancien : 'sorti' se
        // rapproche d'une exclusion sans motif, 'termine' d'une adhesion
        // active. On les ramene la plutot que de les laisser vides.
        await queryInterface.sequelize.query(
            `UPDATE \`${TABLE}\` SET statut = 'exclu' WHERE statut = 'sorti'`
        );
        await queryInterface.sequelize.query(
            `UPDATE \`${TABLE}\` SET statut = 'actif' WHERE statut = 'termine'`
        );
        await queryInterface.changeColumn(TABLE, 'statut', {
            type: Sequelize.ENUM(...ANCIENS),
            allowNull: false,
            defaultValue: 'invite'
        });
    }
};

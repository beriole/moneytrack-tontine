'use strict';

// =====================================================================
//  Couverture exigee par groupe.
//
//  Une colonne JSON sur tontine_groupes : la part de ce qui reste a payer
//  qu'un membre doit avoir garantie avant de recevoir le pot, eventuellement
//  plus elevee pour les premiers tours. Voir couverture.service.js.
//
//  Nulle par defaut : les groupes existants n'exigent rien, et leur
//  comportement ne change pas. La regle s'adopte a la creation d'un groupe
//  ou par un vote de modification des regles.
// =====================================================================

const TABLE = 'tontine_groupes';
const COLONNE = 'reglesCouverture';

module.exports = {
    async up(queryInterface, Sequelize) {
        const d = await queryInterface.describeTable(TABLE);
        if (Object.prototype.hasOwnProperty.call(d, COLONNE)) return;
        await queryInterface.addColumn(TABLE, COLONNE, {
            type: Sequelize.JSON,
            allowNull: true,
            comment: 'Couverture exigee par rang de tour ; null = aucune exigence'
        });
    },

    async down(queryInterface) {
        const d = await queryInterface.describeTable(TABLE);
        if (Object.prototype.hasOwnProperty.call(d, COLONNE)) await queryInterface.removeColumn(TABLE, COLONNE);
    }
};

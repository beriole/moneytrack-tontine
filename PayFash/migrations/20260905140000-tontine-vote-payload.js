'use strict';

// =====================================================================
//  Phase 4 — charge utile des votes.
//
//  Un vote « elire_ordre » porte un ordre de passage propose, un vote
//  « modifier_regles » porte les champs a changer. Sans colonne dediee,
//  la resolution du vote ne peut rien appliquer : c'est exactement le
//  trou de NjanguiPay, ou le vote existait mais ne produisait aucun effet.
// =====================================================================

async function aColonne(qi, table, colonne, options) {
    const description = await qi.describeTable(table, options);
    return Object.prototype.hasOwnProperty.call(description, colonne);
}

module.exports = {
    async up(queryInterface, Sequelize) {
        if (await aColonne(queryInterface, 'tontine_votes', 'payload')) return;
        await queryInterface.addColumn('tontine_votes', 'payload', {
            type: Sequelize.JSON,
            allowNull: true,
            comment: "Ce que le vote applique s'il est adopte (ordre propose, regles modifiees...)"
        });
    },

    async down(queryInterface) {
        if (!(await aColonne(queryInterface, 'tontine_votes', 'payload'))) return;
        await queryInterface.removeColumn('tontine_votes', 'payload');
    }
};

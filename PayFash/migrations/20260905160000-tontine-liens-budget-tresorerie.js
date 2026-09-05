'use strict';

// =====================================================================
//  Synchronisation tontine <-> reste de MoneyTrack.
//
//  Trois liens, portes par l'adhesion du membre — c'est le bon niveau :
//  chaque membre gere SON budget et SA destination, pas celle du groupe.
//
//    budgetId + categorieId       la cotisation s'inscrit automatiquement
//                                 comme depense dans le budget du membre,
//                                 pour que le budget cesse de mentir ;
//    portefeuilleDestinationId    ou tombe le tour quand il arrive : le
//                                 courant par defaut, ou un projet, ou une
//                                 epargne. C'est le moment ou une tontine
//                                 finance reellement quelque chose.
// =====================================================================

async function aColonne(qi, table, colonne, options) {
    const description = await qi.describeTable(table, options);
    return Object.prototype.hasOwnProperty.call(description, colonne);
}

const COLONNES = [
    ['budgetId', 'Budget du membre ou la cotisation est imputee'],
    ['categorieId', "Categorie de ce budget qui porte l'engagement tontine"],
    ['portefeuilleDestinationId', 'Portefeuille qui recoit le tour (projet, epargne...). Null = le courant'],
];

module.exports = {
    async up(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            for (const [colonne, commentaire] of COLONNES) {
                if (!(await aColonne(queryInterface, 'tontine_membres', colonne, opts))) {
                    await queryInterface.addColumn('tontine_membres', colonne, {
                        type: Sequelize.INTEGER, allowNull: true, comment: commentaire
                    }, opts);
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    },

    async down(queryInterface) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            for (const [colonne] of [...COLONNES].reverse()) {
                if (await aColonne(queryInterface, 'tontine_membres', colonne, opts)) {
                    await queryInterface.removeColumn('tontine_membres', colonne, opts);
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    }
};

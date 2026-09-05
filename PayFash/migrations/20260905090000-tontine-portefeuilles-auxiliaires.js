'use strict';

// =====================================================================
//  Phase 3 — deux portefeuilles auxiliaires par groupe.
//
//  La caisse (portefeuilleId) porte le pot du cycle en cours et revient a
//  zero a chaque versement : c'est un invariant du noyau rotatif. Elle ne
//  peut donc pas heberger d'argent qui doit survivre au versement.
//
//    portefeuilleCautionId  sequestre des cautions des membres
//    portefeuilleEpargneId  caisse 2, alimentee par les amendes quand
//                           destinationAmendes = 'epargne'
//
//  Les colonnes sont nullables : les portefeuilles sont crees a la demande
//  pour que les groupes existants continuent de fonctionner.
// =====================================================================

async function aColonne(qi, table, colonne, options) {
    const description = await qi.describeTable(table, options);
    return Object.prototype.hasOwnProperty.call(description, colonne);
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            for (const [colonne, commentaire] of [
                ['portefeuilleCautionId', 'Sequestre des cautions du groupe'],
                ['portefeuilleEpargneId', "Caisse d'epargne du groupe (caisse 2)"]
            ]) {
                if (!(await aColonne(queryInterface, 'tontine_groupes', colonne, opts))) {
                    await queryInterface.addColumn('tontine_groupes', colonne, {
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
            for (const colonne of ['portefeuilleEpargneId', 'portefeuilleCautionId']) {
                if (await aColonne(queryInterface, 'tontine_groupes', colonne, opts)) {
                    await queryInterface.removeColumn('tontine_groupes', colonne, opts);
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    }
};

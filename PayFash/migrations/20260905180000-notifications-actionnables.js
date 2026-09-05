'use strict';

// =====================================================================
//  Rendre les notifications actionnables.
//
//  Le modele existant porte un message et un Type (system/promo/alerte).
//  Il lui manque de quoi savoir OU emmener l'utilisateur : une alerte
//  « votre cotisation est due dans 3 jours » qui n'ouvre pas l'ecran de
//  cotisation oblige a chercher, et on ne cherche pas.
//
//    categorie   pour filtrer et grouper (tontine, budget, epargne...)
//    lien        { ecran, params } — la destination dans l'application
//
//  Les deux colonnes servent toute l'application, pas seulement la
//  tontine : c'est la couche de notification commune qui manquait.
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
            if (!(await aColonne(queryInterface, 'Notifications', 'categorie', opts))) {
                await queryInterface.addColumn('Notifications', 'categorie', {
                    type: Sequelize.STRING(40), allowNull: true,
                    comment: "Domaine metier : tontine, budget, epargne, kyc..."
                }, opts);
            }
            if (!(await aColonne(queryInterface, 'Notifications', 'lien', opts))) {
                await queryInterface.addColumn('Notifications', 'lien', {
                    type: Sequelize.JSON, allowNull: true,
                    comment: "Destination dans l'application : { ecran, params }"
                }, opts);
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
            for (const c of ['lien', 'categorie']) {
                if (await aColonne(queryInterface, 'Notifications', c, opts)) {
                    await queryInterface.removeColumn('Notifications', c, opts);
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    }
};

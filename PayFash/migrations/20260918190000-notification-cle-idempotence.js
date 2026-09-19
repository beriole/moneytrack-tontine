'use strict';

// =====================================================================
//  Notifications.cle — la colonne qui rend un rappel idempotent.
//
//  Le modele la declare depuis la mise en place des rappels de cotisation :
//  une chaine unique de la forme « cot-<cycle>-<client>-j3 », qui garantit
//  qu'un rappel « votre cotisation est due dans 3 jours » ne part qu'une
//  fois. Sans elle, le planificateur — qui passe toutes les 6 heures —
//  reexpediait le meme rappel a chaque passage, soit quatre fois par jour,
//  et un rappel de retard indefiniment.
//
//  Mais aucune migration ne l'a jamais creee : le modele a evolue apres
//  20260905180000-notifications-actionnables, qui n'ajoutait que categorie
//  et lien. L'ecart ne s'est pas vu parce que l'envoi d'une notification est
//  enveloppe dans un try/catch silencieux partout ou il est appele —
//  l'echec SQL etait avale, et les rappels ne partaient simplement plus.
//
//  L'unicite tolere plusieurs NULL sous MySQL comme sous MariaDB : les
//  lignes existantes, qui n'ont pas de cle, ne s'en trouvent pas genees.
// =====================================================================

const TABLE = 'Notifications';
const COLONNE = 'cle';

async function aColonne(qi, options) {
    const description = await qi.describeTable(TABLE, options);
    return Object.prototype.hasOwnProperty.call(description, COLONNE);
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            if (!(await aColonne(queryInterface, opts))) {
                await queryInterface.addColumn(TABLE, COLONNE, {
                    type: Sequelize.STRING(140),
                    allowNull: true,
                    unique: true,
                    comment: "Cle d'idempotence : un meme rappel ne part qu'une fois"
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
            if (await aColonne(queryInterface, opts)) {
                await queryInterface.removeColumn(TABLE, COLONNE, opts);
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    }
};

'use strict';

// =====================================================================
//  Module tontine — modifications des tables EXISTANTES.
//
//  Les 16 tables tontine_* sont creees par db.sync() au demarrage
//  (CREATE TABLE IF NOT EXISTS). Cette migration ne traite que ce que
//  sync() ne sait pas faire : modifier des tables deja peuplees.
//
//  1. Portefeuilles : la caisse d'un groupe est un vrai portefeuille,
//     detenu par le groupe et non par un client.
//  2. transactions  : rattacher une ecriture a un groupe / un cycle,
//     et lui donner une reference unique idempotente.
//
//  Chaque operation est gardee par une verification d'existence : sur une
//  base neuve, sync() a deja cree ces colonnes a partir des modeles, et la
//  migration doit alors etre un no-op plutot qu'une erreur.
//
//  ATTENTION : faire un dump de la base avant d'executer.
//    mysqldump -u <user> -p <base> > backup.sql
//    npx sequelize-cli db:migrate
// =====================================================================

const TYPES_PORTEFEUILLE = ['courant', 'epargne', 'projet', 'personnel', 'affaires', 'autre'];

async function aColonne(qi, table, colonne, options) {
    const description = await qi.describeTable(table, options);
    return Object.prototype.hasOwnProperty.call(description, colonne);
}

async function ajouterSiAbsente(qi, table, colonne, definition, options) {
    if (await aColonne(qi, table, colonne, options)) return;
    await qi.addColumn(table, colonne, definition, options);
}

async function retirerSiPresente(qi, table, colonne, options) {
    if (!(await aColonne(qi, table, colonne, options))) return;
    await qi.removeColumn(table, colonne, options);
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            // --- 1. Portefeuilles -------------------------------------
            // La caisse d'une tontine n'appartient a aucun client : le
            // proprietaire devient facultatif.
            await queryInterface.changeColumn('Portefeuilles', 'ClientPortefeuilleId', {
                type: Sequelize.INTEGER,
                allowNull: true
            }, opts);

            // MySQL : MODIFY COLUMN reecrit l'ENUM avec la valeur ajoutee.
            // Idempotent, la commande est la meme si 'tontine' y est deja.
            await queryInterface.changeColumn('Portefeuilles', 'typePortefeuille', {
                type: Sequelize.ENUM(...TYPES_PORTEFEUILLE, 'tontine'),
                allowNull: false,
                defaultValue: 'personnel'
            }, opts);

            await ajouterSiAbsente(queryInterface, 'Portefeuilles', 'groupeTontineId', {
                type: Sequelize.INTEGER,
                allowNull: true,
                comment: "Groupe proprietaire quand typePortefeuille = 'tontine'"
            }, opts);

            // --- 2. transactions --------------------------------------
            await ajouterSiAbsente(queryInterface, 'transactions', 'groupeTontineId', {
                type: Sequelize.INTEGER,
                allowNull: true
            }, opts);

            await ajouterSiAbsente(queryInterface, 'transactions', 'cycleTontineId', {
                type: Sequelize.INTEGER,
                allowNull: true
            }, opts);

            // Reference unique : rend un rejeu (webhook, retry client)
            // inoffensif. Les lignes existantes restent a NULL, et MySQL
            // autorise plusieurs NULL dans un index unique.
            await ajouterSiAbsente(queryInterface, 'transactions', 'reference', {
                type: Sequelize.STRING(64),
                allowNull: true,
                unique: true
            }, opts);

            const index = await queryInterface.showIndex('transactions', opts);
            if (!index.some(i => i.name === 'transactions_tontine_idx')) {
                await queryInterface.addIndex('transactions', ['groupeTontineId', 'cycleTontineId'], {
                    name: 'transactions_tontine_idx',
                    transaction: t
                });
            }

            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    },

    async down(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            const index = await queryInterface.showIndex('transactions', opts);
            if (index.some(i => i.name === 'transactions_tontine_idx')) {
                await queryInterface.removeIndex('transactions', 'transactions_tontine_idx', opts);
            }
            await retirerSiPresente(queryInterface, 'transactions', 'reference', opts);
            await retirerSiPresente(queryInterface, 'transactions', 'cycleTontineId', opts);
            await retirerSiPresente(queryInterface, 'transactions', 'groupeTontineId', opts);

            await retirerSiPresente(queryInterface, 'Portefeuilles', 'groupeTontineId', opts);

            // Retour a l'ENUM d'origine. Echoue volontairement si des
            // portefeuilles de type 'tontine' existent encore : il faut les
            // traiter a la main plutot que de les corrompre silencieusement.
            await queryInterface.changeColumn('Portefeuilles', 'typePortefeuille', {
                type: Sequelize.ENUM(...TYPES_PORTEFEUILLE),
                allowNull: false,
                defaultValue: 'personnel'
            }, opts);

            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    }
};

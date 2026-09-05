'use strict';

// =====================================================================
//  Le mandat de prelevement.
//
//  « Ne rate plus jamais une cotisation. » Le membre autorise le systeme
//  a regler sa cotisation quelques jours avant l'echeance, depuis son
//  portefeuille. Une amende evitee vaut mieux qu'une amende notifiee.
//
//  C'est volontairement distinct d'EpargneAutomatique : celle-ci
//  ACCUMULE de l'epargne (arrondis, versements reguliers), le mandat
//  REGLE une dette a date. Les confondre donnerait un modele qui ne fait
//  bien ni l'un ni l'autre.
//
//  Porte par l'adhesion : on autorise le prelevement tontine par tontine,
//  pas globalement — donner un blanc-seing sur tous ses groupes n'est pas
//  la meme decision.
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
            if (!(await aColonne(queryInterface, 'tontine_membres', 'prelevementAuto', opts))) {
                await queryInterface.addColumn('tontine_membres', 'prelevementAuto', {
                    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
                    comment: "Le membre autorise le reglement automatique de sa cotisation"
                }, opts);
            }
            if (!(await aColonne(queryInterface, 'tontine_membres', 'prelevementJoursAvant', opts))) {
                await queryInterface.addColumn('tontine_membres', 'prelevementJoursAvant', {
                    type: Sequelize.SMALLINT, allowNull: false, defaultValue: 2,
                    comment: "Combien de jours avant l'echeance le prelevement est tente"
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
            for (const c of ['prelevementJoursAvant', 'prelevementAuto']) {
                if (await aColonne(queryInterface, 'tontine_membres', c, opts)) {
                    await queryInterface.removeColumn('tontine_membres', c, opts);
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    }
};

'use strict';

// =====================================================================
//  Paiements externes — Fapshi.
//
//  On ETEND le modele Paiement existant plutot que d'ouvrir une seconde
//  table de paiements a cote. Il lui manquait tout ce qui fait un
//  paiement fiable face a un agregateur :
//
//    reference       notre identifiant, unique — c'est lui qui rend
//                    l'operation idempotente. Un webhook rejoue trois
//                    fois ne doit crediter qu'une fois.
//    providerTxId    l'identifiant Fapshi, pour re-verifier a la source.
//    sens            entrant (recharge) ou sortant (retrait) : sans lui
//                    on ne sait pas dans quel sens l'argent va.
//    portefeuilleId  quel portefeuille est credite ou debite.
//    donnees         la reponse brute du fournisseur, pour l'audit et
//                    les litiges — on ne rejoue pas un paiement de
//                    memoire.
// =====================================================================

async function aColonne(qi, table, colonne, options) {
    const description = await qi.describeTable(table, options);
    return Object.prototype.hasOwnProperty.call(description, colonne);
}

const COLONNES = (S) => ([
    ['reference', { type: S.STRING(64), allowNull: true, unique: true, comment: "Identifiant d'idempotence cote MoneyTrack" }],
    ['providerTxId', { type: S.STRING(80), allowNull: true, comment: 'Identifiant de la transaction chez le fournisseur' }],
    ['fournisseur', { type: S.STRING(20), allowNull: true, comment: 'fapshi, orange_money...' }],
    ['medium', { type: S.STRING(30), allowNull: true, comment: 'mobile money, orange money, carte...' }],
    ['sens', { type: S.ENUM('entrant', 'sortant'), allowNull: true, comment: 'Recharge ou retrait' }],
    ['portefeuilleId', { type: S.INTEGER, allowNull: true, comment: 'Portefeuille credite ou debite' }],
    ['lienPaiement', { type: S.TEXT, allowNull: true, comment: 'URL de la page de paiement du fournisseur' }],
    ['dateConfirmation', { type: S.DATE, allowNull: true }],
    ['donnees', { type: S.JSON, allowNull: true, comment: 'Reponse brute du fournisseur, pour audit' }],
]);

module.exports = {
    async up(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            for (const [nom, def] of COLONNES(Sequelize)) {
                if (!(await aColonne(queryInterface, 'Paiements', nom, opts))) {
                    await queryInterface.addColumn('Paiements', nom, def, opts);
                }
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
            for (const [nom] of COLONNES(Sequelize).reverse()) {
                if (await aColonne(queryInterface, 'Paiements', nom, opts)) {
                    await queryInterface.removeColumn('Paiements', nom, opts);
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    }
};

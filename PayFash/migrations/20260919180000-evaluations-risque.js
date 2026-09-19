'use strict';

// =====================================================================
//  Evaluations de risque (sections 11 a 14).
//
//  Chaque evaluation conservee dit quand, dans quel contexte, avec quelles
//  donnees, selon quelles regles et quelle version du moteur un niveau de
//  risque a ete produit — et quels facteurs l'expliquent.
//
//  Le risque ne decide de rien a ce stade : il accompagne les decisions
//  d'eligibilite (versement, adhesion, enchere) sans les modifier. Les
//  decisions restent au moteur de regles d'eligibilite.
// =====================================================================

const TABLE = 'evaluations_risque';

module.exports = {
    async up(queryInterface, Sequelize) {
        const S = Sequelize;
        const tables = (await queryInterface.showAllTables())
            .map(t => String(typeof t === 'string' ? t : t.tableName).toLowerCase());
        if (tables.includes(TABLE)) return;

        await queryInterface.createTable(TABLE, {
            id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
            clientId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'clients', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            groupeId: { type: S.INTEGER, allowNull: true, comment: 'Tontine concernee par la decision, le cas echeant' },
            contexte: { type: S.STRING(32), allowNull: false, comment: 'versement, adhesion, enchere, admin' },
            niveau: { type: S.ENUM('FAIBLE', 'MODERE', 'ELEVE'), allowNull: false },
            score: { type: S.INTEGER, allowNull: false },
            donneesSuffisantes: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
            facteurs: { type: S.JSON, allowNull: false },
            donnees: { type: S.JSON, allowNull: false, comment: 'Chiffres utilises, tels que lus au moment du calcul' },
            regles: { type: S.JSON, allowNull: false, comment: 'Seuils et points appliques' },
            versionMoteur: { type: S.STRING(32), allowNull: false },
            createdAt: { type: S.DATE, allowNull: false }
        });
        await queryInterface.addIndex(TABLE, ['clientId', 'createdAt']);
        await queryInterface.sequelize.query(
            `ALTER TABLE ${TABLE} ADD CONSTRAINT chk_risque_score CHECK (score BETWEEN 0 AND 100)`);
    },

    async down(queryInterface) {
        const tables = (await queryInterface.showAllTables())
            .map(t => String(typeof t === 'string' ? t : t.tableName).toLowerCase());
        if (tables.includes(TABLE)) await queryInterface.dropTable(TABLE);
    }
};

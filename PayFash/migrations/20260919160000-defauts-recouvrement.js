'use strict';

// =====================================================================
//  Defauts et recouvrement.
//
//  1. tontine_groupes.politiqueRecouvrement
//
//     L'ordre des sources de recouvrement et le delai de grace, propres a
//     chaque groupe et ecrits dans son reglement. Nulle pour les groupes
//     existants : ils gardent l'ordre qui etait code en dur (caution puis
//     garanties, sans delai). Voir services/tontine/politiqueRecouvrement.js.
//
//  2. tontine_cotisations.montantRecouvre
//
//     La part de montantPaye qui ne vient pas d'un geste du membre :
//     caution saisie, garantie mobilisee, retenue sur son pot. Une
//     cotisation « payee » dont montantRecouvre > 0 a ete payee par
//     recouvrement — l'ecran et l'historique doivent le dire.
//
//  3. tontine_incidents_defaut
//
//     Ce qu'aucune source n'a couvert. Un incident par cotisation, ouvert
//     quand le recouvrement s'arrete avant le solde, clos quand la
//     cotisation est enfin soldee — par le membre ou par une source.
// =====================================================================

const TABLE = 'tontine_incidents_defaut';

module.exports = {
    async up(queryInterface, Sequelize) {
        const S = Sequelize;

        const groupes = await queryInterface.describeTable('tontine_groupes');
        if (!Object.prototype.hasOwnProperty.call(groupes, 'politiqueRecouvrement')) {
            await queryInterface.addColumn('tontine_groupes', 'politiqueRecouvrement', {
                type: S.JSON, allowNull: true,
                comment: 'Ordre des sources et delai de grace ; null = ordre historique (caution, garanties)'
            });
        }

        const cotisations = await queryInterface.describeTable('tontine_cotisations');
        if (!Object.prototype.hasOwnProperty.call(cotisations, 'montantRecouvre')) {
            await queryInterface.addColumn('tontine_cotisations', 'montantRecouvre', {
                type: S.DECIMAL(15, 2), allowNull: false, defaultValue: 0,
                comment: 'Part de montantPaye obtenue par recouvrement (caution, garantie, retenue sur pot)'
            });
            // Les saisies passees ne sont pas reconstituees : l'ecriture
            // comptable de chaque saisie reste la source de verite.
        }

        const tables = (await queryInterface.showAllTables())
            .map(t => String(typeof t === 'string' ? t : t.tableName).toLowerCase());
        if (!tables.includes(TABLE)) {
            await queryInterface.createTable(TABLE, {
                id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                groupeId: {
                    type: S.INTEGER, allowNull: false,
                    references: { model: 'tontine_groupes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
                },
                cycleId: {
                    type: S.INTEGER, allowNull: false,
                    references: { model: 'tontine_cycles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
                },
                cotisationId: {
                    type: S.INTEGER, allowNull: false, unique: true,
                    references: { model: 'tontine_cotisations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
                },
                clientId: {
                    type: S.INTEGER, allowNull: false,
                    references: { model: 'clients', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
                },
                montantInitial: { type: S.DECIMAL(15, 2), allowNull: false,
                    comment: 'Reste du a l ouverture, apres epuisement des sources' },
                resteDu: { type: S.DECIMAL(15, 2), allowNull: false },
                statut: { type: S.ENUM('ouvert', 'regle'), allowNull: false, defaultValue: 'ouvert' },
                sourcesEssayees: { type: S.JSON, allowNull: true,
                    comment: 'Ce que chaque source a apporte avant l ouverture' },
                modeReglement: { type: S.ENUM('membre', 'recouvrement', 'retenue_pot'), allowNull: true },
                ouvertLe: { type: S.DATE, allowNull: false },
                regleLe: { type: S.DATE, allowNull: true },
                createdAt: { type: S.DATE, allowNull: false },
                updatedAt: { type: S.DATE, allowNull: false }
            });
            await queryInterface.addIndex(TABLE, ['clientId', 'statut']);
            await queryInterface.addIndex(TABLE, ['groupeId', 'statut']);
            await queryInterface.sequelize.query(
                `ALTER TABLE ${TABLE} ADD CONSTRAINT chk_incident_reste CHECK (resteDu >= 0 AND resteDu <= montantInitial)`);
        }
    },

    async down(queryInterface) {
        const tables = (await queryInterface.showAllTables())
            .map(t => String(typeof t === 'string' ? t : t.tableName).toLowerCase());
        if (tables.includes(TABLE)) await queryInterface.dropTable(TABLE);

        const cotisations = await queryInterface.describeTable('tontine_cotisations');
        if (Object.prototype.hasOwnProperty.call(cotisations, 'montantRecouvre')) {
            await queryInterface.removeColumn('tontine_cotisations', 'montantRecouvre');
        }
        const groupes = await queryInterface.describeTable('tontine_groupes');
        if (Object.prototype.hasOwnProperty.call(groupes, 'politiqueRecouvrement')) {
            await queryInterface.removeColumn('tontine_groupes', 'politiqueRecouvrement');
        }
    }
};

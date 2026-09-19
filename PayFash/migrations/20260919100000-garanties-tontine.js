'use strict';

// =====================================================================
//  Garanties de tontine.
//
//  Trois tables :
//
//    tontine_consentements_garantie  le texte exact que le membre a
//                                    accepte, son empreinte, la version
//                                    du reglement, l'adresse ;
//    tontine_garanties               des fonds du membre bloques sur son
//                                    propre portefeuille pour couvrir ses
//                                    cotisations futures dans un groupe ;
//    tontine_garantie_mouvements     chaque blocage, mobilisation et
//                                    liberation, avec son motif et son
//                                    acteur.
//
//  L'argent d'une garantie ne quitte pas le portefeuille du membre : il
//  est compte dans Portefeuilles.montantReserve (migration precedente).
//  La somme des garanties encore bloquees d'un portefeuille doit donc
//  egaler sa reserve — scripts/verifier-tontine.js le controle.
// =====================================================================

module.exports = {
    async up(queryInterface, Sequelize) {
        const S = Sequelize;
        const horodatage = {
            createdAt: { type: S.DATE, allowNull: false }
        };

        await queryInterface.createTable('tontine_consentements_garantie', {
            id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
            clientId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'clients', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            groupeId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'tontine_groupes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            portefeuilleId: { type: S.INTEGER, allowNull: false },
            montant: { type: S.DECIMAL(15, 2), allowNull: false },
            texte: { type: S.TEXT, allowNull: false, comment: "Le texte integral accepte, tel qu'affiche" },
            hashTexte: { type: S.STRING(64), allowNull: false, comment: 'SHA-256 du texte' },
            versionReglement: { type: S.SMALLINT, allowNull: true },
            accepteLe: { type: S.DATE, allowNull: false },
            adresseIp: { type: S.STRING(45), allowNull: true },
            ...horodatage
        });

        await queryInterface.createTable('tontine_garanties', {
            id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
            groupeId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'tontine_groupes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            membreId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'tontine_membres', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            clientId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'clients', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            // Pas de cascade vers le portefeuille : un portefeuille qui porte
            // une reserve ne peut pas etre supprime (client.wallet.js).
            portefeuilleId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'Portefeuilles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
            },
            type: { type: S.ENUM('EPARGNE', 'PROJET', 'PORTEFEUILLE'), allowNull: false },
            montantInitial: { type: S.DECIMAL(15, 2), allowNull: false },
            montantUtilise: { type: S.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
            montantLibere: { type: S.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
            statut: {
                type: S.ENUM('active', 'partiellement_utilisee', 'utilisee', 'liberee', 'annulee'),
                allowNull: false, defaultValue: 'active'
            },
            consentementId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'tontine_consentements_garantie', key: 'id' },
                onUpdate: 'CASCADE', onDelete: 'RESTRICT'
            },
            expireLe: { type: S.DATE, allowNull: true },
            ...horodatage,
            updatedAt: { type: S.DATE, allowNull: false }
        });
        await queryInterface.addIndex('tontine_garanties', ['clientId']);
        await queryInterface.addIndex('tontine_garanties', ['groupeId', 'clientId']);
        await queryInterface.addIndex('tontine_garanties', ['portefeuilleId']);

        // Une garantie ne rend ni ne mobilise plus qu'elle n'a recu.
        await queryInterface.sequelize.query(
            `ALTER TABLE tontine_garanties ADD CONSTRAINT chk_garantie_montants
               CHECK (montantInitial > 0 AND montantUtilise >= 0 AND montantLibere >= 0
                      AND montantUtilise + montantLibere <= montantInitial)`
        );

        await queryInterface.createTable('tontine_garantie_mouvements', {
            id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
            garantieId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'tontine_garanties', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            sens: { type: S.ENUM('blocage', 'mobilisation', 'liberation'), allowNull: false },
            montant: { type: S.DECIMAL(15, 2), allowNull: false },
            motif: { type: S.STRING(255), allowNull: true },
            acteurType: { type: S.ENUM('CLIENT', 'ADMIN', 'SYSTEME'), allowNull: false, defaultValue: 'CLIENT' },
            acteurId: { type: S.INTEGER, allowNull: true },
            transactionId: { type: S.INTEGER, allowNull: true },
            ...horodatage
        });
        await queryInterface.addIndex('tontine_garantie_mouvements', ['garantieId']);
    },

    async down(queryInterface) {
        // Refuser plutot que de faire disparaitre des fonds bloques : leur
        // reserve resterait sur les portefeuilles sans plus rien pour la
        // justifier, ni pour la liberer.
        const [r] = await queryInterface.sequelize.query(
            `SELECT COUNT(*) n FROM tontine_garanties WHERE statut IN ('active','partiellement_utilisee')`
        ).catch(() => [[{ n: 0 }]]);
        if (Number(r[0].n) > 0) {
            throw new Error(`${r[0].n} garantie(s) encore active(s) : liberez-les avant d'annuler cette migration`);
        }
        await queryInterface.dropTable('tontine_garantie_mouvements');
        await queryInterface.dropTable('tontine_garanties');
        await queryInterface.dropTable('tontine_consentements_garantie');
    }
};

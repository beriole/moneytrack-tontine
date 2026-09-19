'use strict';

// =====================================================================
//  Retrait du tresorier.
//
//  Le bureau d'une tontine comptait quatre charges, puis deux. Il n'en
//  garde qu'une : le president. Le tresorier n'etait reservataire de rien
//  — il figurait toujours a cote du president, jamais seul — si bien que
//  son retrait n'enleve aucune capacite au groupe. Ce qu'il faisait se
//  repartit en deux :
//
//    decision  -> president : infliger et annuler une amende, rediger le
//                 reglement, clore l'exercice, consulter les cautions ;
//    execution -> MoneyTrack : encaisser une cotisation confirmee, saisir
//                 une caution sur un impaye, decaisser un credit deja
//                 approuve par un vote, depouiller un scrutin echu.
//
//  Les adhesions au role 'tresorier' redeviennent de simples adhesions :
//  personne ne perd son appartenance, seulement une delegation que le
//  president exercait deja concurremment.
//
//  ATTENTION : la reduction de l'ENUM n'est pas reversible sans perte. Le
//  down() remet la valeur dans le type, mais ne sait pas a qui elle
//  appartenait. Faire un dump avant.
//    mysqldump -u <user> -p <base> > backup.sql
// =====================================================================

const TABLE = 'tontine_membres';

module.exports = {
    async up(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            const [avant] = await queryInterface.sequelize.query(
                `SELECT COUNT(*) n FROM \`${TABLE}\` WHERE role = 'tresorier'`, opts
            );
            const combien = Number(avant && avant[0] ? avant[0].n : 0);

            // Le reclassement precede la reduction du type : sans lui,
            // MariaDB remplacerait les valeurs devenues invalides par une
            // chaine vide, et ces adhesions n'auraient plus aucun role.
            if (combien > 0) {
                await queryInterface.sequelize.query(
                    `UPDATE \`${TABLE}\` SET role = 'membre' WHERE role = 'tresorier'`, opts
                );
                console.log(`[migration] ${combien} adhesion(s) tresorier reclassee(s) en membre`);
            }

            await queryInterface.changeColumn(TABLE, 'role', {
                type: Sequelize.ENUM('president', 'membre'),
                allowNull: false,
                defaultValue: 'membre'
            }, opts);

            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    },

    async down(queryInterface, Sequelize) {
        // Retablit la valeur dans le type. Les adhesions reclassees restent
        // 'membre' : l'information de qui etait tresorier n'existe plus.
        await queryInterface.changeColumn(TABLE, 'role', {
            type: Sequelize.ENUM('president', 'tresorier', 'membre'),
            allowNull: false,
            defaultValue: 'membre'
        });
    }
};

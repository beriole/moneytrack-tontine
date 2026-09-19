'use strict';

// =====================================================================
//  AGENT_KYC rejoint COMPLIANCE.
//
//  L'agent KYC etait un acteur a part entiere de l'ancienne conception,
//  avec son propre routeur — router/Agent KYC/kyc.js, supprime depuis. Le
//  role, lui, avait survecu : il gardait deux routes de validation et une
//  modale de creation dans le back-office, alors que la verification
//  d'identite est une attribution de l'administration.
//
//  Il laissait aussi une porte ouverte. POST /api/admin/Agentkyc creait un
//  compte a ce role SANS garde : monte sous verifyAdmin seul, il permettait
//  a n'importe quel administrateur — MARKETING, SUPPORT — de se fabriquer
//  un compte habilite a approuver les KYC. La route est retiree ; la
//  creation d'administrateur ne passe plus que par
//  POST /api/admin/auth/create, reservee au SUPER_ADMIN.
//
//  Les comptes existants ne perdent rien : COMPLIANCE couvre la file des
//  verifications, et davantage.
//
//  ATTENTION : dump avant, la reduction de l'ENUM ne se retrouve pas.
// =====================================================================

const TABLE = 'Admins';

module.exports = {
    async up(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            const [avant] = await queryInterface.sequelize.query(
                `SELECT COUNT(*) n FROM \`${TABLE}\` WHERE role = 'AGENT_KYC'`, opts
            );
            const combien = Number(avant && avant[0] ? avant[0].n : 0);

            // Reclasser d'abord : MariaDB remplacerait par une chaine vide
            // toute valeur devenue etrangere au type.
            if (combien > 0) {
                await queryInterface.sequelize.query(
                    `UPDATE \`${TABLE}\` SET role = 'COMPLIANCE' WHERE role = 'AGENT_KYC'`, opts
                );
                console.log(`[migration] ${combien} compte(s) AGENT_KYC reclasse(s) en COMPLIANCE`);
            }

            await queryInterface.changeColumn(TABLE, 'role', {
                type: Sequelize.ENUM(
                    'SUPER_ADMIN', 'ADMIN_FINANCE', 'SUPPORT', 'COMPLIANCE', 'MARKETING'
                ),
                allowNull: false,
                defaultValue: 'SUPPORT'
            }, opts);

            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    },

    async down(queryInterface, Sequelize) {
        // Remet la valeur dans le type. Les comptes reclasses restent
        // COMPLIANCE : on ne sait plus lesquels etaient agents KYC.
        await queryInterface.changeColumn(TABLE, 'role', {
            type: Sequelize.ENUM(
                'SUPER_ADMIN', 'ADMIN_FINANCE', 'SUPPORT', 'COMPLIANCE', 'MARKETING', 'AGENT_KYC'
            ),
            allowNull: false,
            defaultValue: 'SUPPORT'
        });
    }
};

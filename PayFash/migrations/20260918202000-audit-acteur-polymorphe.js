'use strict';

// =====================================================================
//  Le journal d'audit s'ouvre aux autres acteurs.
//
//  AuditLog n'acceptait qu'un administrateur : adminId, adminEmail, et
//  rien d'autre. Or les operations les plus lourdes du systeme ne sont pas
//  le fait d'un administrateur. Un president qui verse un pot de 500 000
//  FCFA, une caution saisie par le moteur de recouvrement, une presidence
//  transmise, un paiement confirme par un webhook : rien de tout cela ne
//  laissait la moindre trace d'audit.
//
//  Quatre natures d'acteur suffisent, et elles recouvrent la conception :
//
//    CLIENT            un membre, un president — l'humain identifie par
//                      son compte client ;
//    ADMIN             l'administration de la plateforme ;
//    SYSTEME           MoneyTrack agissant de lui-meme : planificateur,
//                      recouvrement automatique, depouillement d'un
//                      scrutin echu. C'est la distinction technique que
//                      les services portent deja sous la forme
//                      { systeme: true } ;
//    SERVICE_EXTERNE   l'API de paiement, l'API de messagerie.
//
//  SYSTEME n'est pas un acteur au sens de la conception — MoneyTrack n'est
//  pas acteur de son propre systeme. C'est une mention de tracabilite : on
//  doit pouvoir distinguer « le president a saisi la caution » de « la
//  regle l'a saisie ».
//
//  adminId et adminEmail restent : les entrees deja ecrites les portent,
//  et le back-office les lit. Ils deviennent simplement facultatifs.
// =====================================================================

const TABLE = 'AuditLogs';

const COLONNES = (S) => ([
    ['acteurType', {
        type: S.ENUM('CLIENT', 'ADMIN', 'SYSTEME', 'SERVICE_EXTERNE'),
        allowNull: false,
        defaultValue: 'ADMIN',
        comment: "Nature de l'acteur ; SYSTEME = declenchement automatique"
    }],
    ['acteurId', {
        type: S.INTEGER,
        allowNull: true,
        comment: 'Identifiant dans sa propre table (client ou admin), nul pour SYSTEME'
    }],
    ['acteurLibelle', {
        type: S.STRING(160),
        allowNull: true,
        comment: "Nom ou adresse au moment de l'acte : l'audit ne doit pas dependre d'une jointure"
    }],
    ['requestId', {
        type: S.STRING(64),
        allowNull: true,
        comment: 'Correle les ecritures issues d une meme requete'
    }]
]);

async function aColonne(qi, colonne, options) {
    const description = await qi.describeTable(TABLE, options);
    return Object.prototype.hasOwnProperty.call(description, colonne);
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const t = await queryInterface.sequelize.transaction();
        const opts = { transaction: t };
        try {
            for (const [nom, def] of COLONNES(Sequelize)) {
                if (!(await aColonne(queryInterface, nom, opts))) {
                    await queryInterface.addColumn(TABLE, nom, def, opts);
                }
            }

            // Les entrees existantes sont toutes des actes d'administration :
            // c'est la seule chose que la table savait enregistrer.
            await queryInterface.sequelize.query(
                `UPDATE \`${TABLE}\`
                    SET acteurType = 'ADMIN',
                        acteurId = adminId,
                        acteurLibelle = adminEmail
                  WHERE acteurId IS NULL`,
                opts
            );

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
                if (await aColonne(queryInterface, nom, opts)) {
                    await queryInterface.removeColumn(TABLE, nom, opts);
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }
    }
};

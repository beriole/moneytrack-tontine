'use strict';

// =====================================================================
//  Fonds disponibles et fonds bloques.
//
//  Un portefeuille ne connaissait qu'un nombre : son solde. Tout ce qui y
//  figurait etait depensable. Pour qu'un membre puisse garantir ses
//  cotisations futures avec son epargne ou l'argent d'un projet, il faut
//  pouvoir immobiliser une partie d'un solde sans la deplacer : l'argent
//  reste a lui, il le voit, mais ne peut plus le retirer tant qu'il
//  garantit une obligation.
//
//    solde           ce que le portefeuille contient ;
//    montantReserve  la part immobilisee ;
//    disponible      solde - montantReserve, seul montant qui peut sortir.
//
//  Pourquoi le portefeuille et non l'objectif d'epargne ou le projet : ces
//  deux-la sont des compteurs declaratifs. Deposer sur un objectif
//  d'epargne n'y met aucun argent — le franc reste sur le portefeuille,
//  depensable. Une garantie posee sur un compteur ne garantirait rien.
//  L'argent reel d'un client vit dans ses portefeuilles, dont les types
//  'epargne' et 'projet' crees a l'inscription.
//
//  La contrainte CHECK tient l'invariant au niveau de la base : une reserve
//  n'est jamais negative et ne depasse jamais le solde, quel que soit le
//  chemin — service, script ou UPDATE a la main. La tolerance d'un centime
//  absorbe les arrondis du solde, encore stocke en FLOAT.
// =====================================================================

const TABLE = 'Portefeuilles';
const COLONNE = 'montantReserve';
const CONTRAINTE = 'chk_portefeuille_reserve';

async function aColonne(qi) {
    const d = await qi.describeTable(TABLE);
    return Object.prototype.hasOwnProperty.call(d, COLONNE);
}

async function aContrainte(qi) {
    const [r] = await qi.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND CONSTRAINT_NAME = :c`,
        { replacements: { t: TABLE, c: CONTRAINTE } }
    );
    return r.length > 0;
}

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await aColonne(queryInterface))) {
            await queryInterface.addColumn(TABLE, COLONNE, {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                comment: 'Part du solde immobilisee en garantie : ni retirable ni transferable'
            });
        }

        // Un solde deja negatif rendrait la contrainte impossible a poser.
        const [negatifs] = await queryInterface.sequelize.query(
            `SELECT COUNT(*) n FROM \`${TABLE}\` WHERE solde < 0`
        );
        if (Number(negatifs[0].n) > 0) {
            throw new Error(`${negatifs[0].n} portefeuille(s) au solde negatif : corrigez-les avant de poser la contrainte`);
        }

        if (!(await aContrainte(queryInterface))) {
            await queryInterface.sequelize.query(
                `ALTER TABLE \`${TABLE}\` ADD CONSTRAINT \`${CONTRAINTE}\`
                   CHECK (\`${COLONNE}\` >= 0 AND \`${COLONNE}\` <= solde + 0.01)`
            );
        }
    },

    async down(queryInterface) {
        if (await aContrainte(queryInterface)) {
            await queryInterface.sequelize.query(
                `ALTER TABLE \`${TABLE}\` DROP CONSTRAINT \`${CONTRAINTE}\``
            );
        }
        if (await aColonne(queryInterface)) {
            await queryInterface.removeColumn(TABLE, COLONNE);
        }
    }
};

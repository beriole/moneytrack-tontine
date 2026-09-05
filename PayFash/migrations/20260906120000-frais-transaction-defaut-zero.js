'use strict';

// =====================================================================
//  transactions.frais : defaut 100,3 -> 0
//
//  La colonne avait un defaut de 100,3 FCFA. Toute ecriture creee sans
//  preciser les frais en heritait — transferts entre portefeuilles,
//  depenses, remboursements — alors qu'aucun portefeuille n'etait debite
//  de ce montant. Le tableau de bord somme cette colonne pour annoncer
//  les « benefices » : il comptait donc un revenu jamais encaisse.
//
//  Cette migration ne touche QUE le defaut du schema. Les lignes deja
//  ecrites gardent leur valeur : reecrire un grand livre est une decision
//  comptable, pas une migration technique. Pour les corriger, voir la
//  requete commentee en fin de fichier, a passer en connaissance de cause.
//
//  Sur une base neuve, db.sync() a deja cree la colonne avec le nouveau
//  defaut : la migration est alors un no-op utile a la tracabilite.
//
//  ATTENTION : faire un dump de la base avant d'executer.
//    mysqldump -u <user> -p <base> > backup.sql
// =====================================================================

const TABLE = 'transactions';
const COLONNE = 'frais';

async function aColonne(qi, table, colonne, options) {
    try {
        const description = await qi.describeTable(table, options);
        return Object.prototype.hasOwnProperty.call(description, colonne);
    } catch (e) {
        // Table absente : rien a modifier.
        return false;
    }
}

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await aColonne(queryInterface, TABLE, COLONNE))) return;

        await queryInterface.changeColumn(TABLE, COLONNE, {
            type: Sequelize.FLOAT,
            allowNull: false,
            defaultValue: 0
        });
    },

    async down(queryInterface, Sequelize) {
        if (!(await aColonne(queryInterface, TABLE, COLONNE))) return;

        await queryInterface.changeColumn(TABLE, COLONNE, {
            type: Sequelize.FLOAT,
            allowNull: false,
            defaultValue: 100.3
        });
    }
};

// ---------------------------------------------------------------------
//  Remise a zero des frais fantomes, si vous decidez de l'assumer.
//  A executer a la main, apres sauvegarde, et seulement si vous confirmez
//  qu'aucun de ces frais n'a jamais ete preleve sur un portefeuille :
//
//    UPDATE transactions SET frais = 0 WHERE frais = 100.3;
//
//  Le revenu reel de la plateforme se lit ailleurs : les ecritures de type
//  'frais_plateforme', dont le montant a bien ete transfere depuis la
//  caisse d'un groupe.
// ---------------------------------------------------------------------

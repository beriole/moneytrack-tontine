'use strict';

// =====================================================================
//  L'argent en decimal, plus en flottant (section 46).
//
//  Vingt-sept colonnes monetaires etaient en FLOAT — dont le solde des
//  portefeuilles et le montant des ecritures. Un flottant binaire ne
//  represente pas exactement 0,1 : la base elle-meme calcule
//  0.1 + 0.2 = 0.3000000044703484. Sur un solde, l'ecart ne se voit pas
//  le premier jour ; il se voit le jour ou un total ne tombe plus juste,
//  et il est alors impossible a reconstituer.
//
//  DECIMAL(15, 2) stocke le franc exactement, jusqu'a mille milliards.
//  Les deux taux passent en DECIMAL(7, 4) : un taux d'interet de 3,75 %
//  doit rester 3,75.
//
//  La conversion arrondit au centime ce que le flottant approchait ; le
//  script scripts/verifier-montants.js compare les totaux avant et apres.
//  MySQL garde la nullabilite et la valeur par defaut de chaque colonne :
//  elles sont relues ici plutot que reecrites a la main.
// =====================================================================

const ARGENT = [
    ['budgetcategories', 'montant'],
    ['budgetcollaborators', 'limiteDepense'],
    ['budgets', 'montantAllouer'],
    ['budgets', 'montantDepense'],
    ['epargneautomatiques', 'depotMaximal'],
    ['epargneautomatiques', 'depotMinimal'],
    ['epargneautomatiques', 'montantFixe'],
    ['epargneautomatiques', 'totalEpargne'],
    ['epargnes', 'capitalInitial'],
    ['epargnes', 'interetCumule'],
    ['epargnes', 'montantRecurrent'],
    ['epargnes', 'montant_cumule'],
    ['epargnes', 'montant_total'],
    ['milestones', 'budgetAlloue'],
    ['milestones', 'depenses'],
    ['paiements', 'montant'],
    ['plans', 'prix'],
    ['portefeuilles', 'objectifMontant'],
    ['portefeuilles', 'solde'],
    ['projetcollaborators', 'contribution'],
    ['projetcollaborators', 'limiteDepense'],
    ['projets', 'budgetTotall'],
    ['projets', 'montantBloque'],
    ['projets', 'montantDepense'],
    ['savings_transactions', 'montant'],
    ['transactions', 'frais'],
    ['transactions', 'montant']
];

const TAUX = [
    ['epargnes', 'tauxInteret'],
    ['epargneautomatiques', 'pourcentageDepot']
];

/** Reprend la nullabilite et le defaut existants, pour ne changer que le type. */
async function convertir(q, table, colonne, type) {
    const [[info]] = await q.query(
        `SELECT IS_NULLABLE nul, COLUMN_DEFAULT parDefaut, COLUMN_COMMENT commentaire
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        { replacements: [table, colonne] });
    if (!info) return false;

    const morceaux = [`\`${colonne}\` ${type}`];
    if (info.nul === 'NO') morceaux.push('NOT NULL');
    // MariaDB rend la chaine « NULL » pour une colonne sans defaut : la
    // reecrire telle quelle donnerait DEFAULT 'NULL', que la base refuse.
    const parDefaut = info.parDefaut === null || info.parDefaut === undefined || String(info.parDefaut) === 'NULL'
        ? null : String(info.parDefaut);
    if (parDefaut !== null) {
        morceaux.push(`DEFAULT ${/^-?\d+(\.\d+)?$/.test(parDefaut) ? parDefaut : q.escape(parDefaut)}`);
    }
    if (info.commentaire) morceaux.push(`COMMENT ${q.escape(info.commentaire)}`);
    await q.query(`ALTER TABLE \`${table}\` MODIFY ${morceaux.join(' ')}`);
    return true;
}

module.exports = {
    async up(queryInterface) {
        const q = queryInterface.sequelize;
        for (const [table, colonne] of ARGENT) await convertir(q, table, colonne, 'DECIMAL(15,2)');
        for (const [table, colonne] of TAUX) await convertir(q, table, colonne, 'DECIMAL(7,4)');
    },

    async down(queryInterface) {
        const q = queryInterface.sequelize;
        for (const [table, colonne] of [...ARGENT, ...TAUX]) await convertir(q, table, colonne, 'FLOAT');
    }
};

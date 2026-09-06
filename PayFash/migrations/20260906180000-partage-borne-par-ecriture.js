'use strict';

// =====================================================================
//  tontine_partages.dernierApportId
//
//  La casse annuelle doit savoir ou s'arrete l'exercice qu'elle solde,
//  pour que le suivant reparte au-dela. La borne etait d'abord la DATE de
//  cloture, et les apports se lisaient avec `date > dateCloture`.
//
//  Cela ne tient pas : MySQL tronque les DATETIME a la seconde. Un apport
//  depose dans la meme seconde que la cloture — ce que fait n'importe quel
//  script, et ce que peut faire un utilisateur — etait rattache a
//  l'exercice deja clos, donc perdu pour le nouveau. Le scenario de la
//  caisse 2 l'a montre : au deuxieme exercice, les apports comptaient pour
//  zero et la totalite de la caisse passait en « produit », partage a
//  parts egales au lieu de rendre a chacun sa mise.
//
//  Un identifiant d'ecriture est strictement croissant et sans troncature.
//  La cloture enregistre la derniere ecriture d'apport qu'elle a prise en
//  compte ; l'exercice suivant lit `id > dernierApportId`.
//
//  Colonne nullable : un partage anterieur la laisse a NULL, ce qui vaut
//  « aucune borne connue » et fait repartir la lecture depuis le debut —
//  le comportement d'avant, sans regression pour les exercices deja clos.
//
//  ATTENTION : faire un dump de la base avant d'executer.
// =====================================================================

const TABLE = 'tontine_partages';
const COLONNE = 'dernierApportId';

async function decrire(qi, table) {
    try { return await qi.describeTable(table); } catch (e) { return null; }
}

module.exports = {
    async up(qi, Sequelize) {
        const description = await decrire(qi, TABLE);
        if (!description) return;
        if (Object.prototype.hasOwnProperty.call(description, COLONNE)) return;

        await qi.addColumn(TABLE, COLONNE, {
            type: Sequelize.INTEGER,
            allowNull: true
        });
    },

    async down(qi) {
        const description = await decrire(qi, TABLE);
        if (!description) return;
        if (!Object.prototype.hasOwnProperty.call(description, COLONNE)) return;
        await qi.removeColumn(TABLE, COLONNE);
    }
};

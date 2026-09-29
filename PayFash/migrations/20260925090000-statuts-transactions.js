'use strict';

// =====================================================================
//  Statuts des ecritures : six etats, et plus du texte libre (section 31).
//
//  La colonne etait un VARCHAR ou chaque appelant ecrivait sa formule :
//  « Succès », « En confirmation », « Annulée », « remboursée ». Aucune
//  requete ne pouvait s'y fier — l'application mobile, par exemple,
//  comparait a « terminé » et « en cours », des valeurs qui n'ont jamais
//  existe : toutes les ecritures s'affichaient donc en echec.
//
//  Les anciennes valeurs sont converties avant le changement de type ;
//  la migration inverse les retablit.
// =====================================================================

const TABLE = 'transactions';
const { STATUTS, ANCIENS } = require('../services/statutTransaction');

// Ce que chaque statut redeviendrait si l'on revenait en arriere.
const RETOUR = {
    [STATUTS.SUCCESS]: 'Succès',
    [STATUTS.PENDING]: 'En confirmation',
    [STATUTS.PROCESSING]: 'En confirmation',
    [STATUTS.CANCELLED]: 'Annulée',
    [STATUTS.REVERSED]: 'remboursée',
    [STATUTS.FAILED]: 'Echec'
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const q = queryInterface.sequelize;
        for (const [ancien, nouveau] of Object.entries(ANCIENS)) {
            await q.query('UPDATE transactions SET statut = ? WHERE statut = ?', { replacements: [nouveau, ancien] });
        }
        // Tout ce qui ne correspondait a rien de connu : l'ecriture existe,
        // son sort n'est pas etabli — c'est exactement « en attente ».
        await q.query('UPDATE transactions SET statut = ? WHERE statut NOT IN (?)',
            { replacements: [STATUTS.PENDING, Object.values(STATUTS)] });

        await queryInterface.changeColumn(TABLE, 'statut', {
            type: Sequelize.ENUM(...Object.values(STATUTS)),
            allowNull: false,
            defaultValue: STATUTS.PENDING
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn(TABLE, 'statut', {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'En confirmation'
        });
        const q = queryInterface.sequelize;
        for (const [nouveau, ancien] of Object.entries(RETOUR)) {
            await q.query('UPDATE transactions SET statut = ? WHERE statut = ?', { replacements: [ancien, nouveau] });
        }
    }
};

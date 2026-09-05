'use strict';

// =====================================================================
//  Ouvrir le maker-checker au versement force de tontine.
//
//  Le noyau refuse de verser un pot incomplet, et c'est bien ainsi. Mais
//  un arbitrage humain reste parfois necessaire : membre injoignable,
//  groupe bloque depuis des semaines, litige tranche.
//
//  Cette porte de sortie ne doit pas pouvoir etre ouverte par un seul
//  administrateur — d'ou son passage par PendingAction, exactement comme
//  un remboursement. Il faut donc que l'ENUM des types la connaisse.
// =====================================================================

const TYPES = ['REFUND', 'WALLET_ADJUST', 'USER_DELETE'];
const NOUVEAU = 'TONTINE_VERSEMENT_FORCE';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.changeColumn('PendingActions', 'type', {
            type: Sequelize.ENUM(...TYPES, NOUVEAU),
            allowNull: false
        });
    },

    async down(queryInterface, Sequelize) {
        // Echoue volontairement s'il reste des demandes de ce type : les
        // effacer silencieusement ferait disparaitre une trace d'arbitrage.
        await queryInterface.changeColumn('PendingActions', 'type', {
            type: Sequelize.ENUM(...TYPES),
            allowNull: false
        });
    }
};

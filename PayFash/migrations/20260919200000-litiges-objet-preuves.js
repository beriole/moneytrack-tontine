'use strict';

// =====================================================================
//  Litiges rattaches a une operation (section 28).
//
//  Un litige n'etait qu'une description libre : rien ne disait QUOI etait
//  conteste, et aucune preuve n'etait conservee. Il porte desormais :
//
//    objetType / objetId   l'operation contestee (cotisation, incident,
//                          amende, garantie, caution, versement, enchere,
//                          eligibilite, transaction, restriction) ;
//    groupeId              la tontine concernee, le cas echeant ;
//    preuves               un instantane, pris par le serveur a
//                          l'ouverture : l'operation, ses ecritures, ses
//                          traces d'audit — ce qui etait vrai ce jour-la,
//                          meme si la base change ensuite ;
//    empreintePreuves      SHA-256 de cet instantane ;
//    reponse               ce que l'administration repond au client.
//
//  Les litiges existants gardent objetType nul : ils restent lisibles.
// =====================================================================

const TABLE = 'litiges';
const COLONNES = (S) => ({
    objetType: { type: S.STRING(32), allowNull: true },
    objetId: { type: S.INTEGER, allowNull: true },
    groupeId: { type: S.INTEGER, allowNull: true },
    preuves: { type: S.JSON, allowNull: true },
    empreintePreuves: { type: S.STRING(64), allowNull: true },
    reponse: { type: S.TEXT, allowNull: true },
    traitePar: { type: S.INTEGER, allowNull: true, comment: 'Administrateur qui a tranche' }
});

module.exports = {
    async up(queryInterface, Sequelize) {
        const d = await queryInterface.describeTable(TABLE);
        for (const [nom, def] of Object.entries(COLONNES(Sequelize))) {
            if (!Object.prototype.hasOwnProperty.call(d, nom)) await queryInterface.addColumn(TABLE, nom, def);
        }
        const index = await queryInterface.showIndex(TABLE);
        if (!index.some(i => i.name === 'litiges_objet')) {
            await queryInterface.addIndex(TABLE, ['objetType', 'objetId'], { name: 'litiges_objet' });
        }
    },

    async down(queryInterface, Sequelize) {
        const index = await queryInterface.showIndex(TABLE);
        if (index.some(i => i.name === 'litiges_objet')) await queryInterface.removeIndex(TABLE, 'litiges_objet');
        const d = await queryInterface.describeTable(TABLE);
        for (const nom of Object.keys(COLONNES(Sequelize))) {
            if (Object.prototype.hasOwnProperty.call(d, nom)) await queryInterface.removeColumn(TABLE, nom);
        }
    }
};

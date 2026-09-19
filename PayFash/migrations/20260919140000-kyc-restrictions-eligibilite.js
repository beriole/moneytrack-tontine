'use strict';

// =====================================================================
//  Niveaux KYC, restrictions, evaluations d'eligibilite.
//
//  1. clients.niveauKyc
//
//     isVerified passait a vrai dans deux cas qui n'ont rien a voir :
//     l'email confirme par un code OTP, et l'identite approuvee par un
//     agent. Tout compte qui avait confirme son email etait donc
//     « verifie » au meme titre qu'une identite controlee. Le niveau les
//     separe :
//
//       0  compte cree, rien de confirme
//       1  email confirme (code OTP)
//       2  identite verifiee par un agent, sur piece, jusqu'a kycExpireLe
//
//     isVerified reste, avec son sens reel : niveau >= 1. Les comptes deja
//     verifies passent au niveau 1 — aucun n'a jamais ete approuve sur
//     piece : le journal d'audit ne contient aucune approbation KYC.
//
//  2. restrictions
//
//     Ne plus bloquer un utilisateur en entier. Une restriction ferme une
//     porte precise — rejoindre une tontine, recevoir un pot, encherir,
//     reprendre une garantie, creer une tontine — et laisse ouvert tout le
//     reste : consulter, payer ses dettes, ouvrir un litige.
//
//  3. tontine_evaluations_eligibilite
//
//     Chaque decision d'eligibilite prise pour autoriser ou refuser un
//     acte est conservee : les controles passes, leur resultat, la version
//     du moteur. Un refus doit pouvoir etre explique des mois plus tard,
//     y compris dans un litige.
//
//  4. Parametres de plateforme : le niveau KYC exige par operation. Zero
//     par defaut — aucune exigence — pour ne bloquer aucun groupe
//     existant ; l'administration les releve quand un parcours de
//     verification d'identite sera en place.
// =====================================================================

const PARAMETRES = [
    ['tontine_kyc_niveau_creation', '0', "Niveau KYC exige pour creer une tontine (0 aucun, 1 email, 2 identite)"],
    ['tontine_kyc_niveau_adhesion', '0', "Niveau KYC exige pour rejoindre une tontine (0 aucun, 1 email, 2 identite)"],
    ['tontine_kyc_niveau_enchere', '0', "Niveau KYC exige pour encherir sur un pot (0 aucun, 1 email, 2 identite)"],
    ['tontine_kyc_niveau_versement', '0', "Niveau KYC exige pour recevoir un pot (0 aucun, 1 email, 2 identite)"],
    ['kyc_validite_mois', '24', "Duree de validite d'une verification d'identite, en mois"]
];

module.exports = {
    async up(queryInterface, Sequelize) {
        const S = Sequelize;
        const clients = await queryInterface.describeTable('clients');
        for (const [nom, def] of [
            ['niveauKyc', { type: S.TINYINT, allowNull: false, defaultValue: 0,
                comment: '0 rien, 1 email confirme, 2 identite verifiee sur piece' }],
            ['kycVerifieLe', { type: S.DATE, allowNull: true }],
            ['kycExpireLe', { type: S.DATE, allowNull: true }]
        ]) {
            if (!Object.prototype.hasOwnProperty.call(clients, nom)) await queryInterface.addColumn('clients', nom, def);
        }
        await queryInterface.sequelize.query('UPDATE clients SET niveauKyc = 1 WHERE isVerified = 1 AND niveauKyc = 0');

        await queryInterface.createTable('restrictions', {
            id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
            clientId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'clients', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            type: {
                type: S.ENUM('JOIN_TONTINE_DISABLED', 'RECEIVE_POT_DISABLED', 'AUCTION_DISABLED',
                    'WITHDRAW_GUARANTEE_DISABLED', 'CREATE_TONTINE_DISABLED'),
                allowNull: false
            },
            motif: { type: S.STRING(255), allowNull: false },
            origine: { type: S.ENUM('ADMIN', 'SYSTEME'), allowNull: false, defaultValue: 'ADMIN' },
            adminId: { type: S.INTEGER, allowNull: true },
            actifJusqu: { type: S.DATE, allowNull: true, comment: 'Sans valeur : jusqu a levee explicite' },
            leveeLe: { type: S.DATE, allowNull: true },
            leveePar: { type: S.INTEGER, allowNull: true },
            motifLevee: { type: S.STRING(255), allowNull: true },
            createdAt: { type: S.DATE, allowNull: false },
            updatedAt: { type: S.DATE, allowNull: false }
        });
        await queryInterface.addIndex('restrictions', ['clientId', 'type']);

        await queryInterface.createTable('tontine_evaluations_eligibilite', {
            id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
            clientId: {
                type: S.INTEGER, allowNull: false,
                references: { model: 'clients', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            groupeId: { type: S.INTEGER, allowNull: true },
            cycleId: { type: S.INTEGER, allowNull: true },
            operation: { type: S.ENUM('creation', 'adhesion', 'enchere', 'versement'), allowNull: false },
            resultat: { type: S.ENUM('ELIGIBLE', 'NON_ELIGIBLE'), allowNull: false },
            controles: { type: S.JSON, allowNull: false },
            versionMoteur: { type: S.STRING(20), allowNull: false },
            createdAt: { type: S.DATE, allowNull: false }
        });
        await queryInterface.addIndex('tontine_evaluations_eligibilite', ['clientId']);
        await queryInterface.addIndex('tontine_evaluations_eligibilite', ['groupeId']);

        const maintenant = new Date();
        for (const [cle, valeur, description] of PARAMETRES) {
            const [existe] = await queryInterface.sequelize.query(
                'SELECT id FROM SystemConfigs WHERE cle = ?', { replacements: [cle] });
            if (existe.length) continue;
            await queryInterface.bulkInsert('SystemConfigs', [{
                cle, valeur, type: 'number', description, categorie: 'kyc',
                createdAt: maintenant, updatedAt: maintenant
            }]);
        }
    },

    async down(queryInterface) {
        await queryInterface.bulkDelete('SystemConfigs', { cle: PARAMETRES.map(p => p[0]) });
        await queryInterface.dropTable('tontine_evaluations_eligibilite');
        await queryInterface.dropTable('restrictions');
        for (const nom of ['kycExpireLe', 'kycVerifieLe', 'niveauKyc']) {
            const d = await queryInterface.describeTable('clients');
            if (Object.prototype.hasOwnProperty.call(d, nom)) await queryInterface.removeColumn('clients', nom);
        }
    }
};

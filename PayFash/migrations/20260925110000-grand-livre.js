'use strict';

// =====================================================================
//  Grand livre en partie double (section 30).
//
//  Jusqu'ici, un mouvement d'argent s'ecrivait en deux temps sans lien
//  formel : le solde du portefeuille etait modifie, et une ligne
//  descriptive etait ajoutee dans `transactions`. Rien ne PROUVAIT qu'un
//  franc sorti quelque part etait entre ailleurs.
//
//  Trois tables :
//
//    ledger_comptes     ou l'argent peut se trouver : un compte par
//                       portefeuille, plus quelques comptes de systeme
//                       (le monde exterieur, l'ouverture, les
//                       ajustements) ;
//    ledger_mouvements  un evenement : une cotisation, une recharge, un
//                       versement de pot ;
//    ledger_ecritures   ses deux faces au moins : ce qui sort d'un compte
//                       entre dans un autre, au centime.
//
//  L'invariant : pour chaque mouvement, la somme des debits egale la
//  somme des credits. scripts/verifier-ledger.js le controle, et compare
//  aussi le solde de chaque portefeuille a celui de son compte.
//
//  Les soldes existants sont repris par un mouvement d'ouverture, sans
//  quoi le grand livre partirait de zero pendant que les portefeuilles,
//  eux, portent deja de l'argent.
// =====================================================================

const COMPTES = 'ledger_comptes';
const MOUVEMENTS = 'ledger_mouvements';
const ECRITURES = 'ledger_ecritures';

module.exports = {
    async up(queryInterface, Sequelize) {
        const S = Sequelize;
        const tables = (await queryInterface.showAllTables())
            .map(t => String(typeof t === 'string' ? t : t.tableName).toLowerCase());

        if (!tables.includes(COMPTES)) {
            await queryInterface.createTable(COMPTES, {
                id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                code: { type: S.STRING(64), allowNull: false, unique: true, comment: 'PF:12, EXT:MOBILE_MONEY, SYS:OUVERTURE' },
                type: { type: S.ENUM('PORTEFEUILLE', 'EXTERNE', 'SYSTEME'), allowNull: false },
                libelle: { type: S.STRING(160), allowNull: false },
                // Le portefeuille peut disparaitre — un groupe supprime emporte
                // sa caisse. Le compte, lui, reste : ses ecritures racontent ce
                // qui s'est passe, et un grand livre ne s'efface pas.
                portefeuilleId: {
                    type: S.INTEGER, allowNull: true, unique: true,
                    references: { model: 'Portefeuilles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
                },
                devise: { type: S.STRING(8), allowNull: false, defaultValue: 'XAF' },
                createdAt: { type: S.DATE, allowNull: false },
                updatedAt: { type: S.DATE, allowNull: false }
            });
        }

        if (!tables.includes(MOUVEMENTS)) {
            await queryInterface.createTable(MOUVEMENTS, {
                id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                // Deux fois la meme reference, c'est deux fois le meme
                // mouvement : la base le refuse (section 32).
                reference: { type: S.STRING(80), allowNull: true, unique: true },
                type: { type: S.STRING(40), allowNull: false },
                description: { type: S.STRING(255), allowNull: true },
                montant: { type: S.DECIMAL(15, 2), allowNull: false, comment: 'Total des debits, egal au total des credits' },
                clientId: { type: S.INTEGER, allowNull: true },
                groupeTontineId: { type: S.INTEGER, allowNull: true },
                cycleTontineId: { type: S.INTEGER, allowNull: true },
                transactionId: {
                    type: S.INTEGER, allowNull: true,
                    comment: "Ecriture descriptive correspondante, quand il y en a une"
                },
                date: { type: S.DATE, allowNull: false },
                createdAt: { type: S.DATE, allowNull: false },
                updatedAt: { type: S.DATE, allowNull: false }
            });
            await queryInterface.addIndex(MOUVEMENTS, ['clientId', 'date']);
            await queryInterface.addIndex(MOUVEMENTS, ['groupeTontineId']);
            await queryInterface.sequelize.query(
                `ALTER TABLE ${MOUVEMENTS} ADD CONSTRAINT chk_ledger_mouvement_montant CHECK (montant > 0)`);
        }

        if (!tables.includes(ECRITURES)) {
            await queryInterface.createTable(ECRITURES, {
                id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                mouvementId: {
                    type: S.INTEGER, allowNull: false,
                    references: { model: MOUVEMENTS, key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
                },
                compteId: {
                    type: S.INTEGER, allowNull: false,
                    references: { model: COMPTES, key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
                },
                sens: { type: S.ENUM('debit', 'credit'), allowNull: false, comment: 'debit : sort du compte ; credit : y entre' },
                montant: { type: S.DECIMAL(15, 2), allowNull: false },
                createdAt: { type: S.DATE, allowNull: false }
            });
            await queryInterface.addIndex(ECRITURES, ['compteId']);
            await queryInterface.addIndex(ECRITURES, ['mouvementId']);
            await queryInterface.sequelize.query(
                `ALTER TABLE ${ECRITURES} ADD CONSTRAINT chk_ledger_ecriture_montant CHECK (montant > 0)`);
        }

        // --- Comptes de systeme ------------------------------------------
        const maintenant = new Date();
        const systeme = [
            ['EXT:MOBILE_MONEY', 'EXTERNE', 'Monde exterieur — Mobile Money'],
            ['SYS:OUVERTURE', 'SYSTEME', "Reprise des soldes a l'ouverture du grand livre"],
            ['SYS:AJUSTEMENT', 'SYSTEME', 'Ajustements decides par l\'administration']
        ];
        for (const [code, type, libelle] of systeme) {
            const [[existe]] = await queryInterface.sequelize.query(
                `SELECT id FROM ${COMPTES} WHERE code = ?`, { replacements: [code] });
            if (!existe) {
                await queryInterface.bulkInsert(COMPTES, [{
                    code, type, libelle, portefeuilleId: null, devise: 'XAF',
                    createdAt: maintenant, updatedAt: maintenant
                }]);
            }
        }

        // --- Un compte par portefeuille ----------------------------------
        const [portefeuilles] = await queryInterface.sequelize.query(
            'SELECT id, nom, typePortefeuille, devise, solde FROM Portefeuilles');
        for (const p of portefeuilles) {
            const [[deja]] = await queryInterface.sequelize.query(
                `SELECT id FROM ${COMPTES} WHERE portefeuilleId = ?`, { replacements: [p.id] });
            if (deja) continue;
            await queryInterface.bulkInsert(COMPTES, [{
                code: `PF:${p.id}`,
                type: 'PORTEFEUILLE',
                libelle: `${p.nom || p.typePortefeuille || 'Portefeuille'} #${p.id}`,
                portefeuilleId: p.id,
                devise: p.devise || 'XAF',
                createdAt: maintenant, updatedAt: maintenant
            }]);
        }

        // --- Reprise des soldes ------------------------------------------
        // Un seul mouvement d'ouverture, equilibre : chaque portefeuille non
        // vide est credite, le compte d'ouverture porte la contrepartie.
        const [[ouvertureDeja]] = await queryInterface.sequelize.query(
            `SELECT id FROM ${MOUVEMENTS} WHERE reference = 'LEDGER-OUVERTURE'`);
        const aReprendre = portefeuilles.filter(p => Math.abs(Number(p.solde) || 0) > 0.004);
        if (!ouvertureDeja && aReprendre.length) {
            const total = aReprendre.reduce((s, p) => s + Number(p.solde), 0);
            await queryInterface.bulkInsert(MOUVEMENTS, [{
                reference: 'LEDGER-OUVERTURE',
                type: 'ouverture',
                description: `Reprise de ${aReprendre.length} solde(s) a l'ouverture du grand livre`,
                montant: Math.round(total * 100) / 100,
                clientId: null, groupeTontineId: null, cycleTontineId: null, transactionId: null,
                date: maintenant, createdAt: maintenant, updatedAt: maintenant
            }]);
            const [[mouvement]] = await queryInterface.sequelize.query(
                `SELECT id FROM ${MOUVEMENTS} WHERE reference = 'LEDGER-OUVERTURE'`);
            const [[compteOuverture]] = await queryInterface.sequelize.query(
                `SELECT id FROM ${COMPTES} WHERE code = 'SYS:OUVERTURE'`);

            const lignes = [];
            for (const p of aReprendre) {
                const [[compte]] = await queryInterface.sequelize.query(
                    `SELECT id FROM ${COMPTES} WHERE portefeuilleId = ?`, { replacements: [p.id] });
                const montant = Math.round(Number(p.solde) * 100) / 100;
                // Un solde negatif — s'il en existait — se reprend dans l'autre sens.
                lignes.push({
                    mouvementId: mouvement.id, compteId: compte.id,
                    sens: montant > 0 ? 'credit' : 'debit', montant: Math.abs(montant), createdAt: maintenant
                });
                lignes.push({
                    mouvementId: mouvement.id, compteId: compteOuverture.id,
                    sens: montant > 0 ? 'debit' : 'credit', montant: Math.abs(montant), createdAt: maintenant
                });
            }
            await queryInterface.bulkInsert(ECRITURES, lignes);
        }
    },

    async down(queryInterface) {
        const tables = (await queryInterface.showAllTables())
            .map(t => String(typeof t === 'string' ? t : t.tableName).toLowerCase());
        for (const table of [ECRITURES, MOUVEMENTS, COMPTES]) {
            if (tables.includes(table)) await queryInterface.dropTable(table);
        }
    }
};

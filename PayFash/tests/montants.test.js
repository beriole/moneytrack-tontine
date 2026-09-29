'use strict';

// =====================================================================
//  L'argent au centime — colonnes DECIMAL (section 46).
//
//  Les soldes et les montants etaient en FLOAT. Un flottant binaire ne
//  represente pas exactement 0,1 : la base calculait
//  0.1 + 0.2 = 0.3000000044703484. Ces tests gardent la conversion, et
//  verifient qu'une somme de centimes retombe juste.
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');

test('base de donnees', async (t) => {
    const { db, Portefeuille, Client } = require('../models');
    const Fonds = require('../services/fonds.service');
    try { await db.authenticate(); } catch (e) { t.skip('base injoignable'); return; }

    const client = await Client.findOne({ where: { email: 'awa@tontine.local' } });
    if (!client) { t.skip('jeu de demonstration absent'); await db.close(); return; }

    const pf = await Portefeuille.create({
        nom: 'Test centimes', solde: 0, devise: 'XAF', typePortefeuille: 'courant',
        estPrincipal: false, estActif: false, ClientPortefeuilleId: client.id
    });
    t.after(async () => { await pf.destroy({ force: true }); await db.close(); });

    await t.test('aucune colonne monetaire ne reste en flottant', async () => {
        const [colonnes] = await db.query(`
            SELECT TABLE_NAME t, COLUMN_NAME c, DATA_TYPE d
              FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND DATA_TYPE IN ('float', 'double')
               AND COLUMN_NAME REGEXP 'montant|solde|prix|frais|budget|depense|contribution|capital|interet'`);
        const restantes = colonnes.filter(x => !/taux|pourcentage/i.test(x.c)).map(x => `${x.t}.${x.c}`);
        assert.deepEqual(restantes, []);
    });

    await t.test('un montant se relit exactement, et en nombre', async () => {
        await pf.update({ solde: 1234.56 });
        const relu = await Portefeuille.findByPk(pf.id);
        assert.equal(typeof relu.solde, 'number', 'un decimal rendu en chaine casserait toutes les additions');
        assert.equal(relu.solde, 1234.56);
    });

    await t.test('dix fois dix centimes font un franc, pas 0,9999...', async () => {
        await pf.update({ solde: 0 });
        for (let i = 0; i < 10; i++) {
            const courant = await Portefeuille.findByPk(pf.id);
            await Fonds.crediter(courant, 0.1, null);
        }
        const [[total]] = await db.query('SELECT solde FROM Portefeuilles WHERE id = ?', { replacements: [pf.id] });
        assert.equal(Number(total.solde), 1);
    });

    await t.test('la base additionne les centimes sans derive', async () => {
        const [[r]] = await db.query(`
            SELECT CAST(0.1 AS DECIMAL(15,2)) + CAST(0.2 AS DECIMAL(15,2)) exact,
                   CAST(0.1 AS FLOAT) + CAST(0.2 AS FLOAT) flottant`);
        assert.equal(Number(r.exact), 0.3);
        assert.notEqual(Number(r.flottant), 0.3, 'ce que faisaient les colonnes avant la conversion');
    });
});

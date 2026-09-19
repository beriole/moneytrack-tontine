'use strict';

// =====================================================================
//  Fonds disponibles et fonds bloques — services/fonds.service.js
//
//  Premiere suite de tests unitaires du backend. Le projet n'avait que des
//  scenarios de bout en bout (scripts/scenario-*.js) ; la regle du
//  disponible, qui garde toutes les sorties d'argent, merite d'etre
//  eprouvee seule, cas limite par cas limite.
//
//  Runner natif de Node (node:test) : aucune dependance ajoutee.
//    npm run test:unitaires
//
//  La derniere partie touche la base : elle cree un portefeuille jetable,
//  le fait disputer par deux transactions simultanees, puis le supprime.
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const Fonds = require('../services/fonds.service');

/** Un portefeuille en memoire, avec l'update de Sequelize. */
function portefeuille(solde, montantReserve = 0, id = 1) {
    return {
        id, solde, montantReserve,
        async update(champs) { Object.assign(this, champs); return this; }
    };
}

async function echoue(promesse, code) {
    await assert.rejects(promesse, (e) => {
        assert.ok(e instanceof Fonds.ErreurFonds, `ErreurFonds attendue, recu ${e && e.name}`);
        assert.equal(e.code, code);
        return true;
    });
}

// ---------------------------------------------------------------------
test('le disponible est le solde moins la reserve', () => {
    assert.equal(Fonds.disponible(portefeuille(300000, 100000)), 200000);
    assert.deepEqual(Fonds.etat(portefeuille(300000, 100000)),
        { solde: 300000, disponible: 200000, bloque: 100000 });
});

test('la reserve arrive de la base en chaine (DECIMAL) : elle est convertie', () => {
    assert.equal(Fonds.disponible(portefeuille(300000, '100000.00')), 200000);
});

test('le disponible n est jamais negatif', () => {
    assert.equal(Fonds.disponible(portefeuille(1000, 5000)), 0);
});

test('sans reserve, le message ne parle pas de garantie', () => {
    assert.throws(() => Fonds.exigerDisponible(portefeuille(1000), 5000), (e) => {
        assert.equal(e.code, 402);
        assert.doesNotMatch(e.message, /garantie/);
        return true;
    });
});

test('avec reserve, le message dit que l argent existe mais garantit une obligation', () => {
    assert.throws(() => Fonds.exigerDisponible(portefeuille(10000, 8000), 5000), (e) => {
        assert.equal(e.code, 402);
        assert.match(e.message, /8000 FCFA .* bloques en garantie/);
        assert.deepEqual(e.details, { disponible: 2000, bloque: 8000, requis: 5000 });
        return true;
    });
});

// ---------------------------------------------------------------------
test('debiter ne touche que le disponible', async () => {
    const pf = portefeuille(10000, 8000);
    await Fonds.debiter(pf, 2000);
    assert.equal(pf.solde, 8000);
    assert.equal(Number(pf.montantReserve), 8000);
    await echoue(Fonds.debiter(pf, 1), 402);
});

test('un montant nul, negatif ou non numerique est refuse partout', async () => {
    for (const m of [0, -5000, 'abc', NaN, undefined]) {
        await echoue(Fonds.debiter(portefeuille(10000), m), 400);
        await echoue(Fonds.crediter(portefeuille(10000), m), 400);
        await echoue(Fonds.reserver(portefeuille(10000), m), 400);
    }
});

test('reserver immobilise sans deplacer l argent', async () => {
    const pf = portefeuille(300000);
    await Fonds.reserver(pf, 100000);
    assert.equal(pf.solde, 300000, 'le solde ne bouge pas : l argent reste au client');
    assert.equal(Fonds.disponible(pf), 200000);
});

test('on ne reserve pas au-dela du disponible, ni deux fois le meme argent', async () => {
    const pf = portefeuille(150000);
    await Fonds.reserver(pf, 100000);
    await echoue(Fonds.reserver(pf, 100000), 402);
    assert.equal(Number(pf.montantReserve), 100000);
});

test('liberer rend au disponible, jamais plus que la reserve', async () => {
    const pf = portefeuille(100000, 60000);
    await Fonds.liberer(pf, 20000);
    assert.equal(Fonds.disponible(pf), 60000);
    await echoue(Fonds.liberer(pf, 50000), 409);
});

test('mobiliser une garantie baisse solde et reserve ensemble, pas le disponible', async () => {
    // Section 22 : besoin de 25 000, garantie de 40 000 — on ne prend que 25 000.
    const pf = portefeuille(100000, 40000);
    await Fonds.debiterReserve(pf, 25000);
    assert.equal(pf.solde, 75000);
    assert.equal(Number(pf.montantReserve), 15000);
    assert.equal(Fonds.disponible(pf), 60000, 'ce que le client pouvait depenser, il le peut toujours');
    await echoue(Fonds.debiterReserve(pf, 20000), 409);
});

test('un transfert vers le meme portefeuille est refuse', async () => {
    // Deux mises a jour de la meme ligne s'ecraseraient : le montant serait
    // cree a partir de rien.
    const pf = portefeuille(10000, 0, 7);
    await echoue(Fonds.transferer(pf, pf, 1000), 409);
    assert.equal(pf.solde, 10000);
});

test('un transfert conserve l argent', async () => {
    const a = portefeuille(10000, 0, 1);
    const b = portefeuille(500, 0, 2);
    await Fonds.transferer(a, b, 3000);
    assert.equal(a.solde + b.solde, 10500);
});

// ---------------------------------------------------------------------
//  Avec la base
// ---------------------------------------------------------------------
test('base de donnees', async (t) => {
    const { db, Portefeuille } = require('../models');
    try {
        await db.authenticate();
    } catch (e) {
        t.skip(`base injoignable (${e.message}) : tests d integration ignores`);
        return;
    }

    const creer = (solde) => Portefeuille.create({
        nom: 'Test fonds.test.js', solde, devise: 'XAF', typePortefeuille: 'courant',
        estPrincipal: false, estActif: false, ClientPortefeuilleId: null,
        description: 'Portefeuille jetable des tests unitaires'
    });
    const crees = [];
    t.after(async () => {
        await Portefeuille.destroy({ where: { id: crees } });
        await db.close();
    });

    await t.test('section 33 : reserver et retirer le meme argent en meme temps', async () => {
        const pf = await creer(150000);
        crees.push(pf.id);

        // Deux operations disputent les memes 100 000 FCFA sur 150 000. Avec
        // le verrou, la seconde attend, relit la ligne et est refusee par la
        // regle : un 402 lisible. Sans verrou, elle ecrirait des valeurs
        // perimees — c'est alors la contrainte CHECK de la base qui la
        // rattrape, par une erreur SQL brute. Le code 402 attendu ci-dessous
        // distingue donc les deux barrieres.
        const agir = (fn) => db.transaction(async (tx) => {
            const ligne = await Portefeuille.findByPk(pf.id, { transaction: tx, lock: tx.LOCK.UPDATE });
            await new Promise(r => setTimeout(r, 50));   // elargit la fenetre de concurrence
            return fn(ligne, tx);
        });
        const issues = await Promise.allSettled([
            agir((l, tx) => Fonds.reserver(l, 100000, tx)),
            agir((l, tx) => Fonds.debiter(l, 100000, tx))
        ]);

        const reussies = issues.filter(i => i.status === 'fulfilled');
        const refusees = issues.filter(i => i.status === 'rejected');
        assert.equal(reussies.length, 1, 'exactement une operation passe');
        assert.equal(refusees.length, 1);
        assert.equal(refusees[0].reason.code, 402);

        const apres = await Portefeuille.findByPk(pf.id);
        const reserveApres = Number(apres.montantReserve);
        const cas = `solde ${apres.solde}, reserve ${reserveApres}`;
        assert.ok(
            (apres.solde === 150000 && reserveApres === 100000)     // la reserve a gagne
            || (apres.solde === 50000 && reserveApres === 0),       // le retrait a gagne
            `etat incoherent : ${cas}`
        );
        assert.ok(reserveApres <= apres.solde, `reserve superieure au solde : ${cas}`);
    });

    await t.test('deux retraits simultanes ne depensent pas deux fois le meme argent', async () => {
        // Le cas que la contrainte CHECK ne voit pas : sans verrou, chaque
        // transaction lit 150 000, debite 100 000, et la seconde ecrase la
        // premiere — 200 000 sortent d'un portefeuille qui en contenait 150 000.
        // Verifie a la main : sans le LOCK.UPDATE, les deux passent.
        const pf = await creer(150000);
        crees.push(pf.id);
        const retirer = () => db.transaction(async (tx) => {
            const ligne = await Portefeuille.findByPk(pf.id, { transaction: tx, lock: tx.LOCK.UPDATE });
            await new Promise(r => setTimeout(r, 50));
            return Fonds.debiter(ligne, 100000, tx);
        });
        const issues = await Promise.allSettled([retirer(), retirer()]);
        assert.equal(issues.filter(i => i.status === 'fulfilled').length, 1, 'un seul retrait passe');
        assert.equal((await Portefeuille.findByPk(pf.id)).solde, 50000);
    });

    await t.test('la base refuse une reserve superieure au solde, quel que soit le chemin', async () => {
        const pf = await creer(1000);
        crees.push(pf.id);
        await assert.rejects(
            db.query('UPDATE Portefeuilles SET montantReserve = 5000 WHERE id = ?', { replacements: [pf.id] }),
            /chk_portefeuille_reserve/
        );
        await assert.rejects(
            db.query('UPDATE Portefeuilles SET montantReserve = -1 WHERE id = ?', { replacements: [pf.id] }),
            /chk_portefeuille_reserve/
        );
    });

    await t.test('une cotisation de tontine ne consomme pas les fonds bloques', async () => {
        // commun.transferer delegue au noyau et retraduit l'erreur pour les
        // controleurs du module tontine.
        const { transferer, ErreurTontine } = require('../services/tontine/commun');
        const source = await creer(10000);
        const caisse = await creer(0);
        crees.push(source.id, caisse.id);
        await source.update({ montantReserve: 8000 });

        await assert.rejects(
            db.transaction(async (tx) => {
                const s = await Portefeuille.findByPk(source.id, { transaction: tx, lock: tx.LOCK.UPDATE });
                const c = await Portefeuille.findByPk(caisse.id, { transaction: tx, lock: tx.LOCK.UPDATE });
                return transferer(s, c, 5000, tx);
            }),
            (e) => e instanceof ErreurTontine && e.code === 402 && /bloques en garantie/.test(e.message)
        );
        assert.equal((await Portefeuille.findByPk(source.id)).solde, 10000);
    });
});

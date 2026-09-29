'use strict';

// =====================================================================
//  Statuts des ecritures — services/statutTransaction.js
//
//  La colonne etait du texte libre : « Succès », « En confirmation »,
//  « Annulée », « remboursée », et aucun etat d'echec. Ces tests gardent
//  les six etats, la conversion des anciennes valeurs, la correspondance
//  avec le fournisseur de paiement et les passages interdits.
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../services/statutTransaction');

test('les anciennes valeurs se convertissent, accents compris', () => {
    assert.equal(S.normaliser('Succès'), 'SUCCESS');
    assert.equal(S.normaliser('Succes'), 'SUCCESS');
    assert.equal(S.normaliser('En confirmation'), 'PENDING');
    assert.equal(S.normaliser('Annulée'), 'CANCELLED');
    assert.equal(S.normaliser('remboursée'), 'REVERSED');
    assert.equal(S.normaliser('Echec'), 'FAILED');
});

test('une valeur deja canonique reste elle-meme, une inconnue ne passe pas', () => {
    for (const s of S.TOUS) assert.equal(S.normaliser(s), s);
    assert.equal(S.normaliser('success'), 'SUCCESS');
    assert.equal(S.normaliser('terminé'), null, "valeur que l'application mobile comparait");
    assert.equal(S.normaliser(''), null);
    assert.equal(S.normaliser(null), null);
});

test('le statut du fournisseur a un seul equivalent interne', () => {
    assert.equal(S.depuisFournisseur('SUCCESSFUL'), 'SUCCESS');
    assert.equal(S.depuisFournisseur('successful'), 'SUCCESS');
    assert.equal(S.depuisFournisseur('EXPIRED'), 'FAILED');
    assert.equal(S.depuisFournisseur('REFUNDED'), 'REVERSED');
    assert.equal(S.depuisFournisseur('PENDING'), 'PENDING');
    assert.equal(S.depuisFournisseur('A_VERIFIER'), null, 'etat propre a MoneyTrack, pas au fournisseur');
});

test('une ecriture confirmee ne redevient jamais en attente', () => {
    assert.equal(S.peutPasser('SUCCESS', 'PENDING'), false);
    assert.equal(S.peutPasser('SUCCESS', 'FAILED'), false);
    assert.equal(S.peutPasser('SUCCESS', 'REVERSED'), true, 'elle se compense');
    assert.equal(S.peutPasser('PENDING', 'SUCCESS'), true);
    assert.equal(S.peutPasser('PENDING', 'CANCELLED'), true);
    assert.equal(S.peutPasser('CANCELLED', 'SUCCESS'), false);
    assert.equal(S.peutPasser('REVERSED', 'SUCCESS'), false);
});

test('les etats definitifs le sont', () => {
    for (const s of ['FAILED', 'REVERSED', 'CANCELLED']) assert.equal(S.estFinal(s), true);
    for (const s of ['PENDING', 'PROCESSING', 'SUCCESS']) assert.equal(S.estFinal(s), false);
});

test('changer applique le passage, ou le refuse en le nommant', async () => {
    const faire = (statut) => {
        const o = { statut, ecrits: null };
        o.update = async (champs) => { Object.assign(o, champs); o.ecrits = champs; return o; };
        return o;
    };
    const e = faire('PENDING');
    await S.changer(e, 'SUCCESS');
    assert.equal(e.statut, 'SUCCESS');

    // Idempotent : rien n'est reecrit.
    const deja = faire('SUCCESS');
    await S.changer(deja, 'SUCCESS');
    assert.equal(deja.ecrits, null);

    await assert.rejects(() => S.changer(faire('SUCCESS'), 'PENDING'), (err) => {
        assert.equal(err.code, 409);
        assert.match(err.message, /Reussie.*En attente/);
        return true;
    });
    await assert.rejects(() => S.changer(faire('PENDING'), 'terminé'), (err) => err.code === 400);
});

test('les anciennes valeurs se convertissent aussi a l ecriture', async () => {
    const o = { statut: 'En confirmation', update: async (c) => Object.assign(o, c) };
    await S.changer(o, 'Succès');
    assert.equal(o.statut, 'SUCCESS');
});

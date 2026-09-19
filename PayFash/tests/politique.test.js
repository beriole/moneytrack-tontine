'use strict';

// =====================================================================
//  Politique de recouvrement — services/tontine/politiqueRecouvrement.js
//
//  L'ordre des sources etait code en dur dans le planificateur. Il vit
//  maintenant dans le reglement de chaque groupe ; ces tests gardent sa
//  validation et le comportement des groupes anterieurs.
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const Politique = require('../services/tontine/politiqueRecouvrement');

const refuse = (valeur) => assert.throws(() => Politique.normaliser(valeur), (e) => e.code === 400);

test('sans politique, un nouveau groupe recoit l ordre complet', () => {
    assert.deepEqual(Politique.normaliser(undefined), { ordre: ['caution', 'garanties', 'retenue_pot'], delaiGraceJours: 0 });
    assert.deepEqual(Politique.normaliser({ delaiGraceJours: 5 }).ordre, ['caution', 'garanties', 'retenue_pot']);
});

test('un groupe anterieur garde l ordre qui etait code en dur', () => {
    assert.deepEqual(Politique.de({ politiqueRecouvrement: null }), { ordre: ['caution', 'garanties'], delaiGraceJours: 0 });
    assert.equal(Politique.prevoit({ politiqueRecouvrement: null }, 'retenue_pot'), false);
});

test('l ordre choisi est respecte, y compris vide', () => {
    assert.deepEqual(Politique.normaliser({ ordre: ['garanties', 'caution'] }).ordre, ['garanties', 'caution']);
    assert.deepEqual(Politique.normaliser('{"ordre":[],"delaiGraceJours":2}'), { ordre: [], delaiGraceJours: 2 });
});

test('les politiques invalides sont refusees', () => {
    refuse({ ordre: ['caution', 'portefeuille_courant'] });   // jamais le compte courant sans son geste
    refuse({ ordre: ['caution', 'caution'] });
    refuse({ ordre: 'caution' });
    refuse({ delaiGraceJours: 31 });
    refuse({ delaiGraceJours: -1 });
    refuse({ delaiGraceJours: 1.5 });
    refuse([]);
    refuse('pas du json');
});

test('une valeur illisible en base retombe sur l ordre historique', () => {
    assert.deepEqual(Politique.de({ politiqueRecouvrement: { ordre: ['inconnue'] } }).ordre, ['caution', 'garanties']);
});

test('le delai de grace decale la date de recouvrement', () => {
    const echeance = new Date('2026-09-01T00:00:00Z');
    const g = { politiqueRecouvrement: { ordre: ['caution'], delaiGraceJours: 3 } };
    assert.equal(Politique.recouvrableA(g, echeance).toISOString(), '2026-09-04T00:00:00.000Z');
});

test('la clause du reglement nomme les sources dans l ordre', () => {
    const texte = Politique.decrire({ politiqueRecouvrement: { ordre: ['garanties', 'caution'], delaiGraceJours: 0 } });
    assert.ok(texte.indexOf('1) les garanties') < texte.indexOf('2) la caution'));
    assert.ok(texte.includes('Seul le montant manquant'));
});

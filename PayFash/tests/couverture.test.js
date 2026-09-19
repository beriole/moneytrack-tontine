'use strict';

// =====================================================================
//  Regle de couverture — services/tontine/couverture.service.js
//
//  La part de ce qui reste a payer qu'un membre doit avoir garantie avant
//  de recevoir le pot. Logique pure : aucune base n'est touchee.
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../services/tontine/couverture.service');

const groupe = (reglesCouverture) => ({ reglesCouverture });

function refuse(fn, motif) {
    assert.throws(fn, (e) => {
        assert.equal(e.code, 400);
        if (motif) assert.match(e.message, motif);
        return true;
    });
}

test('sans regle, rien n est exige : les groupes anterieurs ne changent pas', () => {
    assert.equal(C.normaliser(undefined), null);
    assert.equal(C.normaliser(null), null);
    assert.equal(C.normaliser('aucune'), null);
    assert.equal(C.tauxExige(groupe(null), 1, 10), 0);
});

test('une regle a zero partout vaut aucune regle', () => {
    assert.equal(C.normaliser({ tauxParDefaut: 0, paliers: [{ jusquAuTour: 3, taux: 0 }] }), null);
});

test('les modeles se designent par leur nom', () => {
    assert.deepEqual(C.normaliser('moitie'), { tauxParDefaut: 50, paliers: [] });
    assert.equal(C.normaliser('premiers_tours').paliers[0].taux, 100);
});

test('un taux hors de 0-100 est refuse', () => {
    refuse(() => C.normaliser({ tauxParDefaut: 120 }), /entre 0 et 100/);
    refuse(() => C.normaliser({ tauxParDefaut: -5 }), /entre 0 et 100/);
    refuse(() => C.normaliser({ tauxParDefaut: 'beaucoup' }), /entre 0 et 100/);
});

test('les paliers se donnent par tours croissants', () => {
    refuse(() => C.normaliser({ tauxParDefaut: 50, paliers: [{ jusquAuTour: 5, taux: 80 }, { jusquAuTour: 3, taux: 100 }] }),
        /croissants/);
    refuse(() => C.normaliser({ paliers: [{ jusquAuTour: 0, taux: 100 }] }), /borne invalide/);
});

test('un nom de modele inconnu est refuse', () => {
    refuse(() => C.normaliser('genereuse'), /inconnue/);
});

test('le taux d un tour est celui du premier palier qui le couvre', () => {
    const g = groupe({ tauxParDefaut: 30, paliers: [{ jusquAuTour: 2, taux: 100 }, { jusquAuTour: 5, taux: 60 }] });
    assert.equal(C.tauxExige(g, 1, 10), 100);
    assert.equal(C.tauxExige(g, 2, 10), 100);
    assert.equal(C.tauxExige(g, 3, 10), 60);
    assert.equal(C.tauxExige(g, 5, 10), 60);
    assert.equal(C.tauxExige(g, 6, 10), 30);
});

test('un palier au tiers suit la taille du groupe', () => {
    const g = groupe(C.normaliser('premiers_tours'));   // 100 % pour le premier tiers, 50 % ensuite
    // 12 tours : le premier tiers va jusqu'au tour 4.
    assert.equal(C.tauxExige(g, 4, 12), 100);
    assert.equal(C.tauxExige(g, 5, 12), 50);
    // 4 tours : le tiers est arrondi au-dessus, tours 1 et 2.
    assert.equal(C.tauxExige(g, 2, 4), 100);
    assert.equal(C.tauxExige(g, 3, 4), 50);
});

test('la regle arrivee de la base en chaine JSON est relue', () => {
    const g = groupe(JSON.stringify({ tauxParDefaut: 40, paliers: [] }));
    assert.equal(C.tauxExige(g, 7, 10), 40);
});

test('la description dit la regle en clair', () => {
    const g = groupe(C.normaliser('premiers_tours'));
    assert.match(C.decrire(g, 9), /100 % pour les tours 1 a 3, 50 % ensuite/);
    assert.match(C.decrire(groupe(null), 9), /Aucune garantie exigee/);
});

test('sans engagement, la couverture est entiere', () => {
    assert.equal(C.ratio(0, 0), 100);
    assert.equal(C.ratio(250000, 350000), 71.43);   // l exemple de la section 9
});

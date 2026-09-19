'use strict';

// =====================================================================
//  Notation du risque — services/risque.service.js (partie pure)
//
//  Le risque est explicable : chaque point vient d'un facteur nomme, avec
//  ses chiffres. Et il reste distinct de la couverture (section 10).
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const RisqueService = require('../services/risque.service');

// Un membre sans rien de notable : ni atout, ni point d'attention.
const neutre = (champs = {}) => ({
    kyc: { niveau: 1 },
    ancienneteMois: 3,
    historique: { echues: 4, aTemps: 4, payeesEnRetard: 0, retardsRecents: 0, enRetardMaintenant: 0, retardMoyenJours: null, cyclesTermines: 0 },
    incidentsOuverts: 0, mobilisations: 0, cautionsActives: 0,
    solde: 100000, bloque: 0, disponible: 100000,
    flux: { entrees: 0, sorties: 0, sortiesRecentes: 0, sortiesHabituelles: 0, ecritures: 0, nonClassees: 0 },
    engagementMensuel: 0, expositionTotale: 0, tontinesEnCours: 0,
    echeances30j: 0, couvertureMin: null, couvertureGroupe: null,
    ...champs
});
const codes = (r) => r.facteurs.map(f => f.code);

test('sans facteur, le score est la base et le niveau modere', () => {
    const r = RisqueService.noter(neutre());
    assert.equal(r.score, RisqueService.regles().base);
    assert.equal(r.niveau, 'MODERE');
    assert.deepEqual(r.facteurs, []);
});

test('un bon historique abaisse le risque, facteur par facteur', () => {
    const r = RisqueService.noter(neutre({
        kyc: { niveau: 2 }, ancienneteMois: 24, cautionsActives: 1,
        historique: { ...neutre().historique, echues: 12, aTemps: 12, cyclesTermines: 2 }
    }));
    assert.equal(r.niveau, 'FAIBLE');
    assert.deepEqual(codes(r).sort(), ['anciennete', 'caution', 'cycles', 'identite', 'ponctualite']);
    assert.equal(r.score, Math.max(0, 30 - 10 - 10 - 15 - 5 - 5));
});

test('le score est la base plus la somme des points de chaque facteur', () => {
    const r = RisqueService.noter(neutre({
        historique: { ...neutre().historique, retardsRecents: 2, enRetardMaintenant: 1, retardMoyenJours: 12 },
        incidentsOuverts: 1, mobilisations: 1
    }));
    const somme = r.facteurs.reduce((s, f) => s + f.points, 0);
    assert.equal(r.score, Math.min(100, 30 + somme));
    assert.equal(r.niveau, 'ELEVE');
    assert.equal(r.libelle, 'Risque financier accru');
});

test('100 % de couverture n efface pas des retards (section 10)', () => {
    const r = RisqueService.noter(neutre({
        couvertureMin: 100, couvertureGroupe: 'A',
        historique: { ...neutre().historique, retardsRecents: 3, enRetardMaintenant: 1 }
    }));
    assert.equal(r.niveau, 'ELEVE');
    assert.ok(!codes(r).includes('couverture'));
});

test('une couverture faible est un facteur parmi d autres, pas le risque', () => {
    const r = RisqueService.noter(neutre({
        couvertureMin: 45, couvertureGroupe: 'A', kyc: { niveau: 2 },
        historique: { ...neutre().historique, echues: 10, aTemps: 10, cyclesTermines: 2 }
    }));
    assert.ok(codes(r).includes('couverture'));
    assert.equal(r.niveau, 'FAIBLE');
});

test('section 12 : forte depense recente avant une echeance -> liquidite', () => {
    const r = RisqueService.noter(neutre({
        disponible: 25000, echeances30j: 50000,
        flux: { entrees: 500000, sorties: 470000, sortiesRecentes: 420000, sortiesHabituelles: 70000, ecritures: 5, nonClassees: 0 }
    }));
    assert.ok(codes(r).includes('capacite'));
    assert.ok(codes(r).includes('liquidite'));
    // Sans echeance proche, les memes depenses ne disent rien.
    const r2 = RisqueService.noter(neutre({
        disponible: 25000, echeances30j: 0,
        flux: { entrees: 500000, sorties: 470000, sortiesRecentes: 420000, sortiesHabituelles: 70000, ecritures: 5, nonClassees: 0 }
    }));
    assert.ok(!codes(r2).includes('liquidite') && !codes(r2).includes('capacite'));
});

test('engagements eleves au regard des entrees connues, pas autrement', () => {
    const avecEntrees = RisqueService.noter(neutre({
        engagementMensuel: 225000, flux: { ...neutre().flux, entrees: 900000 }   // 300 000 / mois
    }));
    assert.ok(codes(avecEntrees).includes('engagements'));
    const sansEntrees = RisqueService.noter(neutre({ engagementMensuel: 225000 }));
    assert.ok(!codes(sansEntrees).includes('engagements'), 'pas de conclusion sans donnees');
});

test('historique trop court : signale, sans points', () => {
    const r = RisqueService.noter(neutre({ historique: { ...neutre().historique, echues: 1, aTemps: 1 } }));
    assert.equal(r.donneesSuffisantes, false);
    const f = r.facteurs.find(x => x.code === 'historique');
    assert.equal(f.points, 0);
});

test('le score reste entre 0 et 100', () => {
    const pire = RisqueService.noter(neutre({
        historique: { ...neutre().historique, retardsRecents: 9, enRetardMaintenant: 5, retardMoyenJours: 40 },
        incidentsOuverts: 5, mobilisations: 5, couvertureMin: 0, couvertureGroupe: 'A',
        disponible: 0, echeances30j: 100000, engagementMensuel: 900000,
        flux: { entrees: 300000, sorties: 900000, sortiesRecentes: 800000, sortiesHabituelles: 10000, ecritures: 9, nonClassees: 0 }
    }));
    assert.equal(pire.score, 100);
    const meilleur = RisqueService.noter(neutre({
        kyc: { niveau: 2 }, ancienneteMois: 60, cautionsActives: 2,
        historique: { ...neutre().historique, echues: 50, aTemps: 50, cyclesTermines: 9 }
    }));
    assert.equal(meilleur.score, 0);
});

test('vocabulaire de la section 42 : aucun jugement moral', () => {
    const pire = RisqueService.noter(neutre({
        historique: { ...neutre().historique, retardsRecents: 9, enRetardMaintenant: 5, retardMoyenJours: 40 },
        incidentsOuverts: 5, mobilisations: 5, couvertureMin: 0, couvertureGroupe: 'A',
        disponible: 0, echeances30j: 100000,
        flux: { entrees: 1, sorties: 900000, sortiesRecentes: 800000, sortiesHabituelles: 10000, ecritures: 9, nonClassees: 0 }
    }));
    const texte = JSON.stringify(pire).toLowerCase();
    for (const mot of ['vol', 'fraud', 'dangereu', 'suspect', 'malhonn']) {
        assert.ok(!new RegExp(`\b${mot}`).test(texte), `mot interdit : ${mot}`);
    }
});

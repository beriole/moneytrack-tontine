'use strict';

// =====================================================================
//  Niveaux de verification — services/kyc.service.js
//
//  isVerified passait a vrai pour un email confirme comme pour une
//  identite approuvee sur piece. Les niveaux les separent ; ces tests
//  gardent la separation.
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const KycService = require('../services/kyc.service');

const client = (champs) => ({ niveauKyc: 0, isVerified: false, kycExpireLe: null, ...champs });

test('le niveau vaut tel quel tant qu il n a pas expire', () => {
    const demain = new Date(Date.now() + 86400000);
    assert.equal(KycService.niveauEffectif(client({ niveauKyc: 2, isVerified: true, kycExpireLe: demain })), 2);
    assert.equal(KycService.niveauEffectif(client({ niveauKyc: 1, isVerified: true })), 1);
});

test('une identite verifiee expiree retombe au niveau de l email', () => {
    const hier = new Date(Date.now() - 86400000);
    assert.equal(KycService.niveauEffectif(client({ niveauKyc: 2, isVerified: true, kycExpireLe: hier })), 1);
    assert.equal(KycService.niveauEffectif(client({ niveauKyc: 2, isVerified: false, kycExpireLe: hier })), 0);
    assert.equal(KycService.etat(client({ niveauKyc: 2, isVerified: true, kycExpireLe: hier })).expire, true);
});

test('base de donnees', async (t) => {
    const { db, Client } = require('../models');
    try { await db.authenticate(); } catch (e) { t.skip('base injoignable'); return; }

    const email = `kyc.test.${Date.now()}@test.local`;
    const c = await Client.create({
        nom: 'Test KYC', email, telephone: `6${Date.now()}`.slice(0, 12), motDePasse: 'x', isVerified: false
    });
    t.after(async () => { await c.destroy(); await db.close(); });

    await t.test('confirmer son email donne le niveau 1, pas davantage', async () => {
        await KycService.marquerEmailConfirme(email);
        await c.reload();
        assert.equal(c.isVerified, true);
        assert.equal(Number(c.niveauKyc), 1);
    });

    await t.test('une approbation sans piece deposee est refusee', async () => {
        const r = await KycService.approuver(c.id);
        assert.equal(r.erreur, 409);
        await c.reload();
        assert.equal(Number(c.niveauKyc), 1);
    });

    await t.test('confirmer son email ne fait pas redescendre une identite verifiee', async () => {
        await c.update({ niveauKyc: 2, kycExpireLe: new Date(Date.now() + 86400000) });
        await KycService.marquerEmailConfirme(email);
        await c.reload();
        assert.equal(Number(c.niveauKyc), 2);
    });

    await t.test('un rejet retire l identite, pas l email confirme', async () => {
        await KycService.rejeter(c.id);
        await c.reload();
        assert.equal(Number(c.niveauKyc), 1);
        assert.equal(c.isVerified, true, 'le rejet mettait isVerified a faux');
    });
});

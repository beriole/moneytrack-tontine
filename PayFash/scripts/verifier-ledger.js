// =====================================================================
//  Verification du grand livre (section 30). Lecture seule.
//
//  Trois controles :
//
//    1. cohesion interne : chaque mouvement s'equilibre, le total general
//       est nul, aucun mouvement n'est reste sans ecritures ;
//    2. code : aucun fichier de production ne modifie un solde ailleurs
//       que dans services/fonds.service.js — c'est la seule porte qui
//       ecrit au grand livre ;
//    3. avec --soldes : chaque portefeuille et son compte disent le meme
//       chiffre. Ce controle ne vaut que sur une base ou tout mouvement
//       est passe par Fonds ; les scenarios, eux, posent des soldes
//       directement pour preparer leurs cas.
//
//  Usage :
//    node scripts/verifier-ledger.js
//    node scripts/verifier-ledger.js --soldes
// =====================================================================

const fs = require('fs');
const path = require('path');
const models = require('../models');
const db = models.db;

let erreurs = 0;
const ko = (texte) => { erreurs++; console.log('  ' + texte); };

async function cohesion() {
    console.log('=== MOUVEMENTS ===');
    const [[compte]] = await db.query('SELECT COUNT(*) n, COALESCE(SUM(montant), 0) total FROM ledger_mouvements');
    console.log(`  ${compte.n} mouvement(s), ${Number(compte.total)} FCFA ecrits`);

    const [desequilibres] = await db.query(`
        SELECT m.id, m.reference, m.type, m.montant,
               COALESCE(SUM(CASE WHEN e.sens = 'debit' THEN e.montant ELSE 0 END), 0) debits,
               COALESCE(SUM(CASE WHEN e.sens = 'credit' THEN e.montant ELSE 0 END), 0) credits,
               COUNT(e.id) faces
          FROM ledger_mouvements m
          LEFT JOIN ledger_ecritures e ON e.mouvementId = m.id
         GROUP BY m.id
        HAVING faces < 2 OR ABS(debits - credits) > 0.004 OR ABS(debits - m.montant) > 0.004`);
    if (desequilibres.length) {
        for (const d of desequilibres) {
            ko(`DESEQUILIBRE  mouvement ${d.id} (${d.type}) : ${d.debits} au debit, ${d.credits} au credit, ${d.faces} face(s)`);
        }
    } else {
        console.log('  => Chaque mouvement s\'equilibre, et porte son total.');
    }

    const [[global]] = await db.query(
        "SELECT COALESCE(SUM(CASE WHEN sens = 'debit' THEN montant ELSE -montant END), 0) ecart FROM ledger_ecritures");
    if (Math.abs(Number(global.ecart)) > 0.004) ko(`TOTAL GENERAL non nul : ${global.ecart}`);
    else console.log('  => Total general nul : aucun franc cree ni perdu dans le livre.');

    const [orphelines] = await db.query(`
        SELECT e.id FROM ledger_ecritures e
          LEFT JOIN ledger_mouvements m ON m.id = e.mouvementId
         WHERE m.id IS NULL`);
    if (orphelines.length) ko(`${orphelines.length} ecriture(s) sans mouvement`);
}

/**
 * Le grand livre ne vaut que si TOUT passe par lui. Un `update({ solde })`
 * ailleurs que dans fonds.service.js deplacerait de l'argent sans ecriture.
 */
function porteUnique() {
    console.log('\n=== LA SEULE PORTE ===');
    const racine = path.join(__dirname, '..');
    const dossiers = ['services', 'Controllers', 'router', 'middleware'];
    const permis = path.join('services', 'fonds.service.js');
    const fautifs = [];

    const parcourir = (dossier) => {
        for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
            const complet = path.join(dossier, entree.name);
            if (entree.isDirectory()) { parcourir(complet); continue; }
            if (!entree.name.endsWith('.js')) continue;
            const relatif = path.relative(racine, complet);
            if (relatif === permis) continue;
            const source = fs.readFileSync(complet, 'utf8');
            source.split('\n').forEach((ligne, i) => {
                // Les commentaires decrivent souvent l'ancien code, y compris
                // le « solde += montant » que cette verification interdit.
                const brut = ligne.trim();
                if (!brut || brut.startsWith('//') || brut.startsWith('*') || brut.startsWith('/*')) return;
                const code = brut.split('//')[0];
                if (/\.update\(\s*\{[^}]*\bsolde\s*:/.test(code) || /\bsolde\s*[-+]=/.test(code)) {
                    fautifs.push(`${relatif}:${i + 1}`);
                }
            });
        }
    };
    for (const d of dossiers) parcourir(path.join(racine, d));

    if (fautifs.length) {
        for (const f of fautifs) ko(`SOLDE ECRIT HORS DU GRAND LIVRE  ${f}`);
        console.log('  => Passer par Fonds (transferer, entree, sortie, ajuster) : eux ecrivent au livre.');
    } else {
        console.log('  => Aucun solde n\'est modifie hors de services/fonds.service.js.');
    }
}

async function soldes() {
    console.log('\n=== PORTEFEUILLES ET COMPTES ===');
    const [ecarts] = await db.query(`
        SELECT c.portefeuilleId, c.code, p.solde,
               COALESCE(SUM(CASE WHEN e.sens = 'credit' THEN e.montant ELSE -e.montant END), 0) livre
          FROM ledger_comptes c
          JOIN Portefeuilles p ON p.id = c.portefeuilleId
          LEFT JOIN ledger_ecritures e ON e.compteId = c.id
         WHERE c.type = 'PORTEFEUILLE'
         GROUP BY c.id
        HAVING ABS(p.solde - livre) > 0.004`);
    if (ecarts.length) {
        for (const e of ecarts) {
            ko(`ECART  ${e.code} : portefeuille ${Number(e.solde)}, grand livre ${Number(e.livre)}`);
        }
        console.log('  => Un ecart signifie qu\'un mouvement n\'est pas passe par Fonds.');
    } else {
        console.log('  => Chaque portefeuille dit la meme chose que son compte.');
    }
}

(async () => {
    await db.authenticate();
    await cohesion();
    porteUnique();
    if (process.argv.includes('--soldes')) await soldes();
    else console.log('\n(--soldes compare chaque portefeuille a son compte ; les scenarios posent des soldes a la main.)');
    console.log(erreurs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${erreurs} point(s) a corriger`);
    await db.close();
    process.exit(erreurs === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR : ' + (e.stack || e.message)); process.exit(1); });

// =====================================================================
//  Verification des colonnes monetaires (section 46).
//  Lecture seule.
//
//  Deux controles :
//    1. aucune colonne d'argent ne doit etre en flottant — un flottant
//       binaire ne represente pas exactement un centime ;
//    2. les totaux de chaque colonne, pour comparer un avant et un apres
//       de migration (--json pour les garder, --comparer <fichier> pour
//       les confronter).
//
//  Usage :
//    node scripts/verifier-montants.js
//    node scripts/verifier-montants.js --json avant.json
//    node scripts/verifier-montants.js --comparer avant.json
// =====================================================================

const models = require('../models');
const db = models.db;

// Ce qui n'est pas de l'argent malgre son nom, et n'a donc pas a etre
// converti : des parts, des taux, des compteurs.
const PAS_DE_L_ARGENT = new Set([
    'epargnes.tauxInteret',
    'epargneautomatiques.pourcentageDepot',
    'tontine_groupes.pourcentageCaution'
]);

const MOTS = /(montant|solde|prix|frais|budget|depense|contribution|limite|capital|interet|epargne|cumule|total|bloque|alloue|decote|caution|plafond)/i;

async function colonnes() {
    const [r] = await db.query(`
        SELECT TABLE_NAME t, COLUMN_NAME c, DATA_TYPE d, COLUMN_TYPE ct
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND DATA_TYPE IN ('float', 'double', 'decimal')
         ORDER BY t, c`);
    return r
        .map(x => ({ ...x, cle: `${x.t}.${x.c}` }))
        .filter(x => MOTS.test(x.c) && !PAS_DE_L_ARGENT.has(x.cle));
}

(async () => {
    await db.authenticate();
    const liste = await colonnes();
    const flottantes = liste.filter(x => x.d !== 'decimal');

    const totaux = {};
    for (const x of liste) {
        const [[s]] = await db.query(
            `SELECT COALESCE(ROUND(SUM(\`${x.c}\`), 2), 0) total, COUNT(\`${x.c}\`) lignes FROM \`${x.t}\``);
        totaux[x.cle] = { total: Number(s.total), lignes: Number(s.lignes), type: x.ct };
    }

    const args = process.argv.slice(2);
    const json = args.indexOf('--json');
    if (json !== -1) {
        // Ecrit par le script : sur la sortie standard, il se melerait aux
        // lignes que dotenv imprime au chargement.
        const cible = args[json + 1] || 'montants.json';
        require('fs').writeFileSync(cible, JSON.stringify(totaux, null, 2), 'utf8');
        console.log(`Totaux de ${Object.keys(totaux).length} colonnes ecrits dans ${cible}`);
        await db.close();
        return;
    }

    let erreurs = 0;
    console.log(`=== COLONNES MONETAIRES (${liste.length}) ===`);
    if (flottantes.length) {
        erreurs++;
        for (const x of flottantes) console.log(`  FLOTTANT  ${x.cle} ${x.ct}`);
        console.log("  => Un flottant n'exprime pas exactement un centime : a convertir en DECIMAL.");
    } else {
        console.log('  Toutes en DECIMAL.');
    }

    const compare = args.indexOf('--comparer');
    if (compare !== -1 && args[compare + 1]) {
        const avant = JSON.parse(require('fs').readFileSync(args[compare + 1], 'utf8'));
        console.log('\n=== TOTAUX AVANT / APRES ===');
        let ecarts = 0;
        for (const [cle, a] of Object.entries(avant)) {
            const b = totaux[cle];
            if (!b) { console.log(`  DISPARUE  ${cle}`); ecarts++; erreurs++; continue; }
            if (Math.abs(a.total - b.total) > 0.005 || a.lignes !== b.lignes) {
                console.log(`  ECART     ${cle} : ${a.total} (${a.lignes} l.) -> ${b.total} (${b.lignes} l.)`);
                ecarts++; erreurs++;
            }
        }
        console.log(ecarts === 0
            ? `  ${Object.keys(avant).length} colonnes : aucun total n'a bouge.`
            : `  ${ecarts} ecart(s).`);
    } else {
        console.log('\n=== TOTAUX ===');
        for (const [cle, v] of Object.entries(totaux)) {
            if (v.lignes > 0) console.log(`  ${cle.padEnd(40)} ${String(v.total).padStart(14)}  (${v.lignes} l., ${v.type})`);
        }
    }

    console.log(erreurs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${erreurs} point(s) a corriger`);
    await db.close();
    process.exit(erreurs === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR : ' + (e.stack || e.message)); process.exit(1); });

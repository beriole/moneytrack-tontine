// =====================================================================
//  Verification du module tontine — phases 0 et 1.
//  Lecture seule : ne cree, ne modifie et ne supprime rien.
//
//  Usage :  node scripts/verifier-tontine.js
//
//  Partie A (hors base)  : definitions des 16 modeles et associations.
//  Partie B (avec base)  : derive entre les modeles et le schema reel.
//     Repond a "peut-on rester en alter:false sans casser l'existant ?".
//     Ignoree proprement si MySQL n'est pas joignable.
// =====================================================================

const models = require('../models/index.js');
const ENV = require('../config/index.js');
const db = models.db;

let erreurs = 0;

// ---------------------------------------------------------------
//  A. Definitions
// ---------------------------------------------------------------
function verifierDefinitions() {
    const noms = Object.keys(models).filter(k => k.startsWith('Tontine'));

    console.log('=== MODELES TONTINE (' + noms.length + '/16) ===');
    if (noms.length !== 16) erreurs++;
    for (const nom of noms) {
        const M = models[nom];
        const nbCol = Object.keys(M.rawAttributes).length;
        const idx = (M.options.indexes || [])
            .map(i => (i.unique ? 'U' : ' ') + '(' + i.fields.join(',') + ')')
            .join(' ');
        console.log('  ' + String(M.getTableName()).padEnd(32) + String(nbCol).padStart(3) + ' col   ' + idx);
    }

    console.log('\n=== ASSOCIATIONS ===');
    const attendues = [
        ['TontineGroupe', 'createur'], ['TontineGroupe', 'caisse'], ['TontineGroupe', 'membres'],
        ['TontineGroupe', 'cycles'], ['TontineGroupe', 'poolCredit'], ['TontineGroupe', 'amendes'],
        ['TontineMembre', 'client'], ['TontineMembre', 'garant'], ['TontineMembre', 'cotisations'],
        ['TontineCycle', 'beneficiaire'], ['TontineCycle', 'cotisations'],
        ['TontineCotisation', 'cycle'], ['TontineCotisation', 'membre'], ['TontineCotisation', 'client'],
        ['TontineAmende', 'censeur'], ['TontineCaution', 'membre'],
        ['TontineVote', 'reponses'], ['TontineDemandeCredit', 'echeances'],
        ['TontineContrat', 'signatures']
    ];
    let manquantes = 0;
    for (const [modele, alias] of attendues) {
        if (!(models[modele] && models[modele].associations[alias])) {
            manquantes++; erreurs++;
            console.log('  MANQUANT  ' + modele + '.' + alias);
        }
    }
    console.log('  ' + (attendues.length - manquantes) + '/' + attendues.length + ' associations internes');

    for (const a of ['tontinesCreees', 'adhesionsTontine', 'cotisationsTontine',
                     'amendesTontine', 'cautionsTontine', 'creditsTontine']) {
        const ok = !!models.Client.associations[a];
        if (!ok) erreurs++;
        console.log('  ' + (ok ? 'ok      ' : 'MANQUANT') + '  Client.' + a);
    }

    console.log('\n=== TABLES EXISTANTES MODIFIEES ===');
    const p = models.Portefeuille.rawAttributes;
    const aTontine = p.typePortefeuille.values.includes('tontine');
    if (!aTontine || !p.groupeTontineId) erreurs++;
    console.log('  Portefeuille.typePortefeuille : ' + p.typePortefeuille.values.join(', '));
    console.log('  Portefeuille.groupeTontineId  : ' + (p.groupeTontineId ? 'present' : 'MANQUANT'));
    const tr = models.Transaction.rawAttributes;
    for (const c of ['groupeTontineId', 'cycleTontineId', 'reference']) {
        if (!tr[c]) erreurs++;
        console.log('  transaction.' + c.padEnd(16) + ': ' + (tr[c] ? 'present' : 'MANQUANT'));
    }

    console.log('\n=== CONFIG ===');
    for (const k of Object.keys(ENV).filter(k => k.startsWith('TONTINE_'))) {
        console.log('  ' + k.padEnd(30) + '= ' + ENV[k]);
    }
    if (ENV.TONTINE_CLIENT_PLATEFORME_ID === null) {
        console.log('  NB : TONTINE_CLIENT_PLATEFORME_ID non defini. A renseigner en phase 2,');
        console.log('       sinon les frais de plateforme n\'ont pas de destinataire.');
    }
}

// ---------------------------------------------------------------
//  B. Derive du schema
// ---------------------------------------------------------------
async function verifierDerive() {
    console.log('\n=== DERIVE MODELES / BASE ===');
    const qi = db.getQueryInterface();
    // MySQL sous Windows tourne en lower_case_table_names=1 : les noms sont
    // stockes en minuscules. La comparaison doit donc ignorer la casse.
    const tables = new Set(
        (await qi.showAllTables()).map(t => String(typeof t === 'string' ? t : t.tableName).toLowerCase())
    );

    let tablesAbsentes = 0, colonnesAbsentes = 0, tontineDejaLa = 0;
    const vues = new Set(); // projet/Projet sont deux alias du meme modele

    for (const [nom, M] of Object.entries(models)) {
        if (!M || typeof M.getTableName !== 'function') continue;
        const table = String(M.getTableName());
        const estTontine = nom.startsWith('Tontine');
        if (vues.has(table.toLowerCase())) continue;
        vues.add(table.toLowerCase());

        if (!tables.has(table.toLowerCase())) {
            if (estTontine) continue; // normal avant le premier demarrage
            tablesAbsentes++;
            console.log('  TABLE ABSENTE   ' + table);
            continue;
        }
        if (estTontine) { tontineDejaLa++; continue; }

        const desc = await qi.describeTable(table);
        for (const attr of Object.values(M.rawAttributes)) {
            const col = attr.field || attr.fieldName;
            if (!Object.prototype.hasOwnProperty.call(desc, col)) {
                colonnesAbsentes++;
                console.log('  COLONNE ABSENTE ' + table + '.' + col);
            }
        }
    }

    console.log('  Tables tontine deja creees        : ' + tontineDejaLa + '/16');
    console.log('  Tables du noyau absentes          : ' + tablesAbsentes);
    console.log('  Colonnes du noyau absentes        : ' + colonnesAbsentes);
    if (tablesAbsentes + colonnesAbsentes === 0) {
        console.log('  => Aucune derive : alter:false est sans risque.');
    } else {
        erreurs++;
        console.log('  => Derive detectee. Demarrer UNE fois avec alter:true dans servers.js,');
        console.log('     verifier, puis remettre alter:false.');
    }
}

(async () => {
    verifierDefinitions();
    try {
        await db.authenticate();
        await verifierDerive();
        await db.close();
    } catch (e) {
        console.log('\n=== DERIVE MODELES / BASE ===');
        console.log('  Base injoignable (' + e.message + ').');
        console.log('  Demarrer MySQL puis relancer pour ce controle.');
    }
    console.log(erreurs === 0 ? '\nRESULTAT : OK' : '\nRESULTAT : ' + erreurs + ' point(s) a corriger');
    process.exit(erreurs === 0 ? 0 : 1);
})();

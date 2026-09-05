// =====================================================================
//  Scenario de recette de la caisse 2 — phase 5.
//
//    node scripts/scenario-caisse2.js [--plateforme=2] [--garder]
//
//  Critere de sortie annonce : « un exercice complet se cloture : capital
//  et interets redistribues, somme des parts = capital de la caisse, et
//  chaque part est justifiable ligne a ligne ».
//
//  Deroule un exercice entier : apports inegaux, credit approuve par vote,
//  decaisse, rembourse avec interets, amende versee a l'epargne, puis la
//  casse annuelle au prorata.
// =====================================================================

const { Op } = require('sequelize');
const ENV = require('../config/index');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction,
    TontineGroupe, TontineMembre, TontineVote, TontinePartage,
    TontineDemandeCredit, TontineRemboursementCredit
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const { EpargneService } = require('../services/tontine/epargne.service');
const CreditService = require('../services/tontine/credit.service');
const PartageService = require('../services/tontine/partage.service');
const { VoteService } = require('../services/tontine/vote.service');
const { AmendeService } = require('../services/tontine/amende.service');
const { nombre, arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const NOM = 'Caisse Epargne Exercice';
const APPORTS = [40000, 30000, 20000, 10000];   // total 100 000
const CREDIT = 50000, DUREE = 4, TAUX = 5;      // interets = 50000 x 5% x 4 = 10 000
const AMENDE = 2000;

const forcePlateforme = (process.argv.find(a => a.startsWith('--plateforme=')) || '').split('=')[1];
if (forcePlateforme) ENV.TONTINE_CLIENT_PLATEFORME_ID = parseInt(forcePlateforme, 10);
const garder = process.argv.includes('--garder');

let echecs = 0;
let termine = false;   // sans ce drapeau, une exception sort par le finally avec le code 0
let causeArret = null;
function verifier(libelle, condition, detail) {
    const ok = !!condition;
    if (!ok) echecs++;
    console.log('  ' + (ok ? '[ok]  ' : '[KO]  ') + libelle + (detail ? '  — ' + detail : ''));
    return ok;
}
function titre(s) { console.log('\n' + s); console.log('-'.repeat(s.length)); }
async function soldeDe(id) {
    const pf = await Portefeuille.findOne({ where: { ClientPortefeuilleId: id, typePortefeuille: 'courant', estActif: true } });
    return pf ? arrondir(pf.solde) : 0;
}
async function soldePf(id) { if (!id) return 0; const p = await Portefeuille.findByPk(id); return p ? arrondir(p.solde) : 0; }
async function doitEchouer(libelle, code, fn) {
    try { await fn(); verifier(libelle, false, 'aucune erreur levee'); }
    catch (e) { verifier(libelle, e.code === code, `${e.code} — ${e.message}`); }
}
const acteur = (id) => ({ clientId: id });

(async () => {
    await db.authenticate();
    const clients = [];
    for (const e of EMAILS) {
        const c = await Client.findOne({ where: { email: e } });
        if (!c) { console.error(`Compte absent : ${e}\nLancez : node scripts/seed-tontine-demo.js`); process.exit(1); }
        clients.push(c);
    }
    const [awa, bertrand, clarisse, daniel] = clients;
    const plateformeId = ENV.TONTINE_CLIENT_PLATEFORME_ID;

    await TontineGroupe.destroy({ where: { nom: NOM } });
    const initiaux = {};
    for (const c of clients) initiaux[c.id] = await soldeDe(c.id);
    const platInit = plateformeId ? await soldeDe(plateformeId) : 0;

    let groupe;
    try {
        // =============================================================
        titre('1. Apports inegaux a la caisse');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM, type: 'mixte', montantParPeriode: 10000,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'anciennete',
            bareme: { retard: 1000, absence: AMENDE, indiscipline: 5000, autre: 1000 }
        });
        for (const c of [bertrand, clarisse, daniel]) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);

        const g = await TontineGroupe.findByPk(groupe.id);
        verifier('un groupe mixte a bien une caisse 2', !!(await models.TontinePoolCredit.findOne({ where: { groupeId: g.id } })));
        verifier('les amendes y sont dirigees par defaut', g.destinationAmendes === 'epargne');

        for (let i = 0; i < clients.length; i++) {
            await EpargneService.apporter(clients[i].id, groupe.id, APPORTS[i]);
        }
        const etat1 = await EpargneService.etat(awa.id, groupe.id);
        verifier('caisse alimentee a ' + etat1.soldeCaisse, etat1.soldeCaisse === 100000);
        verifier('les quotes-parts suivent les apports : ' + etat1.membres.map(m => m.quotePart + '%').join(' / '),
            etat1.membres.map(m => m.quotePart).join(',') === '40,30,20,10');

        await doitEchouer('un apport nul est refuse', 400,
            () => EpargneService.apporter(awa.id, groupe.id, 0));

        // =============================================================
        titre('2. Credit approuve par le groupe');
        await doitEchouer('on n emprunte pas plus que la caisse', 409,
            () => CreditService.demander(daniel.id, groupe.id, { montant: 500000, dureeMois: 3 }));

        const dem = await CreditService.demander(daniel.id, groupe.id, {
            montant: CREDIT, dureeMois: DUREE, tauxInteret: TAUX, motif: 'Stock pour la boutique'
        });
        verifier('interets simples : ' + CREDIT + ' x ' + TAUX + '% x ' + DUREE + ' = ' + dem.calcul.interets,
            dem.calcul.interets === 10000 && dem.calcul.total === 60000);
        verifier('un scrutin est ouvert d office', !!dem.vote && dem.vote.sujet === 'approuver_credit');

        await doitEchouer('deux credits simultanes sont refuses', 409,
            () => CreditService.demander(daniel.id, groupe.id, { montant: 5000, dureeMois: 2 }));
        await doitEchouer('pas de decaissement avant approbation', 409,
            () => CreditService.decaisser(acteur(awa.id), dem.demande.id));

        for (const c of clients) await VoteService.repondre(c.id, dem.vote.id, 'pour');
        const dep = await VoteService.depouiller(acteur(awa.id), dem.vote.id);
        verifier('scrutin approuve ' + dep.pour + '/' + dep.electeurs, dep.resultat === 'approuve');
        verifier('le vote a REELLEMENT approuve la demande',
            (await TontineDemandeCredit.findByPk(dem.demande.id)).statut === 'approuvee',
            dep.effet.detail);

        // =============================================================
        titre('3. Decaissement et echeancier');
        const avantD = await soldeDe(daniel.id);
        const dec = await CreditService.decaisser(acteur(awa.id), dem.demande.id);
        verifier('les ' + CREDIT + ' FCFA sont arrives chez l emprunteur',
            arrondir(await soldeDe(daniel.id) - avantD) === CREDIT);
        verifier(DUREE + ' echeances de ' + dec.mensualite + ' FCFA', dec.echeances === DUREE);

        const ech = await CreditService.echeancier(daniel.id, dem.demande.id);
        const sommeEcheances = arrondir(ech.echeances.reduce((s, e) => s + nombre(e.montantDu), 0));
        verifier('la somme des echeances tombe juste : ' + sommeEcheances, sommeEcheances === 60000);
        const sommeCapital = arrondir(ech.echeances.reduce((s, e) => s + nombre(e.partCapital), 0));
        const sommeInteret = arrondir(ech.echeances.reduce((s, e) => s + nombre(e.partInteret), 0));
        verifier('capital et interets separes ligne a ligne : ' + sommeCapital + ' + ' + sommeInteret,
            sommeCapital === CREDIT && sommeInteret === 10000);

        const poolApresDec = await EpargneService.pool(groupe.id, null);
        verifier('le capital est marque engage : ' + arrondir(poolApresDec.capitalEngage),
            arrondir(poolApresDec.capitalEngage) === CREDIT
            && arrondir(poolApresDec.capitalDisponible) === 50000);

        // =============================================================
        titre('4. Remboursement');
        await doitEchouer('un autre membre ne rembourse pas a la place', 403,
            () => CreditService.rembourser(awa.id, ech.echeances[0].id));

        for (const e of ech.echeances) await CreditService.rembourser(daniel.id, e.id);
        await doitEchouer('une echeance reglee ne se paie pas deux fois', 409,
            () => CreditService.rembourser(daniel.id, ech.echeances[0].id));

        const demFin = await TontineDemandeCredit.findByPk(dem.demande.id);
        verifier('credit marque rembourse', demFin.statut === 'remboursee');

        const poolApresRemb = await EpargneService.pool(groupe.id, null);
        verifier('plus rien n est engage', arrondir(poolApresRemb.capitalEngage) === 0);
        verifier('les interets sont comptabilises a part : ' + arrondir(poolApresRemb.interetsCumules),
            arrondir(poolApresRemb.interetsCumules) === 10000);

        // =============================================================
        titre('5. Une amende alimente la caisse');
        const censeur = await TontineMembre.findOne({ where: { groupeId: groupe.id, clientId: clarisse.id } });
        await censeur.update({ role: 'censeur' });
        const amende = await AmendeService.infliger(acteur(clarisse.id), groupe.id,
            { clientId: bertrand.id, motif: 'absence' });
        verifier('amende dirigee vers la caisse 2', amende.destination === 'epargne');
        await AmendeService.payer(bertrand.id, amende.id);

        const poolAvantCasse = await EpargneService.pool(groupe.id, null);
        verifier('les amendes sont comptabilisees a part : ' + arrondir(poolAvantCasse.amendesCumulees),
            arrondir(poolAvantCasse.amendesCumulees) === AMENDE);

        const gCaisse = await TontineGroupe.findByPk(groupe.id);
        const soldeCaisse = await soldePf(gCaisse.portefeuilleEpargneId);
        verifier('caisse = 100000 apports + 10000 interets + 2000 amende = ' + soldeCaisse,
            soldeCaisse === 112000);

        // =============================================================
        titre('6. La casse annuelle');
        const sim = await PartageService.simuler(awa.id, groupe.id);
        verifier('produit de l exercice = ' + sim.produit + ' (interets + amendes)', sim.produit === 12000);
        verifier('cloture possible : plus aucun credit dehors', sim.cloturePossible === true);
        console.log('  repartition simulee :');
        sim.parts.forEach(p => console.log('    ' + p.nom.padEnd(18) + 'apport ' + String(p.apports).padStart(6)
            + '  quote-part ' + String(p.quotePart).padStart(5) + '%  produit ' + String(p.partProduit).padStart(5)
            + '  = ' + p.total));

        await doitEchouer('un simple membre ne cloture pas l exercice', 403,
            () => PartageService.cloturer(acteur(daniel.id), groupe.id, 2026));

        const avantCasse = {};
        for (const c of clients) avantCasse[c.id] = await soldeDe(c.id);

        const casse = await PartageService.cloturer(acteur(awa.id), groupe.id, 2026);
        verifier('total distribue = solde de la caisse : ' + casse.totalDistribue, casse.totalDistribue === 112000);
        verifier('apports rendus ' + casse.apportsRendus + ' + produit ' + casse.produitPartage,
            casse.apportsRendus === 100000 && casse.produitPartage === 12000);

        const sommeParts = arrondir(casse.detail.reduce((s, d) => s + d.total, 0));
        verifier('somme des parts = capital de la caisse', sommeParts === 112000, sommeParts + ' FCFA');

        const attendus = { [awa.id]: 44800, [bertrand.id]: 33600, [clarisse.id]: 22400, [daniel.id]: 11200 };
        for (const c of clients) {
            const recu = arrondir(await soldeDe(c.id) - avantCasse[c.id]);
            verifier(c.nom + ' recoit ' + recu, recu === attendus[c.id], 'attendu ' + attendus[c.id]);
        }

        verifier('la caisse est vide apres repartition',
            await soldePf(gCaisse.portefeuilleEpargneId) === 0);
        const poolFinal = await EpargneService.pool(groupe.id, null);
        verifier('le pool repart a zero pour le nouvel exercice',
            arrondir(poolFinal.capitalTotal) === 0 && arrondir(poolFinal.apportsMembres) === 0
            && arrondir(poolFinal.interetsCumules) === 0 && arrondir(poolFinal.amendesCumulees) === 0);

        titre('7. Chaque part est justifiable');
        const enregistre = await TontinePartage.findOne({ where: { groupeId: groupe.id, exercice: 2026 } });
        verifier('l exercice est enregistre et cloture', enregistre && enregistre.statut === 'cloture');
        const d0 = enregistre.detail[0];
        verifier('le detail porte apport, quote-part, produit, total et l ecriture',
            d0 && d0.apports !== undefined && d0.quotePart !== undefined
            && d0.partProduit !== undefined && d0.total !== undefined && d0.transactionId,
            JSON.stringify(d0));
        const ecritures = await Transaction.count({ where: { groupeTontineId: groupe.id, type: 'partage_epargne' } });
        verifier('une ecriture de partage par beneficiaire', ecritures === 4);

        await doitEchouer('un exercice deja cloture ne se recloture pas', 409,
            () => PartageService.cloturer(acteur(awa.id), groupe.id, 2026));

        // =============================================================
        titre('8. Conservation de la monnaie');
        let delta = 0;
        for (const c of clients) {
            const fin = await soldeDe(c.id);
            const d = arrondir(fin - initiaux[c.id]);
            delta += d;
            console.log('  ' + c.nom.padEnd(18) + initiaux[c.id] + ' -> ' + fin + '   (' + (d >= 0 ? '+' : '') + d + ')');
        }
        const deltaPlat = plateformeId ? arrondir(await soldeDe(plateformeId) - platInit) : 0;
        const gF = await TontineGroupe.findByPk(groupe.id);
        const bloque = arrondir(await soldePf(gF.portefeuilleId)
            + await soldePf(gF.portefeuilleCautionId) + await soldePf(gF.portefeuilleEpargneId));
        console.log('  ' + 'immobilise'.padEnd(18) + bloque);
        verifier('rien ne se perd, rien ne se cree',
            arrondir(delta + deltaPlat + bloque) === 0, 'somme = ' + arrondir(delta + deltaPlat + bloque));
        verifier('le jeu est a somme nulle entre membres : l amende a change de mains',
            arrondir(delta) === 0);

        termine = true;

    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder && groupe) {
            titre('Nettoyage');
            const g = await TontineGroupe.findOne({ where: { nom: NOM } });
            if (g) {
                const ids = [g.portefeuilleId, g.portefeuilleCautionId, g.portefeuilleEpargneId].filter(Boolean);
                await Transaction.destroy({ where: { groupeTontineId: g.id } });
                await TontineGroupe.destroy({ where: { id: g.id } });
                if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            }
            for (const c of clients) {
                await Portefeuille.update({ solde: initiaux[c.id] },
                    { where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' } });
            }
            if (plateformeId) {
                await Portefeuille.update({ solde: platInit },
                    { where: { ClientPortefeuilleId: plateformeId, typePortefeuille: 'courant' } });
            }
            console.log('  groupe, portefeuilles, ecritures supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

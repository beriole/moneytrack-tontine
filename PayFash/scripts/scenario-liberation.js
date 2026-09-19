/**
 * Scenario : liberation progressive des garanties (section 24).
 *
 * Quatre membres, 100 000 XAF par periode. Le dernier a passer doit trois
 * cotisations : 300 000. Le reglement exige, pour le dernier tour, une
 * couverture de 50 % de ce qui reste a payer : 150 000. Il bloque deux
 * garanties, 100 000 puis 50 000.
 *
 *   1. apres chaque cotisation payee, la part qui depasse lui revient :
 *      50 000 puis 50 000, la garantie la plus recente d'abord
 *   2. le reglement baisse le taux : il reprend l'excedent a sa demande
 *   3. restriction, echeance en retard : rien n'est rendu, et il sait pourquoi
 *   4. il regularise puis regle son amende : plus rien a couvrir, tout est rendu
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-liberation.js [--garder]
 */

const { Op } = require('sequelize');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction, Restriction,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation,
    TontineGarantie, TontineGarantieMouvement, TontineConsentementGarantie
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const GarantieService = require('../services/tontine/garantie.service');
const LiberationService = require('../services/tontine/liberation.service');
const DefautService = require('../services/tontine/defaut.service');
const { RestrictionService } = require('../services/restriction.service');
const Fonds = require('../services/fonds.service');
const { arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const MONTANT = 100000;
const NOM_GROUPE = 'Scenario Liberation';
const ADMIN = { admin: { id: null, email: 'scenario@tontine.local' } };
const garder = process.argv.includes('--garder');

let echecs = 0;
let termine = false;
let causeArret = null;
function verifier(libelle, condition, detail) {
    const ok = !!condition;
    if (!ok) echecs++;
    console.log('  ' + (ok ? '[ok]  ' : '[KO]  ') + libelle + (detail ? '  — ' + detail : ''));
    return ok;
}
function titre(s) { console.log('\n' + s); console.log('-'.repeat(s.length)); }
async function doitEchouer(libelle, codeAttendu, fn) {
    try { await fn(); verifier(libelle, false, 'aucune erreur levee'); }
    catch (e) { verifier(libelle, e.code === codeAttendu, `${e.code} — ${e.message}`); }
}
const portefeuilleDe = (clientId, type) => Portefeuille.findOne({
    where: { ClientPortefeuilleId: clientId, estActif: true, typePortefeuille: type }
});

(async () => {
    await db.authenticate();

    const clients = [];
    for (const email of EMAILS) {
        const c = await Client.findOne({ where: { email } });
        if (!c) { console.error(`Compte absent : ${email}\nLancez : node scripts/seed-tontine-demo.js`); process.exit(1); }
        clients.push(c);
    }
    const [awa] = clients;
    await TontineGroupe.destroy({ where: { nom: NOM_GROUPE } });

    const initiaux = {};
    for (const c of clients) {
        for (const type of ['courant', 'epargne']) {
            const pf = await portefeuilleDe(c.id, type);
            if (pf) initiaux[pf.id] = { solde: pf.solde, reserve: Fonds.reserve(pf) };
        }
    }

    console.log('SCENARIO LIBERATION — 4 membres, ' + MONTANT + ' XAF/periode, couverture 50 % au dernier tour');
    let groupe;
    const crees = [];
    let D;

    try {
        // --- 0. Mise en place ---------------------------------------------
        titre('0. Mise en place');
        for (const c of clients) {
            const pf = await portefeuilleDe(c.id, 'courant');
            await pf.update({ solde: arrondir(pf.solde) + 4 * MONTANT });
        }
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, montantParPeriode: MONTANT, frequence: 'mensuelle',
            membresMax: 4, modeOrdre: 'tirage', pourcentageCaution: 0,
            // Aucune exigence pour les trois premiers tours, 50 % au dernier.
            reglesCouverture: { tauxParDefaut: 50, paliers: [{ jusquAuTour: 3, taux: 0 }] },
            // Pas de recouvrement automatique : l'etape 3 a besoin d'une
            // echeance qui reste en souffrance.
            politiqueRecouvrement: { ordre: [], delaiGraceJours: 0 }
        });
        for (const c of clients.slice(1)) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        await GroupeService.demarrerGroupe(awa.id, groupe.id);

        const dernier = await TontineMembre.findOne({ where: { groupeId: groupe.id, ordreBeneficiaire: 4 } });
        D = clients.find(c => c.id === dernier.clientId);
        console.log('  membre suivi : ' + D.nom + ' (tour 4)');

        let epargne = await portefeuilleDe(D.id, 'epargne');
        if (!epargne) {
            epargne = await Portefeuille.create({
                nom: 'Epargne (scenario)', solde: 0, devise: 'XAF', typePortefeuille: 'epargne',
                estPrincipal: false, estActif: true, ClientPortefeuilleId: D.id
            });
            crees.push(epargne.id);
        }
        await epargne.update({ solde: 200000, montantReserve: 0 });
        const affecter = async (montant) => {
            const sim = await GarantieService.simuler(D.id, groupe.id, epargne.id, montant);
            return (await GarantieService.affecter(D.id, groupe.id,
                { portefeuilleId: epargne.id, montant, hashTexte: sim.hashTexte })).garantie;
        };
        const ancienne = await affecter(100000);
        const recente = await affecter(50000);

        let e = await LiberationService.excedent(D.id, groupe.id);
        verifier('au depart : 300 000 a payer, 150 000 a garder, rien a rendre',
            e.exposition === 300000 && e.aGarder === 150000 && e.liberable === 0, e.raison);

        // --- 1. Au fil des cotisations ------------------------------------
        titre('1. Chaque cotisation payee libere l excedent');
        const tourDeCycle = async (n) => {
            const cycle = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: n } });
            const cots = await TontineCotisation.findAll({ where: { cycleId: cycle.id } });
            for (const c of cots) await CycleService.cotiser(c.clientId, cycle.id);
            await CycleService.verser({ clientId: awa.id }, cycle.id);
        };

        await tourDeCycle(1);
        await recente.reload(); await ancienne.reload();
        verifier('cycle 1 : 200 000 a payer, 100 000 a garder -> 50 000 rendus',
            arrondir(recente.montantLibere) === 50000 && arrondir(ancienne.montantLibere) === 0);
        verifier('la garantie la plus recente part d abord', recente.statut === 'liberee');

        await tourDeCycle(2);
        await ancienne.reload();
        verifier('cycle 2 : 100 000 a payer, 50 000 a garder -> 50 000 de plus',
            arrondir(ancienne.montantLibere) === 50000 && GarantieService.restant(ancienne) === 50000);

        let ep = await Portefeuille.findByPk(epargne.id);
        verifier('l argent n a pas bouge, seul le disponible remonte',
            arrondir(ep.solde) === 200000 && Fonds.reserve(ep) === 50000 && Fonds.disponible(ep) === 150000);
        const mvts = await TontineGarantieMouvement.findAll({ where: { garantieId: [ancienne.id, recente.id], sens: 'liberation' } });
        verifier('chaque liberation est tracee avec son motif',
            mvts.length === 2 && mvts.every(m => m.motif.startsWith('Liberation progressive') && m.acteurType === 'SYSTEME'));

        // --- 2. Le reglement baisse le taux ---------------------------------
        titre('2. Taux abaisse a 25 % : reprise a la demande');
        await doitEchouer('rien a reprendre tant que le taux n a pas change', 409,
            () => LiberationService.reprendreExcedent(D.id, groupe.id));
        await TontineGroupe.update({ reglesCouverture: { tauxParDefaut: 25, paliers: [{ jusquAuTour: 3, taux: 0 }] } },
            { where: { id: groupe.id } });
        e = await LiberationService.excedent(D.id, groupe.id);
        verifier('25 000 deviennent liberables', e.liberable === 25000 && e.aGarder === 25000, e.raison);
        const rep = await LiberationService.reprendreExcedent(D.id, groupe.id);
        verifier('le membre reprend 25 000', rep.libere === 25000);

        // --- 3. Ce qui bloque ------------------------------------------------
        titre('3. Restriction, echeance en retard');
        await TontineGroupe.update({ reglesCouverture: null }, { where: { id: groupe.id } });
        e = await LiberationService.excedent(D.id, groupe.id);
        verifier('sans taux, tout ce qui reste a payer reste couvert : rien a rendre',
            e.aGarder === 100000 && e.liberable === 0);
        await TontineGroupe.update({ reglesCouverture: { tauxParDefaut: 10, paliers: [{ jusquAuTour: 3, taux: 0 }] } },
            { where: { id: groupe.id } });
        e = await LiberationService.excedent(D.id, groupe.id);
        verifier('a 10 %, 15 000 seraient liberables', e.liberable === 15000, e.raison);

        const restr = await RestrictionService.poser(ADMIN,
            { clientId: D.id, type: 'WITHDRAW_GUARANTEE_DISABLED', motif: 'Verification en cours' });
        e = await LiberationService.excedent(D.id, groupe.id);
        verifier('restriction : rien n est rendu, et la raison est dite',
            e.liberable === 0 && e.raison.includes('Verification en cours'), e.raison);
        await RestrictionService.lever(ADMIN, restr.id, 'Verification terminee');

        const cycle3 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 3 } });
        const cot3 = await TontineCotisation.findOne({ where: { cycleId: cycle3.id, clientId: D.id } });
        await cycle3.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        await CycleService.traiterEcheances();
        e = await LiberationService.excedent(D.id, groupe.id);
        verifier('echeance en retard : rien n est rendu', e.liberable === 0 && e.raison.includes('echeance'), e.raison);

        // --- 4. Regularisation ------------------------------------------------
        titre('4. Il regularise : tout lui revient');
        await DefautService.regulariser(D.id, cot3.id);
        await ancienne.reload();
        ep = await Portefeuille.findByPk(epargne.id);
        verifier('reste couvert : 10 % de l amende de retard encore due (100)',
            GarantieService.restant(ancienne) === 100 && Fonds.reserve(ep) === 100);
        const { AmendeService } = require('../services/tontine/amende.service');
        const { amendes } = await AmendeService.mesAmendes(D.id, groupe.id);
        for (const a of amendes.filter(x => x.statut === 'due')) await AmendeService.payer(D.id, a.id);
        await ancienne.reload();
        ep = await Portefeuille.findByPk(epargne.id);
        verifier('amende reglee : plus rien a couvrir, la garantie est entierement rendue',
            ancienne.statut === 'liberee' && GarantieService.restant(ancienne) === 0 && Fonds.reserve(ep) === 0);
        verifier('la reserve du portefeuille egale ses garanties bloquees',
            Fonds.reserve(ep) === await GarantieService.totalBloque(D.id, groupe.id));

        termine = true;
    } catch (err) {
        causeArret = err;
    } finally {
        if (!garder && groupe) {
            titre('Nettoyage');
            if (D) await Restriction.destroy({ where: { clientId: D.id, motif: 'Verification en cours' } });
            const g = await TontineGroupe.findByPk(groupe.id);
            const ids = g ? [g.portefeuilleId, g.portefeuilleCautionId].filter(Boolean) : [];
            const garanties = await TontineGarantie.findAll({ where: { groupeId: groupe.id }, attributes: ['id'] });
            await TontineGarantieMouvement.destroy({ where: { garantieId: garanties.map(x => x.id) } });
            await TontineGarantie.destroy({ where: { groupeId: groupe.id } });
            await TontineConsentementGarantie.destroy({ where: { groupeId: groupe.id } });
            await Transaction.destroy({ where: { groupeTontineId: groupe.id } });
            if (g) await g.destroy();
            if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            for (const [id, etat] of Object.entries(initiaux)) {
                await Portefeuille.update({ montantReserve: 0 }, { where: { id } });
                await Portefeuille.update({ solde: etat.solde, montantReserve: etat.reserve }, { where: { id } });
            }
            if (crees.length) {
                await Portefeuille.update({ montantReserve: 0 }, { where: { id: crees } });
                await Portefeuille.destroy({ where: { id: crees } });
            }
            console.log('  groupe, garanties, restriction, portefeuilles, ecritures supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

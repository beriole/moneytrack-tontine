// =====================================================================
//  Scenario de recette de la SYNCHRONISATION — un seul systeme.
//
//    node scripts/scenario-synchronisation.js [--plateforme=2] [--garder]
//
//  Ne teste pas la tontine pour elle-meme : teste qu'elle et le reste de
//  MoneyTrack se parlent.
//
//    1. la cotisation s'inscrit dans le BUDGET du membre ;
//    2. le tour tombe dans le PROJET choisi, pas dans le courant ;
//    3. le solde affiche distingue brut / engage / immobilise / disponible ;
//    4. la tresorerie projette le point bas et dit si l'on tient ;
//    5. le simulateur repond « ce projet, finance par tes tours, quand ? » ;
//    6. le contexte global du chatbot voit la tontine.
// =====================================================================

const { Op } = require('sequelize');
const ENV = require('../config/index');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction, Budget, Categorie, OneBudget, depense: Depense,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const SyntheseService = require('../services/tontine/synthese.service');
const IntegrationService = require('../services/tontine/integration.service');
const { nombre, arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const NOM_GROUPE = 'Synchronisation Njangi';
const NOM_BUDGET = 'Budget Synchronisation';
const NOM_PROJET_PF = 'Projet Moto (test sync)';
const MONTANT = 30000;

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
}
function titre(s) { console.log('\n' + s); console.log('-'.repeat(s.length)); }
async function soldeDe(id) {
    const pf = await Portefeuille.findOne({ where: { ClientPortefeuilleId: id, typePortefeuille: 'courant', estActif: true } });
    return pf ? arrondir(pf.solde) : 0;
}
async function soldePf(id) { if (!id) return 0; const p = await Portefeuille.findByPk(id); return p ? arrondir(p.solde) : 0; }
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

    // Nettoyage prealable
    await TontineGroupe.destroy({ where: { nom: NOM_GROUPE } });
    await Budget.destroy({ where: { nom: NOM_BUDGET } });
    await Portefeuille.destroy({ where: { nom: NOM_PROJET_PF } });

    const initiaux = {};
    for (const c of clients) initiaux[c.id] = await soldeDe(c.id);
    const platInit = plateformeId ? await soldeDe(plateformeId) : 0;

    let groupe, budget, pfProjet;
    try {
        // =============================================================
        titre('1. Le decor : un budget et un projet existants');
        budget = await Budget.create({
            nom: NOM_BUDGET,
            montantAllouer: 200000,
            periodeDebut: new Date(),
            periodeFin: new Date(Date.now() + 90 * 86400000),
            typeCycle: 'mensuel',
            estActif: true,
            montantDepense: 0,
            ClientBudgetId: awa.id
        });
        verifier('budget cree, aucune depense', arrondir(budget.montantDepense) === 0);

        pfProjet = await Portefeuille.create({
            nom: NOM_PROJET_PF, solde: 0, devise: 'XAF', typePortefeuille: 'projet',
            estActif: true, estPrincipal: false, objectifMontant: 450000,
            ClientPortefeuilleId: awa.id
        });
        verifier('portefeuille de projet cree, objectif 450 000', arrondir(pfProjet.solde) === 0);

        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, type: 'rotative', montantParPeriode: MONTANT,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'anciennete', pourcentageCaution: 0
        });
        for (const c of [bertrand, clarisse, daniel]) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);

        // =============================================================
        titre('2. La tontine entre dans le budget');
        const liensAvant = await IntegrationService.etatLiens(awa.id, groupe.id);
        verifier('avant liaison, le systeme sait qu il manque un lien',
            liensAvant.budget.lie === false && !!liensAvant.budget.pourquoi,
            liensAvant.budget.pourquoi);

        const lien = await IntegrationService.lierBudget(awa.id, groupe.id);
        verifier('categorie creee au nom du groupe : ' + lien.categorie.nom,
            lien.categorie.nom.includes(NOM_GROUPE));
        verifier('le budget porte l engagement reel : ' + lien.montantEngage,
            lien.montantEngage === MONTANT);

        const pivot = await OneBudget.findOne({ where: { budgetId: budget.id, categorieId: lien.categorie.id } });
        verifier('le rattachement budget-categorie porte le montant', pivot && arrondir(pivot.montant) === MONTANT);

        // =============================================================
        titre('3. Cotiser ecrit dans le budget');
        await GroupeService.demarrerGroupe(awa.id, groupe.id);
        const cycle1 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        const beneficiaire1 = await Client.findByPk(cycle1.beneficiaireId);
        console.log('  beneficiaire du cycle 1 : ' + beneficiaire1.nom);

        const maCotisation = await TontineCotisation.findOne({
            where: { cycleId: cycle1.id, clientId: awa.id }
        });

        if (maCotisation) {
            const depAvant = await Depense.count({ where: { categorieId: lien.categorie.id } });
            await CycleService.cotiser(awa.id, cycle1.id);
            const depApres = await Depense.count({ where: { categorieId: lien.categorie.id } });
            const budgetMaj = await Budget.findByPk(budget.id);

            verifier('une ligne de depense est apparue dans la categorie',
                depApres === depAvant + 1);
            verifier('le budget a enregistre la depense : ' + arrondir(budgetMaj.montantDepense),
                arrondir(budgetMaj.montantDepense) === MONTANT);

            const ligne = await Depense.findOne({
                where: { categorieId: lien.categorie.id }, order: [['id', 'DESC']]
            });
            verifier('la depense porte un libelle explicite', /Cotisation/.test(ligne.description), ligne.description);
        } else {
            verifier('Awa est beneficiaire du cycle 1 : elle ne cotise pas', true,
                'le test budget se poursuit sur le cycle suivant');
        }

        // =============================================================
        titre('4. Le solde cesse de mentir');
        const solde = await SyntheseService.soldeReel(awa.id);
        console.log('  brut ' + solde.brut + '  |  engage 30j ' + solde.engage30j
            + '  |  immobilise ' + solde.immobilise + '  |  disponible ' + solde.disponible);
        verifier('disponible = brut - engage a 30 jours',
            solde.disponible === arrondir(solde.brut - solde.engage30j));
        verifier('le solde brut seul aurait surestime la marge',
            solde.engage30j >= 0 && solde.disponible <= solde.brut);

        // =============================================================
        titre('5. Le tour est dirige vers le projet');
        const dest = await IntegrationService.destinationsPossibles(awa.id, groupe.id);
        const optionProjet = dest.options.find(o => o.id === pfProjet.id);
        verifier('le projet figure parmi les destinations possibles', !!optionProjet);
        verifier('avec son contexte de financement', !!optionProjet?.contexte, optionProjet?.contexte);
        verifier('aucune caisse de tontine n est proposee',
            !dest.options.some(o => o.type === 'tontine'));

        const route = await IntegrationService.routerTour(awa.id, groupe.id, pfProjet.id);
        verifier('destination enregistree', route.portefeuille.id === pfProjet.id, route.message);

        // =============================================================
        titre('6. La tresorerie projette');
        const treso = await SyntheseService.tresorerie(awa.id, 365);
        console.log('  ' + treso.evenements.length + ' evenements sur 12 mois, point bas '
            + treso.creux.montant + (treso.creux.date ? ' le ' + new Date(treso.creux.date).toLocaleDateString('fr-FR') : ''));
        verifier('la ligne de temps melange sorties et entrees',
            treso.evenements.some(e => e.sens === 'sortie') && treso.evenements.some(e => e.sens === 'entree'));
        verifier('elle est triee chronologiquement',
            treso.evenements.every((e, i, a) => i === 0 || new Date(a[i - 1].date) <= new Date(e.date)));
        verifier('elle dit si le solde tient', typeof treso.tiendra === 'boolean',
            treso.tiendra ? 'le solde tient' : 'le solde casse au point bas');

        const tour = treso.evenements.find(e => e.nature === 'tour');
        verifier('le tour a venir est date et chiffre',
            !!tour && tour.montant > 0 && !!tour.date,
            tour ? `${tour.montant} FCFA le ${new Date(tour.date).toLocaleDateString('fr-FR')}` : '—');

        // =============================================================
        titre('7. « Ce projet, ma tontine le finance quand ? »');
        const simu = await SyntheseService.simulerFinancement(awa.id, 450000);
        console.log('  ' + simu.conseil);
        verifier('le simulateur repond avec un conseil actionnable', !!simu.conseil);
        verifier('il chiffre ce qui manque', simu.suffisant || simu.manque > 0);

        const simuPetit = await SyntheseService.simulerFinancement(awa.id, 1000);
        verifier('un petit montant est couvert par le prochain tour',
            simuPetit.suffisant === true && !!simuPetit.dateCouverture);

        // =============================================================
        titre('8. Le tour atterrit vraiment dans le projet');
        // On solde tous les cycles jusqu'a celui d'Awa.
        let cycle = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        let versementAwa = null;
        for (let i = 0; i < 4 && cycle; i++) {
            for (const c of await TontineCotisation.findAll({ where: { cycleId: cycle.id } })) {
                const f = await TontineCotisation.findByPk(c.id);
                if (f.statut !== 'payee') await CycleService.cotiser(c.clientId, cycle.id);
            }
            const soldeProjetAvant = await soldePf(pfProjet.id);
            const soldeCourantAvant = await soldeDe(cycle.beneficiaireId);
            const r = await CycleService.verser(acteur(awa.id), cycle.id);

            if (cycle.beneficiaireId === awa.id) {
                versementAwa = r;
                verifier('le pot est alle au projet, pas au courant',
                    arrondir(await soldePf(pfProjet.id) - soldeProjetAvant) === arrondir(r.net)
                    && arrondir(await soldeDe(awa.id) - soldeCourantAvant) === 0,
                    `projet +${arrondir(await soldePf(pfProjet.id) - soldeProjetAvant)}, courant +0`);
                verifier('le versement nomme sa destination',
                    r.destination && r.destination.id === pfProjet.id, r.destination?.nom);
                verifier('l ecriture comptable le dit aussi',
                    /Projet Moto/.test(r.versement.description), r.versement.description);
            }
            cycle = r.cycleSuivant ? await TontineCycle.findByPk(r.cycleSuivant.id) : null;
        }
        verifier('Awa a bien recu son tour', !!versementAwa);

        const budgetFinal = await Budget.findByPk(budget.id);
        verifier('le budget a suivi toutes les cotisations d Awa : ' + arrondir(budgetFinal.montantDepense),
            arrondir(budgetFinal.montantDepense) === MONTANT * 3,
            '3 cycles cotises sur 4 (pas le sien)');

        // =============================================================
        titre('9. Le contexte global voit la tontine');
        const complete = await SyntheseService.complete(awa.id);
        verifier('la synthese expose solde, engagements, a recevoir, immobilise',
            complete.solde && Array.isArray(complete.engagements)
            && Array.isArray(complete.aRecevoir) && Array.isArray(complete.immobilise));

        const src = require('fs').readFileSync('./Controllers/client/client.budget.js', 'utf8');
        verifier('getContextesUtilisateur retourne desormais la tontine',
            /tontine\s*$|tontine\n/m.test(src) && /SyntheseService/.test(src));

        // =============================================================
        titre('10. Conservation de la monnaie');
        let delta = 0;
        for (const c of clients) {
            const fin = await soldeDe(c.id);
            const d = arrondir(fin - initiaux[c.id]);
            delta += d;
            console.log('  ' + c.nom.padEnd(18) + initiaux[c.id] + ' -> ' + fin + '   (' + (d >= 0 ? '+' : '') + d + ')');
        }
        const dansProjet = await soldePf(pfProjet.id);
        const deltaPlat = plateformeId ? arrondir(await soldeDe(plateformeId) - platInit) : 0;
        const gF = await TontineGroupe.findByPk(groupe.id);
        const enCaisse = arrondir(await soldePf(gF.portefeuilleId)
            + await soldePf(gF.portefeuilleCautionId) + await soldePf(gF.portefeuilleEpargneId));
        console.log('  ' + 'projet moto'.padEnd(18) + dansProjet);
        console.log('  ' + 'plateforme'.padEnd(18) + '+' + deltaPlat);
        verifier('rien ne se perd : le tour a change de poche, pas disparu',
            arrondir(delta + dansProjet + deltaPlat + enCaisse) === 0,
            'somme = ' + arrondir(delta + dansProjet + deltaPlat + enCaisse));

        termine = true;

    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            const g = await TontineGroupe.findOne({ where: { nom: NOM_GROUPE } });
            if (g) {
                const ids = [g.portefeuilleId, g.portefeuilleCautionId, g.portefeuilleEpargneId].filter(Boolean);
                await Transaction.destroy({ where: { groupeTontineId: g.id } });
                await TontineGroupe.destroy({ where: { id: g.id } });
                if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            }
            const b = await Budget.findOne({ where: { nom: NOM_BUDGET } });
            if (b) {
                const cats = await OneBudget.findAll({ where: { budgetId: b.id } });
                for (const c of cats) {
                    await Depense.destroy({ where: { categorieId: c.categorieId } });
                    await Categorie.destroy({ where: { id: c.categorieId, nomCategorie: { [Op.like]: 'Tontine —%' } } });
                }
                await OneBudget.destroy({ where: { budgetId: b.id } });
                await Budget.destroy({ where: { id: b.id } });
            }
            await Portefeuille.destroy({ where: { nom: NOM_PROJET_PF } });
            for (const c of clients) {
                await Portefeuille.update({ solde: initiaux[c.id] },
                    { where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' } });
            }
            if (plateformeId) {
                await Portefeuille.update({ solde: platInit },
                    { where: { ClientPortefeuilleId: plateformeId, typePortefeuille: 'courant' } });
            }
            console.log('  groupe, budget, categorie, projet et ecritures supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

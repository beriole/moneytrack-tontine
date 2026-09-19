/**
 * Scenario : le moteur de defaut et la politique de recouvrement.
 *
 * Reprend l'exemple de la section 22 : une cotisation de 50 000 FCFA
 * impayee, une caution de 20 000 et une garantie de 40 000 sur l'epargne.
 * MoneyTrack prend 20 000 a la caution, puis 30 000 a la garantie — pas 40.
 *
 *   1. delai de grace : a l'echeance, constat et amende, rien n'est preleve
 *   2. recouvrement dans l'ordre du reglement, le manque et rien de plus
 *   3. sources epuisees : incident de defaut, eligibilite fermee
 *   4. un second passage ne reprend rien et n'ouvre rien de plus
 *   5. versement force : la dette survit au cycle
 *   6. regularisation : l'argent va au beneficiaire lese, pas a la caisse
 *   7. retenue sur le pot du debiteur : l'incident se regle
 *
 * Trois membres ; le defaillant est celui qui passe en dernier, pour qu'il
 * doive deux cotisations avant de recevoir son pot.
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-defauts.js [--garder]
 */

const { Op } = require('sequelize');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction, AuditLog,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineIncidentDefaut,
    TontineGarantie, TontineGarantieMouvement, TontineConsentementGarantie
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const CautionService = require('../services/tontine/caution.service');
const GarantieService = require('../services/tontine/garantie.service');
const DefautService = require('../services/tontine/defaut.service');
const ContratService = require('../services/tontine/contrat.service');
const EligibiliteService = require('../services/tontine/eligibilite.service');
const Fonds = require('../services/fonds.service');
const { arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local'];
const MONTANT = 50000;
const NOM_GROUPE = 'Scenario Defauts';
const JOUR = 86400000;
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
const solde = async (clientId) => arrondir((await portefeuilleDe(clientId, 'courant')).solde);
const refusePour = (evaluation) => (evaluation.controles || []).filter(c => !c.ok).map(c => c.code);

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

    console.log('SCENARIO DEFAUTS — 3 membres, ' + MONTANT + ' XAF/periode, caution 40 %');
    let groupe;
    const crees = [];
    const debut = new Date();

    try {
        // --- 0. Mise en place ---------------------------------------------
        titre('0. Mise en place');
        for (const c of clients) {
            const pf = await portefeuilleDe(c.id, 'courant');
            await pf.update({ solde: arrondir(pf.solde) + 4 * MONTANT });
        }
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, montantParPeriode: MONTANT, frequence: 'mensuelle',
            membresMax: 3, modeOrdre: 'tirage', pourcentageCaution: 40,
            politiqueRecouvrement: { ordre: ['caution', 'garanties'], delaiGraceJours: 3 }
        });
        verifier('la politique choisie est enregistree',
            JSON.stringify(groupe.politiqueRecouvrement) === JSON.stringify({ ordre: ['caution', 'garanties'], delaiGraceJours: 3 }));
        const texte = ContratService.texteParDefaut(groupe);
        verifier('le reglement ecrit l ordre et le delai de grace',
            texte.includes('3 jour(s)') && texte.includes('1) la caution') && texte.includes('2) les garanties'));

        for (const c of clients.slice(1)) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        for (const c of clients) await CautionService.bloquer(c.id, groupe.id);
        await GroupeService.demarrerGroupe(awa.id, groupe.id);

        const dernier = await TontineMembre.findOne({ where: { groupeId: groupe.id, ordreBeneficiaire: 3 } });
        const D = clients.find(c => c.id === dernier.clientId);
        const autres = clients.filter(c => c.id !== D.id);
        console.log('  defaillant : ' + D.nom + ' (passe au tour 3)');

        let epargne = await portefeuilleDe(D.id, 'epargne');
        if (!epargne) {
            epargne = await Portefeuille.create({
                nom: 'Epargne (scenario)', solde: 0, devise: 'XAF', typePortefeuille: 'epargne',
                estPrincipal: false, estActif: true, ClientPortefeuilleId: D.id
            });
            crees.push(epargne.id);
        }
        await epargne.update({ solde: 100000, montantReserve: 0 });
        const sim = await GarantieService.simuler(D.id, groupe.id, epargne.id, 40000);
        const garantie = (await GarantieService.affecter(D.id, groupe.id,
            { portefeuilleId: epargne.id, montant: 40000, hashTexte: sim.hashTexte })).garantie;
        verifier('caution 20 000 et garantie 40 000 en place', !!garantie);

        // --- 1. Delai de grace --------------------------------------------
        titre('1. Echeance, delai de grace');
        const cycle1 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        for (const c of autres) {
            if (c.id !== cycle1.beneficiaireId) await CycleService.cotiser(c.id, cycle1.id);
        }
        const cot1 = await TontineCotisation.findOne({ where: { cycleId: cycle1.id, clientId: D.id } });
        await cycle1.update({ dateFinPrevue: new Date(Date.now() - JOUR) });
        let rapport = await CycleService.traiterEcheances();
        verifier('constat : en retard, amende levee, cycle en defaut',
            rapport.cotisationsEnRetard === 1 && rapport.amendesLevees === 1 && rapport.enDefaut === 1,
            JSON.stringify(rapport));
        verifier('dans le delai de grace, rien n est preleve',
            rapport.enGrace === 1 && rapport.montantRecouvre === 0);
        const evalGrace = await EligibiliteService.evaluer(D.id, 'adhesion');
        verifier('le retard ferme deja l adhesion ailleurs', refusePour(evalGrace).includes('defauts'));

        // --- 2. Recouvrement dans l'ordre --------------------------------
        titre('2. Grace ecoulee : caution, puis garantie');
        await cycle1.update({ dateFinPrevue: new Date(Date.now() - 4 * JOUR) });
        rapport = await CycleService.traiterEcheances();
        verifier('20 000 de caution puis 30 000 de garantie',
            rapport.cautionsSaisies === 1 && rapport.garantiesMobilisees === 1
            && rapport.montantRecouvre === MONTANT && rapport.montantGaranties === 30000,
            JSON.stringify(rapport));
        const g1 = await TontineGarantie.findByPk(garantie.id);
        verifier('la garantie n a donne que le manque : 30 000 sur 40 000',
            arrondir(g1.montantUtilise) === 30000 && GarantieService.restant(g1) === 10000);
        await cot1.reload();
        verifier('cotisation payee par recouvrement',
            cot1.statut === 'payee' && arrondir(cot1.montantRecouvre) === MONTANT);
        verifier('le cycle sort du defaut', (await TontineCycle.findByPk(cycle1.id)).statut === 'actif');
        verifier('aucun incident : tout a ete couvert',
            (await TontineIncidentDefaut.count({ where: { cotisationId: cot1.id } })) === 0);
        await CycleService.verser({ clientId: awa.id }, cycle1.id);

        // --- 3. Sources epuisees ------------------------------------------
        titre('3. Cycle 2 : les sources ne suffisent plus');
        const cycle2 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 2 } });
        const lese = cycle2.beneficiaireId;
        for (const c of autres) {
            if (c.id !== lese) await CycleService.cotiser(c.id, cycle2.id);
        }
        const cot2 = await TontineCotisation.findOne({ where: { cycleId: cycle2.id, clientId: D.id } });
        await cycle2.update({ dateFinPrevue: new Date(Date.now() - 4 * JOUR) });
        rapport = await CycleService.traiterEcheances();
        verifier('les 10 000 restants de la garantie sont pris, la caution est vide',
            rapport.montantGaranties === 10000 && rapport.cautionsSaisies === 0, JSON.stringify(rapport));
        const incident = await TontineIncidentDefaut.findOne({ where: { cotisationId: cot2.id } });
        verifier('un incident est ouvert pour les 40 000 restants',
            incident && incident.statut === 'ouvert' && arrondir(incident.montantInitial) === 40000
            && rapport.incidentsOuverts === 1);
        verifier('l incident garde ce que chaque source a donne',
            incident && JSON.stringify(incident.sourcesEssayees.map(a => [a.source, a.montant]))
                === JSON.stringify([['caution', 0], ['garanties', 10000]]));
        await cot2.reload();
        verifier('reglee en partie, la cotisation reste en retard — pas « partielle »',
            cot2.statut === 'en_retard' && arrondir(cot2.montantPaye) === 10000, cot2.statut);
        const evalD = await EligibiliteService.evaluer(D.id, 'enchere', { groupe });
        verifier('le defaut reste visible du moteur d eligibilite', refusePour(evalD).includes('defauts'));

        // --- 4. Idempotence -----------------------------------------------
        titre('4. Un second passage');
        const avant = await Transaction.count({ where: { groupeTontineId: groupe.id } });
        rapport = await CycleService.traiterEcheances();
        verifier('rien de plus n est preleve ni ouvert',
            rapport.montantRecouvre === 0 && rapport.incidentsOuverts === 0
            && (await Transaction.count({ where: { groupeTontineId: groupe.id } })) === avant,
            JSON.stringify(rapport));
        verifier('toujours un seul incident', (await TontineIncidentDefaut.count({ where: { groupeId: groupe.id } })) === 1);

        // --- 5. Versement force -------------------------------------------
        titre('5. Versement force du cycle 2');
        const soldeLeseAvant = await solde(lese);
        const v2 = await CycleService.verser({ systeme: true }, cycle2.id, { force: true });
        verifier('le beneficiaire recoit ce qui a ete collecte, pas plus',
            v2.manque === 40000, 'manque ' + v2.manque);
        await cot2.reload();
        verifier('la dette survit au cycle : impayee', cot2.statut === 'impayee');

        // --- 6. Regularisation --------------------------------------------
        titre('6. Le defaillant regularise une partie');
        const soldeLeseMilieu = await solde(lese);
        const caisse = await Portefeuille.findByPk((await TontineGroupe.findByPk(groupe.id)).portefeuilleId);
        const caisseAvant = arrondir(caisse.solde);
        await doitEchouer('un autre membre ne regularise pas la dette de D', 404,
            () => DefautService.regulariser(awa.id === D.id ? autres[0].id : awa.id, cot2.id, 1000));
        const reg = await DefautService.regulariser(D.id, cot2.id, 15000);
        verifier('15 000 regles, 25 000 restent', reg.montant === 15000 && reg.resteDu === 25000 && reg.vers === 'beneficiaire');
        verifier('l argent va au beneficiaire lese du cycle 2',
            (await solde(lese)) === soldeLeseMilieu + 15000, `avant ${soldeLeseAvant}, apres ${await solde(lese)}`);
        await caisse.reload();
        verifier('la caisse du cycle en cours n en voit rien', arrondir(caisse.solde) === caisseAvant);
        await incident.reload();
        verifier('l incident suit : 25 000 restants', arrondir(incident.resteDu) === 25000 && incident.statut === 'ouvert');

        // --- 7. Retenue sur le pot ----------------------------------------
        titre('7. Cycle 3 : D recoit son pot, la dette est retenue');
        await groupe.reload();
        await groupe.update({ politiqueRecouvrement: { ordre: ['caution', 'garanties', 'retenue_pot'], delaiGraceJours: 3 } });
        const cycle3 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 3 } });
        verifier('D est bien le beneficiaire du cycle 3', cycle3.beneficiaireId === D.id);
        for (const c of autres) await CycleService.cotiser(c.id, cycle3.id);
        const soldeLeseAvantRetenue = await solde(lese);
        const v3 = await CycleService.verser({ clientId: awa.id }, cycle3.id);
        verifier('25 000 retenus sur son pot', v3.retenue === 25000, 'retenue ' + v3.retenue);
        verifier('D recoit le reste, frais deduits', v3.net === 2 * MONTANT - 25000 - v3.frais, `net ${v3.net}`);
        verifier('le lese du cycle 2 recoit les 25 000',
            (await solde(lese)) === soldeLeseAvantRetenue + 25000);
        await incident.reload();
        await cot2.reload();
        verifier('incident regle par retenue sur le pot',
            incident.statut === 'regle' && incident.modeReglement === 'retenue_pot' && arrondir(incident.resteDu) === 0);
        verifier('cotisation soldee : 10 000 garantie + 15 000 membre + 25 000 retenue',
            cot2.statut === 'payee' && arrondir(cot2.montantRecouvre) === 35000);
        verifier('la tontine est achevee', (await TontineGroupe.findByPk(groupe.id)).statut === 'termine');

        // --- 8. Traces ------------------------------------------------------
        titre('8. Traces');
        const actions = (await AuditLog.findAll({
            where: { createdAt: { [Op.gte]: debut }, action: { [Op.like]: 'TONTINE_%' } }, attributes: ['action']
        })).map(a => a.action);
        for (const a of ['TONTINE_CAUTION_SAISIE', 'TONTINE_GARANTIE_MOBILISEE', 'TONTINE_INCIDENT_OUVERT',
            'TONTINE_COTISATION_REGULARISEE', 'TONTINE_RETENUE_SUR_POT', 'TONTINE_INCIDENT_REGLE']) {
            verifier('journal : ' + a, actions.includes(a));
        }
        const types = (await Transaction.findAll({ where: { groupeTontineId: groupe.id }, attributes: ['type'] })).map(x => x.type);
        verifier('pieces comptables : saisie, mobilisation, regularisation, retenue',
            ['caution_saisie', 'garantie_mobilisation', 'regularisation', 'retenue_pot'].every(x => types.includes(x)));
        const mesInc = await DefautService.mesIncidents(D.id);
        verifier('D voit son incident, regle', mesInc.regles.some(i => i.id === incident.id) && mesInc.totalDu === 0);
        // Groupe termine : le president doit encore voir qui doit quoi.
        const vue = await DefautService.incidentsGroupe(awa.id, groupe.id);
        const ligne = vue.incidents.find(i => i.id === incident.id);
        verifier('le president voit l incident et le membre concerne, apres la fin',
            ligne && ligne.membre === D.nom && ligne.statut === 'regle');
        verifier('la politique est rendue lisible', vue.politique.description.includes('retenue sur le pot'));
        const simple = autres.find(c => c.id !== awa.id) || D;
        await doitEchouer('un simple membre ne consulte pas les incidents des autres', 403,
            () => DefautService.incidentsGroupe(simple.id, groupe.id));

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder && groupe) {
            titre('Nettoyage');
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
            console.log('  groupe, garanties, portefeuilles, ecritures supprimes ; soldes et reserves restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

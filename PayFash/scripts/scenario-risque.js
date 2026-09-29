/**
 * Scenario : le moteur de risque sur des donnees reelles (sections 10 a 14).
 *
 *   1. une echeance en retard, puis une caution saisie : les facteurs
 *      apparaissent, avec leurs chiffres
 *   2. regularisee : le retard reste dans l'historique, l'alerte en cours non
 *   3. plusieurs tontines : l'engagement mensuel les additionne toutes
 *   4. section 12 : 500 000 recus, 420 000 depenses en quelques jours,
 *      25 000 disponibles, une echeance de 50 000 dans 5 jours
 *   5. risque et couverture restent deux mesures distinctes
 *   6. chaque decision d'eligibilite conserve son evaluation, sans en changer
 *      l'issue
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-risque.js [--garder]
 */

const { Op } = require('sequelize');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction, EvaluationRisque,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const CautionService = require('../services/tontine/caution.service');
const DefautService = require('../services/tontine/defaut.service');
const EligibiliteService = require('../services/tontine/eligibilite.service');
const RisqueService = require('../services/risque.service');
const Fonds = require('../services/fonds.service');
const { arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local'];
const MONTANT = 50000;
const NOMS = ['Scenario Risque A', 'Scenario Risque B'];
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
const portefeuilleDe = (clientId, type) => Portefeuille.findOne({
    where: { ClientPortefeuilleId: clientId, estActif: true, typePortefeuille: type }
});
const codes = (r) => r.facteurs.map(f => f.code);
const facteur = (r, code) => r.facteurs.find(f => f.code === code);

(async () => {
    await db.authenticate();

    const clients = [];
    for (const email of EMAILS) {
        const c = await Client.findOne({ where: { email } });
        if (!c) { console.error(`Compte absent : ${email}\nLancez : node scripts/seed-tontine-demo.js`); process.exit(1); }
        clients.push(c);
    }
    const [awa] = clients;
    for (const nom of NOMS) await TontineGroupe.destroy({ where: { nom } });

    const initiaux = {};
    for (const c of clients) {
        for (const pf of await Portefeuille.findAll({ where: { ClientPortefeuilleId: c.id } })) {
            initiaux[pf.id] = { solde: pf.solde, reserve: Fonds.reserve(pf) };
        }
    }
    const derniereEvaluation = (await EvaluationRisque.max('id')) || 0;
    const ecrituresCreees = [];

    console.log('SCENARIO RISQUE — 3 membres, ' + MONTANT + ' XAF/periode');
    const groupes = [];
    let D;

    try {
        // --- 0. Mise en place ---------------------------------------------
        titre('0. Mise en place');
        for (const c of clients) {
            const pf = await portefeuilleDe(c.id, 'courant');
            await pf.update({ solde: arrondir(pf.solde) + 3 * MONTANT });
        }
        const A = await GroupeService.creerGroupe(awa.id, {
            nom: NOMS[0], montantParPeriode: MONTANT, frequence: 'mensuelle',
            membresMax: 3, modeOrdre: 'tirage', pourcentageCaution: 40
        });
        groupes.push(A);
        for (const c of clients.slice(1)) await GroupeService.rejoindreGroupe(c.id, A.codeInvitation);
        for (const c of clients) await CautionService.bloquer(c.id, A.id);
        await GroupeService.demarrerGroupe(awa.id, A.id);
        const dernier = await TontineMembre.findOne({ where: { groupeId: A.id, ordreBeneficiaire: 3 } });
        D = clients.find(c => c.id === dernier.clientId);
        const autres = clients.filter(c => c.id !== D.id);
        console.log('  membre suivi : ' + D.nom);

        const avant = await RisqueService.evaluer(D.id);
        verifier('avant tout retard : ni retard ni incident',
            !codes(avant).some(c => ['retards', 'echeance_en_retard', 'incidents'].includes(c)), avant.libelle);

        // --- 1. Retard puis saisie -----------------------------------------
        titre('1. Echeance manquee');
        const cycle1 = await TontineCycle.findOne({ where: { groupeId: A.id, numeroCycle: 1 } });
        for (const c of autres) if (c.id !== cycle1.beneficiaireId) await CycleService.cotiser(c.id, cycle1.id);
        const cot1 = await TontineCotisation.findOne({ where: { cycleId: cycle1.id, clientId: D.id } });
        await cycle1.update({ dateFinPrevue: new Date(Date.now() - 10 * JOUR) });
        await CycleService.traiterEcheances();

        let r = await RisqueService.evaluer(D.id);
        verifier('echeance en retard, signalee comme telle', !!facteur(r, 'echeance_en_retard'), facteur(r, 'echeance_en_retard')?.libelle);
        verifier('compte une seule fois : pas encore parmi les retards passes',
            !facteur(r, 'retards') && !facteur(r, 'duree_retard'));
        verifier('la caution saisie apparait : garantie a reconstituer',
            !!facteur(r, 'garanties_mobilisees') && r.donnees.mobilisations >= 1, facteur(r, 'garanties_mobilisees')?.libelle);
        verifier('le reste non couvert apparait comme incident', !!facteur(r, 'incidents'));
        verifier('et le risque monte', r.score > avant.score, `${avant.score} -> ${r.score}`);

        // --- 2. Regularisation ---------------------------------------------
        titre('2. Regularisation');
        await DefautService.regulariser(D.id, cot1.id);
        r = await RisqueService.evaluer(D.id);
        verifier('plus d echeance en retard ni d incident ouvert',
            !facteur(r, 'echeance_en_retard') && !facteur(r, 'incidents'));
        verifier('mais le retard reste dans l historique (paye apres l echeance)',
            r.donnees.historique.payeesEnRetard >= 1 && !!facteur(r, 'retards'));
        await CycleService.verser({ clientId: awa.id }, cycle1.id);

        // --- 3. Plusieurs tontines ------------------------------------------
        titre('3. Engagements multiples');
        const B = await GroupeService.creerGroupe(autres[0].id, {
            nom: NOMS[1], montantParPeriode: 75000, frequence: 'mensuelle', membresMax: 3, modeOrdre: 'tirage'
        });
        groupes.push(B);
        await GroupeService.rejoindreGroupe(D.id, B.codeInvitation);
        r = await RisqueService.evaluer(D.id);
        verifier('engagement mensuel : 50 000 + 75 000 = 125 000',
            r.donnees.engagementMensuel >= 125000 && r.donnees.tontinesEnCours >= 2, String(r.donnees.engagementMensuel));

        // --- 4. Section 12 -------------------------------------------------
        titre('4. Forte depense avant une echeance');
        const ecrire = async (type, montant, joursAvant) => {
            const e = await Transaction.create({
                montant, type, statut: 'SUCCESS', description: 'scenario risque', frais: 0,
                date: new Date(Date.now() - joursAvant * JOUR), ClientTransactionId: D.id
            });
            ecrituresCreees.push(e.id);
        };
        for (const j of [30, 55, 80]) await ecrire('depense', 50000, j);   // habitudes
        await ecrire('revenu', 500000, 6);
        await ecrire('depense', 420000, 3);
        for (const pf of await Portefeuille.findAll({ where: { ClientPortefeuilleId: D.id, estActif: true } })) {
            await pf.update({ montantReserve: 0 });
            await pf.update({ solde: pf.typePortefeuille === 'courant' ? 25000 : 0 });
        }
        const cycle2 = await TontineCycle.findOne({ where: { groupeId: A.id, numeroCycle: 2 } });
        await cycle2.update({ dateFinPrevue: new Date(Date.now() + 5 * JOUR) });

        r = await RisqueService.evaluer(D.id);
        verifier('capacite financiere reduite : 25 000 pour 50 000 sous 30 jours',
            !!facteur(r, 'capacite') && r.donnees.disponible === 25000 && r.donnees.echeances30j === 50000,
            facteur(r, 'capacite')?.libelle);
        verifier('risque de liquidite accru : forte sortie sur 14 jours',
            !!facteur(r, 'liquidite'), facteur(r, 'liquidite')?.libelle);
        verifier('engagements eleves au regard des entrees connues', !!facteur(r, 'engagements'),
            facteur(r, 'engagements')?.libelle);
        verifier('niveau : risque financier accru', r.niveau === 'ELEVE' && r.libelle === 'Risque financier accru',
            `score ${r.score}`);

        // --- 5. Distinct de la couverture ----------------------------------
        titre('5. Risque et couverture');
        verifier('la couverture est rapportee a part, avec son propre chiffre',
            r.donnees.couvertureMin !== null && typeof r.donnees.couvertureMin === 'number',
            `${r.donnees.couvertureMin} % dans ${r.donnees.couvertureGroupe}`);
        const vue = RisqueService.vueMembre(r);
        const texte = JSON.stringify(vue).toLowerCase();
        verifier('la vue du membre parle de sa situation, jamais de moralite',
            !/\bvol|fraud|dangereu|suspect/.test(texte) && vue.pointsAttention.length > 0);
        verifier('la vue du membre rappelle que le risque ne decide pas seul', vue.note.includes('ne decide pas'));

        // --- 6. Trace a cote des decisions ---------------------------------
        titre('6. Decisions');
        const nAvant = await EvaluationRisque.count({ where: { clientId: D.id } });
        let issue;
        try { await EligibiliteService.exiger(D.id, 'enchere', { groupe: A }); issue = 'ELIGIBLE'; }
        catch (e) { issue = 'NON_ELIGIBLE : ' + e.message; }
        const ev = await EvaluationRisque.findOne({ where: { clientId: D.id }, order: [['id', 'DESC']] });
        verifier('la decision d enchere conserve une evaluation',
            (await EvaluationRisque.count({ where: { clientId: D.id } })) === nAvant + 1
            && ev.contexte === 'enchere' && ev.groupeId === A.id, issue);
        verifier('avec facteurs, donnees, regles et version',
            ev.facteurs.length > 0 && ev.donnees.disponible === 25000 && ev.regles.base === 30 && ev.versionMoteur === RisqueService.version());
        const decision = await EligibiliteService.evaluer(D.id, 'enchere', { groupe: A });
        verifier('l issue ne depend pas du risque : aucun controle « risque »',
            !decision.controles.some(c => c.code.includes('risque')));

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            if (ecrituresCreees.length) await Transaction.destroy({ where: { id: ecrituresCreees } });
            await EvaluationRisque.destroy({ where: { id: { [Op.gt]: derniereEvaluation }, clientId: clients.map(c => c.id) } });
            for (const g0 of groupes) {
                const g = await TontineGroupe.findByPk(g0.id);
                if (!g) continue;
                const ids = [g.portefeuilleId, g.portefeuilleCautionId].filter(Boolean);
                await Transaction.destroy({ where: { groupeTontineId: g.id } });
                await g.destroy();
                if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            }
            for (const [id, etat] of Object.entries(initiaux)) {
                await Portefeuille.update({ montantReserve: 0 }, { where: { id } });
                await Portefeuille.update({ solde: etat.solde, montantReserve: etat.reserve }, { where: { id } });
            }
            console.log('  groupes, ecritures, evaluations supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

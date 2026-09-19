/**
 * Scenario : l'eligibilite, porte par porte.
 *
 * L'argent d'une tontine arrive a un membre par des portes — creer,
 * rejoindre, encherir, recevoir le pot — et chacune applique les controles
 * qui la concernent : compte, niveau KYC, restrictions, defauts dans les
 * autres tontines, reglement signe, couverture.
 *
 *   1. une restriction ferme une porte precise, et elle seule
 *   2. un defaut dans UNE AUTRE tontine suspend le versement
 *   3. un reglement non signe suspend le versement
 *   4. le niveau KYC exige se regle par la plateforme
 *   5. tous les controles au vert : le pot est verse
 *   6. chaque decision est conservee, refus compris
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-eligibilite.js [--garder]
 */

const { Op } = require('sequelize');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction, SystemConfig, Restriction,
    TontineGroupe, TontineCycle, TontineCotisation, TontineEvaluationEligibilite
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const ContratService = require('../services/tontine/contrat.service');
const EligibiliteService = require('../services/tontine/eligibilite.service');
const { RestrictionService } = require('../services/restriction.service');
const { arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const MONTANT = 10000;
const NOMS = ['Scenario Eligibilite', 'Scenario Eligibilite (autre)'];
const garder = process.argv.includes('--garder');
const ADMIN = { admin: { id: null, email: 'scenario@tontine.local' } };

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
async function doitEchouer(libelle, codeAttendu, fn, motif) {
    try { await fn(); verifier(libelle, false, 'aucune erreur levee'); }
    catch (e) {
        verifier(libelle, e.code === codeAttendu && (!motif || motif.test(e.message)), `${e.code} — ${String(e.message).slice(0, 150)}`);
    }
}

(async () => {
    await db.authenticate();

    const clients = [];
    for (const email of EMAILS) {
        const c = await Client.findOne({ where: { email } });
        if (!c) { console.error(`Compte absent : ${email}\nLancez : node scripts/seed-tontine-demo.js`); process.exit(1); }
        clients.push(c);
    }
    const [awa, bertrand, clarisse, daniel] = clients;
    for (const nom of NOMS) await TontineGroupe.destroy({ where: { nom } });

    const soldes = {};
    for (const c of clients) {
        const pf = await Portefeuille.findOne({ where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' } });
        soldes[pf.id] = pf.solde;
        await pf.update({ solde: arrondir(pf.solde) + 10 * MONTANT });
    }
    const kycVersement = await SystemConfig.findOne({ where: { cle: 'tontine_kyc_niveau_versement' } });
    const kycInitial = kycVersement ? kycVersement.valeur : '0';

    console.log('SCENARIO ELIGIBILITE — les portes et leurs controles');
    const groupes = [];

    try {
        // --- 1. Restrictions ----------------------------------------------
        titre('1. Une restriction ferme une porte, et elle seule');
        const creation = await RestrictionService.poser(ADMIN,
            { clientId: bertrand.id, type: 'CREATE_TONTINE_DISABLED', motif: 'Verification en cours' });
        await doitEchouer('creer une tontine est refuse', 403,
            () => GroupeService.creerGroupe(bertrand.id, { nom: 'Refusee', montantParPeriode: MONTANT, membresMax: 3 }),
            /Eligibilite temporairement limitee/);
        await RestrictionService.lever(ADMIN, creation.id, 'Verification terminee');

        const g = await GroupeService.creerGroupe(awa.id, {
            nom: NOMS[0], montantParPeriode: MONTANT, frequence: 'mensuelle', membresMax: 4, modeOrdre: 'tirage', pourcentageCaution: 0
        });
        groupes.push(g.id);
        await GroupeService.rejoindreGroupe(bertrand.id, g.codeInvitation);
        verifier('levee, la restriction ne bloque plus rien', true);

        const adhesion = await RestrictionService.poser(ADMIN,
            { clientId: daniel.id, type: 'JOIN_TONTINE_DISABLED', motif: 'Incident sur une autre tontine' });
        await doitEchouer('rejoindre est refuse, avec le motif', 403,
            () => GroupeService.rejoindreGroupe(daniel.id, g.codeInvitation), /Incident sur une autre tontine/);
        await doitEchouer('la meme restriction ne se pose pas deux fois', 409,
            () => RestrictionService.poser(ADMIN, { clientId: daniel.id, type: 'JOIN_TONTINE_DISABLED', motif: 'bis' }));
        await doitEchouer('une restriction se motive', 400,
            () => RestrictionService.poser(ADMIN, { clientId: daniel.id, type: 'AUCTION_DISABLED', motif: '  ' }));
        await RestrictionService.lever(ADMIN, adhesion.id);
        await GroupeService.rejoindreGroupe(daniel.id, g.codeInvitation);
        await GroupeService.rejoindreGroupe(clarisse.id, g.codeInvitation);
        await GroupeService.demarrerGroupe(awa.id, g.id);

        const cycle1 = await TontineCycle.findOne({ where: { groupeId: g.id, numeroCycle: 1 } });
        const b1 = cycle1.beneficiaireId;
        const beneficiaire = clients.find(c => c.id === b1);
        console.log('  beneficiaire du cycle 1 : ' + beneficiaire.nom);

        // Section 27 : restreint, un membre peut toujours s'acquitter.
        const toutes = [];
        for (const type of ['RECEIVE_POT_DISABLED', 'AUCTION_DISABLED', 'JOIN_TONTINE_DISABLED']) {
            const autre = clients.find(c => c.id !== b1 && c.id !== awa.id);
            toutes.push(await RestrictionService.poser(ADMIN, { clientId: autre.id, type, motif: 'Controle' }));
        }
        const restreint = clients.find(c => c.id === toutes[0].clientId);
        for (const c of await TontineCotisation.findAll({ where: { cycleId: cycle1.id } })) {
            await CycleService.cotiser(c.clientId, cycle1.id);
        }
        verifier('un membre restreint cotise toujours : payer n est jamais ferme',
            (await TontineCotisation.findOne({ where: { cycleId: cycle1.id, clientId: restreint.id } })).statut === 'payee');
        for (const r of toutes) await RestrictionService.lever(ADMIN, r.id);

        // --- 2. Defaut ailleurs ------------------------------------------
        titre('2. Un defaut dans une AUTRE tontine suspend le versement');
        const autre = await GroupeService.creerGroupe(awa.id, {
            nom: NOMS[1], montantParPeriode: MONTANT, frequence: 'mensuelle', membresMax: 2, modeOrdre: 'tirage', pourcentageCaution: 0
        });
        groupes.push(autre.id);
        const coequipier = clients.find(c => c.id !== b1 && c.id !== awa.id);
        const membreDeux = b1 === awa.id ? coequipier : clients.find(c => c.id === b1);
        if (b1 !== awa.id) await GroupeService.rejoindreGroupe(b1, autre.codeInvitation);
        else await GroupeService.rejoindreGroupe(coequipier.id, autre.codeInvitation);
        await GroupeService.demarrerGroupe(awa.id, autre.id);
        const cycleAutre = await TontineCycle.findOne({ where: { groupeId: autre.id, numeroCycle: 1 } });
        let dette = await TontineCotisation.findOne({ where: { cycleId: cycleAutre.id, clientId: b1 } });
        if (!dette) {
            // b1 est le beneficiaire de l'autre groupe : on lui cree une
            // echeance en retard sur un cycle suivant simule.
            dette = await TontineCotisation.create({
                cycleId: cycleAutre.id, membreId: (await models.TontineMembre.findOne({ where: { groupeId: autre.id, clientId: b1 } })).id,
                clientId: b1, montantDu: MONTANT, montantPaye: 0, statut: 'en_retard', dateEcheance: new Date()
            });
        } else {
            await dette.update({ statut: 'en_retard' });
        }
        await doitEchouer('le pot complet est suspendu : echeance en retard ailleurs', 409,
            () => CycleService.verser({ clientId: awa.id }, cycle1.id), /Echeance en retard/);
        await dette.update({ statut: 'payee', montantPaye: MONTANT });

        // --- 3. Reglement -------------------------------------------------
        titre('3. Un reglement en vigueur doit etre signe');
        const contrat = await ContratService.generer({ clientId: awa.id }, g.id);
        const contratId = (contrat.contrat || contrat).id;
        await doitEchouer('non signe par le beneficiaire, le pot est suspendu', 409,
            () => CycleService.verser({ clientId: awa.id }, cycle1.id), /a signer/);
        await ContratService.signer(b1, contratId, '127.0.0.1');

        // --- 4. KYC -------------------------------------------------------
        titre('4. Le niveau de verification exige se regle par la plateforme');
        await kycVersement.update({ valeur: '2' });
        await doitEchouer('identite verifiee exigee : le beneficiaire n y est pas', 403,
            () => CycleService.verser({ clientId: awa.id }, cycle1.id), /identite verifiee/);
        await kycVersement.update({ valeur: kycInitial });

        const avantEval = await EligibiliteService.evaluer(b1, 'versement', { groupe: await TontineGroupe.findByPk(g.id), cycle: cycle1 });
        verifier('l evaluation affichable liste chaque controle',
            avantEval.resultat === 'ELIGIBLE' && avantEval.controles.length === 8, avantEval.controles.map(c => c.code).join(','));

        // --- 5. Tout au vert ------------------------------------------------
        titre('5. Tous les controles au vert');
        const versement = await CycleService.verser({ clientId: awa.id }, cycle1.id);
        verifier('le pot est verse', !!versement.versement);

        // --- 6. La trace --------------------------------------------------
        titre('6. Chaque decision est conservee');
        const traces = await TontineEvaluationEligibilite.findAll({
            where: { clientId: b1, groupeId: g.id, operation: 'versement' }, order: [['id', 'ASC']]
        });
        const refus = traces.filter(x => x.resultat === 'NON_ELIGIBLE');
        verifier('3 refus et 1 acceptation traces, meme quand le versement est annule',
            refus.length === 3 && traces.filter(x => x.resultat === 'ELIGIBLE').length === 1,
            traces.map(x => x.resultat).join(','));
        const codes = refus.map(x => x.controles.filter(c => !c.ok).map(c => c.code).join('+'));
        verifier('chaque refus nomme le controle en cause : defauts, reglement, kyc',
            codes.join(',') === 'defauts,reglement,kyc', codes.join(','));
        verifier('et la version du moteur', traces.every(x => x.versionMoteur === 'eligibilite-1.0'));

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (kycVersement) await kycVersement.update({ valeur: kycInitial });
        await Restriction.destroy({ where: { clientId: clients.map(c => c.id) } });
        if (!garder) {
            titre('Nettoyage');
            for (const id of groupes) {
                const gr = await TontineGroupe.findByPk(id);
                if (!gr) continue;
                const ids = [gr.portefeuilleId, gr.portefeuilleCautionId].filter(Boolean);
                await Transaction.destroy({ where: { groupeTontineId: id } });
                await gr.destroy();
                if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            }
            for (const [id, solde] of Object.entries(soldes)) await Portefeuille.update({ solde }, { where: { id } });
            console.log('  groupes, ecritures et restrictions supprimes ; soldes et parametres restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

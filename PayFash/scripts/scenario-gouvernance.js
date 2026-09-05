// =====================================================================
//  Scenario de recette de la gouvernance — phase 4.
//
//    node scripts/scenario-gouvernance.js [--plateforme=2] [--garder]
//
//  Critere de sortie annonce : « un vote d'exclusion adopte retire
//  effectivement le membre et reordonne les tours restants sans trou dans
//  la rotation ».
//
//  Controle aussi le reglement interieur signe, le marche des tours avec
//  compensation, et l'enchere sur le pot avec redistribution de la decote.
// =====================================================================

const { Op } = require('sequelize');
const ENV = require('../config/index');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineVote, TontineEnchere
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const CautionService = require('../services/tontine/caution.service');
const RecouvrementService = require('../services/tontine/recouvrement.service');
const { VoteService } = require('../services/tontine/vote.service');
const EchangeService = require('../services/tontine/echange.service');
const EnchereService = require('../services/tontine/enchere.service');
const ContratService = require('../services/tontine/contrat.service');
const { nombre, arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const NOMS = ['Gouvernance Rotative', 'Gouvernance Enchere', 'Gouvernance Echange'];
const MONTANT = 20000;

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
async function tours(groupeId) {
    const ms = await TontineMembre.findAll({
        where: { groupeId }, include: [{ model: Client, as: 'client', attributes: ['nom'] }],
        order: [['ordreBeneficiaire', 'ASC']]
    });
    return ms.map(m => `${m.client.nom.split(' ')[0]}:${m.ordreBeneficiaire === null ? '-' : m.ordreBeneficiaire}${m.aBeneficie ? '*' : ''}${m.statut === 'exclu' ? '(exclu)' : ''}`).join('  ');
}

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

    for (const n of NOMS) await TontineGroupe.destroy({ where: { nom: n } });
    const initiaux = {};
    for (const c of clients) initiaux[c.id] = await soldeDe(c.id);
    const platInit = plateformeId ? await soldeDe(plateformeId) : 0;

    let groupe, groupeE, groupeS;
    try {
        // =============================================================
        titre('1. Reglement interieur signe');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOMS[0], type: 'rotative', montantParPeriode: MONTANT,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'anciennete', pourcentageCaution: 100
        });
        for (const c of [bertrand, clarisse, daniel]) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);

        await doitEchouer('un simple membre ne redige pas le reglement', 403,
            () => ContratService.generer(acteur(daniel.id), groupe.id));

        const { contrat } = await ContratService.generer(acteur(awa.id), groupe.id);
        verifier('reglement genere en version 1, hash SHA-256',
            contrat.version === 1 && /^[0-9a-f]{64}$/.test(contrat.hashContenu));
        verifier('le texte par defaut reprend les regles reelles du groupe',
            contrat.contenu.includes(String(MONTANT)) && contrat.contenu.includes('garant'));

        for (const c of clients) await ContratService.signer(c.id, contrat.id, '127.0.0.1');
        await doitEchouer('on ne signe pas deux fois', 409,
            () => ContratService.signer(awa.id, contrat.id));
        const etatReglement = await ContratService.courant(awa.id, groupe.id);
        verifier('reglement signe par tous : ' + etatReglement.avancement,
            etatReglement.contrat.statut === 'signe' && etatReglement.manquants.length === 0);

        // =============================================================
        titre('2. Un cycle se deroule, un membre est servi');
        for (const c of clients) await CautionService.bloquer(c.id, groupe.id);
        await GroupeService.demarrerGroupe(awa.id, groupe.id);
        console.log('  tours initiaux : ' + await tours(groupe.id));

        const cycle1 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        for (const c of await TontineCotisation.findAll({ where: { cycleId: cycle1.id } })) {
            await CycleService.cotiser(c.clientId, cycle1.id);
        }
        const v1 = await CycleService.verser(acteur(awa.id), cycle1.id);
        const servi = await Client.findByPk(cycle1.beneficiaireId);
        console.log('  ' + servi.nom + ' a mange le tour 1');
        console.log('  tours apres cycle 1 : ' + await tours(groupe.id));

        // =============================================================
        titre('3. Vote d\'exclusion');
        const cible = clarisse;   // tour 3 : son depart laisse un trou
        const vote = await VoteService.creer(bertrand.id, groupe.id, {
            sujet: 'exclure', cibleId: cible.id, mode: 'majorite',
            description: 'Manquements repetes'
        });
        verifier('scrutin ouvert par un simple membre', vote.resultat === 'en_attente');

        await doitEchouer('un scrutin identique ne peut pas etre ouvert deux fois', 409,
            () => VoteService.creer(daniel.id, groupe.id, { sujet: 'exclure', cibleId: cible.id }));
        await doitEchouer('on ne vote pas sur sa propre exclusion', 403,
            () => VoteService.repondre(cible.id, vote.id, 'contre'));

        await VoteService.repondre(awa.id, vote.id, 'pour');
        await doitEchouer('une seule voix par membre', 409,
            () => VoteService.repondre(awa.id, vote.id, 'contre'));
        const r2 = await VoteService.repondre(bertrand.id, vote.id, 'pour');
        const r3 = await VoteService.repondre(daniel.id, vote.id, 'contre');
        verifier('la cible est exclue du corps electoral (3 electeurs, pas 4)',
            r3.depouillementPossible === true);

        await doitEchouer('un simple membre ne depouille pas', 403,
            () => VoteService.depouiller(acteur(daniel.id), vote.id));

        const avantExclusion = await tours(groupe.id);
        const depouillement = await VoteService.depouiller(acteur(awa.id), vote.id);
        verifier('scrutin approuve 2 pour / 1 contre sur 3 electeurs',
            depouillement.resultat === 'approuve' && depouillement.pour === 2
            && depouillement.contre === 1 && depouillement.electeurs === 3);
        verifier('le vote a produit un EFFET, pas seulement un resultat',
            depouillement.effet.applique === true, depouillement.effet.detail);

        const membreExclu = await TontineMembre.findOne({ where: { groupeId: groupe.id, clientId: cible.id } });
        verifier('le membre est reellement exclu', membreExclu.statut === 'exclu');
        verifier('il est sorti de la file', membreExclu.ordreBeneficiaire === null);

        console.log('  avant : ' + avantExclusion);
        console.log('  apres : ' + await tours(groupe.id));

        const restants = await TontineMembre.findAll({
            where: { groupeId: groupe.id, statut: 'actif' }, order: [['ordreBeneficiaire', 'ASC']]
        });
        const suite = restants.map(m => m.ordreBeneficiaire);
        const contigus = suite.every((v, i) => v === i + 1);
        verifier('les tours restants sont contigus, sans trou : [' + suite.join(', ') + ']', contigus);
        verifier('le membre deja servi garde son rang',
            restants.find(m => m.aBeneficie).ordreBeneficiaire === 1);

        // =============================================================
        titre('4. La rotation continue apres l\'exclusion');
        const cycle2 = v1.cycleSuivant;
        const cotis2 = await TontineCotisation.findAll({ where: { cycleId: cycle2.id } });
        const orpheline = cotis2.find(c => c.clientId === cible.id);
        verifier('la cotisation de l exclu est marquee impayee',
            orpheline && (await TontineCotisation.findByPk(orpheline.id)).statut === 'impayee');

        for (const c of cotis2) {
            if (c.clientId === cible.id) continue;
            const f = await TontineCotisation.findByPk(c.id);
            if (f.statut !== 'payee') await CycleService.cotiser(c.clientId, cycle2.id);
        }
        await doitEchouer('versement refuse : la part de l exclu manque', 409,
            () => CycleService.verser(acteur(awa.id), cycle2.id));

        await RecouvrementService.parCaution(acteur(awa.id), orpheline.id);
        const v2 = await CycleService.verser(acteur(awa.id), cycle2.id);
        verifier('la caution de l exclu a complete le pot, le cycle se verse', !!v2.versement);

        const cycle3 = v2.cycleSuivant;
        const benef3 = await TontineMembre.findOne({
            where: { groupeId: groupe.id, clientId: cycle3.beneficiaireId }
        });
        verifier('le cycle 3 va bien au tour 3 renumerote (' + benef3.ordreBeneficiaire + ')',
            benef3.ordreBeneficiaire === 3 && benef3.statut === 'actif');
        verifier('le pot du cycle 3 tient compte des 3 membres restants',
            arrondir(cycle3.montantAttendu) === MONTANT * 2, arrondir(cycle3.montantAttendu) + ' FCFA');

        // =============================================================
        titre('5. Marche des tours');
        groupeS = await GroupeService.creerGroupe(awa.id, {
            nom: NOMS[2], type: 'rotative', montantParPeriode: 5000,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'anciennete'
        });
        for (const c of [bertrand, clarisse, daniel]) await GroupeService.rejoindreGroupe(c.id, groupeS.codeInvitation);
        await GroupeService.demarrerGroupe(awa.id, groupeS.id);
        console.log('  tours : ' + await tours(groupeS.id));

        // Awa est au tour 1 et beneficiaire du cycle en cours : intouchable.
        await doitEchouer('le tour du cycle en cours n est pas negociable', 409,
            () => EchangeService.proposer(bertrand.id, groupeS.id, awa.id, 1000));
        await doitEchouer('on n echange pas avec soi-meme', 400,
            () => EchangeService.proposer(clarisse.id, groupeS.id, clarisse.id, 0));

        // Clarisse (tour 3) achete le tour 4 de Daniel : elle recule, il avance.
        const avantC = await soldeDe(clarisse.id);
        const avantD = await soldeDe(daniel.id);
        const prop = await EchangeService.proposer(clarisse.id, groupeS.id, daniel.id, 2000);
        verifier('proposition enregistree : tour ' + prop.tourDemandeur + ' contre tour ' + prop.tourDestinataire,
            prop.tourDemandeur === 3 && prop.tourDestinataire === 4);

        await doitEchouer('seul le destinataire peut accepter', 403,
            () => EchangeService.accepter(bertrand.id, prop.id));
        await doitEchouer('demande en double refusee', 409,
            () => EchangeService.proposer(clarisse.id, groupeS.id, daniel.id, 3000));

        const swap = await EchangeService.accepter(daniel.id, prop.id);
        const mC = await TontineMembre.findOne({ where: { groupeId: groupeS.id, clientId: clarisse.id } });
        const mD = await TontineMembre.findOne({ where: { groupeId: groupeS.id, clientId: daniel.id } });
        verifier('les tours ont bien permute : Clarisse 3->' + mC.ordreBeneficiaire + ', Daniel 4->' + mD.ordreBeneficiaire,
            mC.ordreBeneficiaire === 4 && mD.ordreBeneficiaire === 3);
        verifier('la compensation a circule : Clarisse -2000, Daniel +2000',
            arrondir(avantC - await soldeDe(clarisse.id)) === 2000
            && arrondir(await soldeDe(daniel.id) - avantD) === 2000);
        verifier('l ecriture de compensation est tracee', !!swap.transaction && swap.transaction.type === 'echange_tour');

        // Une proposition devient caduque si l'ordre bouge entre-temps.
        // 1. Bertrand (tour 2) propose a Clarisse, qui est alors au tour 4.
        const perimee = await EchangeService.proposer(bertrand.id, groupeS.id, clarisse.id, 0);
        verifier('proposition figee sur les tours 2 et 4',
            perimee.tourDemandeur === 2 && perimee.tourDestinataire === 4);

        // 2. Clarisse et Daniel re-echangent : Clarisse repasse au tour 3.
        const contre = await EchangeService.proposer(daniel.id, groupeS.id, clarisse.id, 0);
        await EchangeService.accepter(clarisse.id, contre.id);
        verifier('Clarisse est repassee au tour 3',
            (await TontineMembre.findOne({ where: { groupeId: groupeS.id, clientId: clarisse.id } })).ordreBeneficiaire === 3);

        // 3. La premiere proposition ne correspond plus a la realite.
        await doitEchouer('la proposition perimee est refusee, pas appliquee de travers', 409,
            () => EchangeService.accepter(clarisse.id, perimee.id));
        const mB = await TontineMembre.findOne({ where: { groupeId: groupeS.id, clientId: bertrand.id } });
        verifier('Bertrand conserve son tour 2 : aucune permutation fausse', mB.ordreBeneficiaire === 2);

        // =============================================================
        titre('6. Enchere sur le pot');
        groupeE = await GroupeService.creerGroupe(awa.id, {
            nom: NOMS[1], type: 'rotative', montantParPeriode: 10000,
            frequence: 'mensuelle', membresMax: 3, modeOrdre: 'enchere'
        });
        for (const c of [bertrand, daniel]) await GroupeService.rejoindreGroupe(c.id, groupeE.codeInvitation);
        await GroupeService.demarrerGroupe(awa.id, groupeE.id);

        const cE = await TontineCycle.findOne({ where: { groupeId: groupeE.id, numeroCycle: 1 } });
        const benefInitial = cE.beneficiaireId;
        verifier('pot de depart = ' + arrondir(cE.montantAttendu), arrondir(cE.montantAttendu) === 20000);

        await doitEchouer('un simple membre n ouvre pas l enchere', 403,
            () => EnchereService.ouvrir(acteur(daniel.id), cE.id));
        await EnchereService.ouvrir(acteur(awa.id), cE.id);

        const encherisseurs = [bertrand.id, daniel.id].filter(id => id !== benefInitial);
        await EnchereService.offrir(encherisseurs[0], cE.id, 1500);
        const gagnantAttendu = encherisseurs[1] || benefInitial;
        await EnchereService.offrir(gagnantAttendu, cE.id, 3000);
        await doitEchouer('la decote ne peut pas depasser le pot', 400,
            () => EnchereService.offrir(encherisseurs[0], cE.id, 25000));

        const offres = await EnchereService.offres(awa.id, cE.id);
        verifier('la meilleure offre est la plus forte decote (3000)',
            arrondir(offres.meilleure.montantDecote) === 3000);

        const adj = await EnchereService.adjuger(acteur(awa.id), cE.id);
        verifier('le pot est adjuge au plus offrant', adj.gagnant === gagnantAttendu);
        verifier('les cotisations sont regenerees pour le nouveau beneficiaire',
            adj.cotisationsRegenerees === 2);

        const cEmaj = await TontineCycle.findByPk(cE.id);
        verifier('le beneficiaire du cycle a change', cEmaj.beneficiaireId === gagnantAttendu);

        const cotisE = await TontineCotisation.findAll({ where: { cycleId: cE.id } });
        verifier('le gagnant ne cotise plus pour son propre tour',
            !cotisE.some(c => c.clientId === gagnantAttendu));

        const soldesAvant = {};
        for (const c of cotisE) soldesAvant[c.clientId] = await soldeDe(c.clientId);
        const soldeGagnantAvant = await soldeDe(gagnantAttendu);
        for (const c of cotisE) await CycleService.cotiser(c.clientId, cE.id);

        const vE = await CycleService.verser(acteur(awa.id), cE.id);
        verifier('decote retenue : ' + vE.decote + ', part par cotisant : ' + vE.partDecote,
            vE.decote === 3000 && vE.partDecote === 1500);

        const gagne = arrondir(await soldeDe(gagnantAttendu) - soldeGagnantAvant);
        verifier('le gagnant recoit le pot moins sa decote et les frais : ' + gagne,
            gagne === arrondir(20000 - 3000 - vE.frais));

        for (const c of cotisE) {
            const delta = arrondir(await soldeDe(c.clientId) - soldesAvant[c.clientId]);
            verifier('le cotisant ' + c.clientId + ' recoit sa part de decote',
                delta === arrondir(1500 - 10000), 'delta = ' + delta + ' (part 1500 - cotisation 10000)');
        }
        const gE = await TontineGroupe.findByPk(groupeE.id);
        verifier('caisse d enchere revenue a zero', await soldePf(gE.portefeuilleId) === 0);

        // =============================================================
        titre('7. Conservation de la monnaie');
        let deltaMembres = 0;
        for (const c of clients) {
            const fin = await soldeDe(c.id);
            const d = arrondir(fin - initiaux[c.id]);
            deltaMembres += d;
            console.log('  ' + c.nom.padEnd(18) + initiaux[c.id] + ' -> ' + fin + '   (' + (d >= 0 ? '+' : '') + d + ')');
        }
        const deltaPlat = plateformeId ? arrondir(await soldeDe(plateformeId) - platInit) : 0;
        // Tout ce que les trois groupes retiennent encore : caisses,
        // sequestres de caution, caisses d'epargne.
        let bloque = 0;
        for (const nom of NOMS) {
            const g = await TontineGroupe.findOne({ where: { nom } });
            if (!g) continue;
            bloque += await soldePf(g.portefeuilleId)
                + await soldePf(g.portefeuilleCautionId)
                + await soldePf(g.portefeuilleEpargneId);
        }
        bloque = arrondir(bloque);
        console.log('  ' + 'plateforme'.padEnd(18) + '+' + deltaPlat);
        console.log('  ' + 'immobilise'.padEnd(18) + bloque + ' (cautions + caisses)');
        verifier('rien ne se perd, rien ne se cree',
            arrondir(deltaMembres + deltaPlat + bloque) === 0,
            'somme = ' + arrondir(deltaMembres + deltaPlat + bloque));

        termine = true;

    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            for (const n of NOMS) {
                const g = await TontineGroupe.findOne({ where: { nom: n } });
                if (!g) continue;
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
            console.log('  groupes, portefeuilles, ecritures supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

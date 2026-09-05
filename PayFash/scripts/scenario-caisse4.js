// =====================================================================
//  Scenario de recette de la caisse 4 — phase 3.
//
//    node scripts/scenario-caisse4.js [--plateforme=2] [--garder]
//
//  Critere de sortie annonce : « un membre defaillant voit sa caution
//  saisie, le pot est complete, le cycle se verse normalement et
//  l'incident est trace ».
//
//  Controle aussi la cascade complete — amende, caution, garant,
//  exclusion — et les permissions du bureau.
// =====================================================================

const { Op } = require('sequelize');
const ENV = require('../config/index');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineCaution, TontineAmende
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const CautionService = require('../services/tontine/caution.service');
const { AmendeService } = require('../services/tontine/amende.service');
const RecouvrementService = require('../services/tontine/recouvrement.service');
const { nombre, arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const MONTANT = 20000;
const NOM_GROUPE = 'Scenario Caisse 4';

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

async function soldeDe(clientId) {
    const pf = await Portefeuille.findOne({
        where: { ClientPortefeuilleId: clientId, estActif: true, typePortefeuille: 'courant' }
    });
    return pf ? arrondir(pf.solde) : 0;
}
async function soldePortefeuille(id) {
    if (!id) return 0;
    const pf = await Portefeuille.findByPk(id);
    return pf ? arrondir(pf.solde) : 0;
}
async function doitEchouer(libelle, codeAttendu, fn) {
    try { await fn(); verifier(libelle, false, 'aucune erreur levee'); }
    catch (e) { verifier(libelle, e.code === codeAttendu, `${e.code} — ${e.message}`); }
}
const president = (id) => ({ clientId: id });

(async () => {
    await db.authenticate();

    const clients = [];
    for (const email of EMAILS) {
        const c = await Client.findOne({ where: { email } });
        if (!c) { console.error(`Compte absent : ${email}\nLancez : node scripts/seed-tontine-demo.js`); process.exit(1); }
        clients.push(c);
    }
    const [awa, bertrand, clarisse, daniel] = clients;
    const plateformeId = ENV.TONTINE_CLIENT_PLATEFORME_ID;

    await TontineGroupe.destroy({ where: { nom: NOM_GROUPE } });

    const initiaux = {};
    for (const c of clients) initiaux[c.id] = await soldeDe(c.id);
    const plateformeInitial = plateformeId ? await soldeDe(plateformeId) : 0;

    console.log('SCENARIO CAISSE 4 — 4 membres, ' + MONTANT + ' XAF/periode, caution 100 %');
    let groupe;

    try {
        // --- 1. Caution ---------------------------------------------
        titre('1. Blocage des cautions');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, type: 'rotative', montantParPeriode: MONTANT,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'anciennete',
            pourcentageCaution: 100, bareme: { retard: 1500, absence: 2000, indiscipline: 5000, autre: 1000 }
        });
        for (const c of [bertrand, clarisse, daniel]) {
            await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        }

        const attendue = CautionService.montantAttendu(await TontineGroupe.findByPk(groupe.id));
        verifier('caution attendue = ' + attendue + ' (100 % de la cotisation)', attendue === MONTANT);

        for (const c of clients) {
            const avant = await soldeDe(c.id);
            const r = await CautionService.bloquer(c.id, groupe.id);
            const apres = await soldeDe(c.id);
            if (c.id === awa.id) {
                verifier('le blocage debite reellement le portefeuille',
                    arrondir(avant - apres) === attendue, avant + ' -> ' + apres);
            }
            if (c.id === daniel.id) {
                verifier('la caution est tracee comme bloquee', r.caution.statut === 'bloquee');
            }
        }
        const g1 = await TontineGroupe.findByPk(groupe.id);
        verifier('sequestre distinct de la caisse, alimente a ' + (attendue * 4),
            g1.portefeuilleCautionId !== g1.portefeuilleId
            && await soldePortefeuille(g1.portefeuilleCautionId) === attendue * 4);
        verifier('la caisse du groupe est restee a zero',
            await soldePortefeuille(g1.portefeuilleId) === 0);

        // --- 2. Permissions ------------------------------------------
        titre('2. Le bureau n\'est pas decoratif');
        await doitEchouer('un simple membre ne peut pas infliger d amende', 403,
            () => AmendeService.infliger(president(daniel.id), groupe.id,
                { clientId: clarisse.id, motif: 'absence' }));

        const censeur = await TontineMembre.findOne({ where: { groupeId: groupe.id, clientId: clarisse.id } });
        await censeur.update({ role: 'censeur' });
        const amendeAbsence = await AmendeService.infliger(president(clarisse.id), groupe.id,
            { clientId: daniel.id, motif: 'absence', commentaire: 'Absent a la reunion de lancement' });
        verifier('le censeur inflige au bareme du groupe : ' + amendeAbsence.montant,
            arrondir(amendeAbsence.montant) === 2000);
        verifier('destination "pot_cycle" pour un groupe rotatif',
            amendeAbsence.destination === 'pot_cycle');

        await doitEchouer('un simple membre ne peut pas annuler une amende', 403,
            () => AmendeService.annuler(president(bertrand.id), amendeAbsence.id));
        await AmendeService.annuler(president(awa.id), amendeAbsence.id, 'Justificatif fourni');
        verifier('le president peut annuler', (await TontineAmende.findByPk(amendeAbsence.id)).statut === 'annulee');

        // --- 3. Defaillance -------------------------------------------
        titre('3. Un membre ne paie pas');
        await GroupeService.demarrerGroupe(awa.id, groupe.id);
        const cycle1 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        const beneficiaire1 = await Client.findByPk(cycle1.beneficiaireId);
        console.log('  beneficiaire du cycle 1 : ' + beneficiaire1.nom);

        const cotisations1 = await TontineCotisation.findAll({ where: { cycleId: cycle1.id } });
        const defaillant = cotisations1[0];
        const nomDefaillant = (await Client.findByPk(defaillant.clientId)).nom;
        console.log('  defaillant designe        : ' + nomDefaillant);

        for (const c of cotisations1) {
            if (c.id !== defaillant.id) await CycleService.cotiser(c.clientId, cycle1.id);
        }

        await cycle1.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        const rapport = await CycleService.traiterEcheances();
        verifier('cron : cycle en defaut, 1 amende de retard levee',
            rapport.enDefaut === 1 && rapport.amendesLevees === 1);

        const amendeRetard = await TontineAmende.findOne({
            where: { cycleId: cycle1.id, clientId: defaillant.clientId, motif: 'retard' }
        });
        verifier('amende au bareme du groupe (1500) et non au defaut (1000)',
            arrondir(amendeRetard.montant) === 1500);
        verifier('amende levee par le systeme, pas par le censeur', amendeRetard.infligeePar === null);

        await doitEchouer('versement refuse : le pot est incomplet', 409,
            () => CycleService.verser(president(awa.id), cycle1.id));

        // --- 4. Cascade : la caution ---------------------------------
        titre('4. Saisie de la caution');
        const etat = await RecouvrementService.etat(awa.id, defaillant.id);
        verifier('la cascade voit l amende levee et la caution disponible',
            etat.crans.amendeLevee && etat.crans.cautionDisponible === MONTANT);
        verifier('la caution couvre toute la cotisation', etat.crans.cautionCouvreTout === true);

        await doitEchouer('un simple membre ne peut pas saisir une caution', 403,
            () => RecouvrementService.parCaution(president(bertrand.id), defaillant.id));

        const soldeDefaillantAvant = await soldeDe(defaillant.clientId);
        const saisie = await RecouvrementService.parCaution(president(awa.id), defaillant.id);
        verifier('caution saisie : ' + saisie.montantSaisi + ', cotisation soldee',
            saisie.cotisationSoldee && saisie.montantSaisi === MONTANT);
        verifier('le portefeuille du defaillant n est pas redebite',
            await soldeDe(defaillant.clientId) === soldeDefaillantAvant,
            'l argent etait deja au sequestre');

        const cautionDef = await TontineCaution.findOne({
            where: { groupeId: groupe.id, clientId: defaillant.clientId }
        });
        verifier('caution marquee totalement utilisee', cautionDef.statut === 'totalement_utilisee');

        // --- 5. Le cycle se verse normalement ------------------------
        titre('5. Le pot est complet, le cycle se verse');
        const avantBenef = await soldeDe(cycle1.beneficiaireId);
        const versement = await CycleService.verser(president(awa.id), cycle1.id);
        verifier('versement effectue : ' + versement.net + ' (frais ' + versement.frais + ')',
            arrondir(await soldeDe(cycle1.beneficiaireId) - avantBenef) === arrondir(versement.net));
        verifier('caisse revenue a zero', await soldePortefeuille(g1.portefeuilleId) === 0);
        verifier('cycle 2 ouvert', versement.cycleSuivant && versement.cycleSuivant.numeroCycle === 2);

        titre('6. L incident est trace');
        const ecritures = await Transaction.findAll({
            where: { groupeTontineId: groupe.id }, order: [['id', 'ASC']]
        });
        const parType = ecritures.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});
        console.log('  ecritures : ' + Object.entries(parType).map(([k, v]) => k + ' x' + v).join(', '));
        verifier('la saisie a laisse une ecriture dediee', parType['caution_saisie'] === 1);
        verifier('les 4 blocages de caution sont traces', parType['caution_blocage'] === 4);
        verifier('l amende de retard reste due et visible',
            (await TontineAmende.findByPk(amendeRetard.id)).statut === 'due');

        // --- 7. Cascade : le garant ----------------------------------
        titre('7. Appel au garant');
        const cycle2 = versement.cycleSuivant;
        const cot2 = await TontineCotisation.findAll({ where: { cycleId: cycle2.id } });
        const aCouvrir = cot2.find(c => c.clientId !== defaillant.clientId);
        const garantChoisi = cot2.find(c => c.clientId !== aCouvrir.clientId);

        await doitEchouer('appel au garant refuse sans garant designe', 409,
            () => RecouvrementService.parGarant(president(awa.id), aCouvrir.id));

        await doitEchouer('on ne peut pas se porter garant de soi-meme', 400,
            () => RecouvrementService.designerGarant(aCouvrir.clientId, groupe.id, aCouvrir.clientId));
        await RecouvrementService.designerGarant(aCouvrir.clientId, groupe.id, garantChoisi.clientId);

        const avantGarant = await soldeDe(garantChoisi.clientId);
        const appel = await RecouvrementService.parGarant(president(awa.id), aCouvrir.id);
        verifier('le garant a paye ' + appel.montantCouvert + ' a la place du defaillant',
            arrondir(avantGarant - await soldeDe(garantChoisi.clientId)) === appel.montantCouvert);
        verifier('la cotisation couverte est soldee',
            (await TontineCotisation.findByPk(aCouvrir.id)).statut === 'payee');

        // --- 8. Liberation de caution --------------------------------
        titre('8. Restitution de la caution');
        // On vise un membre qui a encore une cotisation ouverte sur le cycle 2
        // et dont la caution est intacte — pas le defaillant, dont la caution
        // a deja ete consommee.
        const encoreDue = await TontineCotisation.findOne({
            where: {
                cycleId: cycle2.id,
                statut: { [Op.ne]: 'payee' },
                clientId: { [Op.ne]: defaillant.clientId }
            }
        });
        const cautionPropre = await TontineCaution.findOne({
            where: { groupeId: groupe.id, clientId: encoreDue.clientId }
        });
        console.log('  membre vise : ' + (await Client.findByPk(encoreDue.clientId)).nom);
        await doitEchouer('caution non liberable tant qu il reste une dette', 409,
            () => CautionService.liberer(president(awa.id), cautionPropre.id));

        // On solde tout le cycle 2 pour degager le beneficiaire du cycle 1
        for (const c of cot2) {
            const f = await TontineCotisation.findByPk(c.id);
            if (f.statut !== 'payee') {
                const { amendes } = await AmendeService.mesAmendes(f.clientId, groupe.id);
                for (const a of amendes.filter(x => x.statut === 'due')) await AmendeService.payer(f.clientId, a.id);
                await CycleService.cotiser(f.clientId, cycle2.id);
            }
        }
        const avantRestit = await soldeDe(cautionPropre.clientId);
        const liberation = await CautionService.liberer(president(awa.id), cautionPropre.id);
        verifier('caution restituee : ' + liberation.montantRestitue + ' FCFA rendus',
            arrondir(await soldeDe(cautionPropre.clientId) - avantRestit) === liberation.montantRestitue
            && liberation.montantRestitue === MONTANT);
        verifier('c est bien une vraie ecriture, pas un simple changement de statut',
            !!liberation.transaction && liberation.transaction.type === 'caution_liberation');

        // --- 9. Exclusion --------------------------------------------
        titre('9. Exclusion');
        await doitEchouer('un simple membre ne peut pas exclure', 403,
            () => RecouvrementService.exclure(president(bertrand.id), groupe.id, defaillant.clientId));
        await doitEchouer('le createur du groupe ne peut pas etre exclu', 409,
            () => RecouvrementService.exclure(president(awa.id), groupe.id, awa.id));

        const exclusion = await RecouvrementService.exclure(
            president(awa.id), groupe.id, defaillant.clientId, 'Defaut de paiement repete');
        verifier('membre exclu et sorti de la rotation',
            exclusion.membre.statut === 'exclu' && exclusion.membre.ordreBeneficiaire === null);
        verifier('le groupe ne compte plus que 3 actifs', exclusion.membresRestants === 3);
        await doitEchouer('un exclu ne peut plus bloquer de caution', 403,
            () => CautionService.bloquer(defaillant.clientId, groupe.id));

        // --- 10. Conservation ----------------------------------------
        titre('10. Conservation de la monnaie');
        const gFin = await TontineGroupe.findByPk(groupe.id);
        let deltaMembres = 0;
        for (const c of clients) {
            const fin = await soldeDe(c.id);
            const d = arrondir(fin - initiaux[c.id]);
            deltaMembres += d;
            console.log('  ' + c.nom.padEnd(18) + initiaux[c.id] + ' -> ' + fin + '   (' + (d >= 0 ? '+' : '') + d + ')');
        }
        const deltaPlateforme = plateformeId ? arrondir(await soldeDe(plateformeId) - plateformeInitial) : 0;
        const sequestre = await soldePortefeuille(gFin.portefeuilleCautionId);
        const caisse = await soldePortefeuille(gFin.portefeuilleId);
        console.log('  ' + 'plateforme'.padEnd(18) + '+' + deltaPlateforme);
        console.log('  ' + 'sequestre caution'.padEnd(18) + sequestre);
        console.log('  ' + 'caisse du groupe'.padEnd(18) + caisse);

        verifier('rien ne se perd, rien ne se cree',
            arrondir(deltaMembres + deltaPlateforme + sequestre + caisse) === 0,
            'somme = ' + arrondir(deltaMembres + deltaPlateforme + sequestre + caisse));

        termine = true;

    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder && groupe) {
            titre('Nettoyage');
            const g = await TontineGroupe.findByPk(groupe.id);
            const ids = g ? [g.portefeuilleId, g.portefeuilleCautionId, g.portefeuilleEpargneId].filter(Boolean) : [];
            await Transaction.destroy({ where: { groupeTontineId: groupe.id } });
            if (g) await g.destroy();
            if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            for (const c of clients) {
                await Portefeuille.update({ solde: initiaux[c.id] },
                    { where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' } });
            }
            if (plateformeId) {
                await Portefeuille.update({ solde: plateformeInitial },
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

/**
 * Scenario : contester une operation (section 28).
 *
 *   1. un impaye reel : caution saisie, amende, echeance non couverte
 *   2. le membre conteste l'incident, l'amende, la caution, un refus
 *      d'eligibilite : chaque litige porte l'instantane de ses preuves
 *   3. cloisonnement : on ne conteste que ce qui vous concerne
 *   4. un seul litige ouvert par operation
 *   5. integrite : un instantane retouche se voit
 *   6. l'administration tranche, avec une reponse ; le membre est prevenu
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-litiges.js [--garder]
 */

const { Op } = require('sequelize');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction, Litige, Notification, EvaluationRisque,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineAmende, TontineCaution,
    TontineIncidentDefaut, TontineEvaluationEligibilite
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const CautionService = require('../services/tontine/caution.service');
const EligibiliteService = require('../services/tontine/eligibilite.service');
const { LitigeService } = require('../services/litige.service');
const Fonds = require('../services/fonds.service');
const { arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local'];
const MONTANT = 30000;
const NOM_GROUPE = 'Scenario Litiges';
const ADMIN = { id: null, email: 'scenario@tontine.local' };
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
        for (const pf of await Portefeuille.findAll({ where: { ClientPortefeuilleId: c.id } })) {
            initiaux[pf.id] = { solde: pf.solde, reserve: Fonds.reserve(pf) };
        }
    }
    const maxLitige = (await Litige.max('id')) || 0;
    const maxNotif = (await Notification.max('id')) || 0;
    const maxEval = (await EvaluationRisque.max('id')) || 0;
    const maxDecision = (await TontineEvaluationEligibilite.max('id')) || 0;

    console.log('SCENARIO LITIGES — 3 membres, ' + MONTANT + ' XAF/periode, caution 50 %');
    let groupe;
    try {
        // --- 1. Un impaye reel ---------------------------------------------
        titre('1. Un impaye');
        for (const c of clients) {
            const pf = await Portefeuille.findOne({ where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant', estActif: true } });
            await pf.update({ solde: arrondir(pf.solde) + 3 * MONTANT });
        }
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, montantParPeriode: MONTANT, frequence: 'mensuelle', membresMax: 3,
            modeOrdre: 'tirage', pourcentageCaution: 50
        });
        for (const c of clients.slice(1)) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        for (const c of clients) await CautionService.bloquer(c.id, groupe.id);
        await GroupeService.demarrerGroupe(awa.id, groupe.id);
        const dernier = await TontineMembre.findOne({ where: { groupeId: groupe.id, ordreBeneficiaire: 3 } });
        const D = clients.find(c => c.id === dernier.clientId);
        const autre = clients.find(c => c.id !== D.id);
        const cycle1 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        for (const c of clients) if (c.id !== D.id && c.id !== cycle1.beneficiaireId) await CycleService.cotiser(c.id, cycle1.id);
        await cycle1.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        await CycleService.traiterEcheances();

        const incident = await TontineIncidentDefaut.findOne({ where: { groupeId: groupe.id, clientId: D.id } });
        const amende = await TontineAmende.findOne({ where: { groupeId: groupe.id, clientId: D.id } });
        const caution = await TontineCaution.findOne({ where: { groupeId: groupe.id, clientId: D.id } });
        verifier('caution saisie, amende levee, 15 000 non couverts',
            incident && amende && caution && arrondir(incident.resteDu) === 15000 && arrondir(caution.montantUtilise) === 15000);

        // --- 2. Contester --------------------------------------------------
        titre('2. Le membre conteste');
        const lInc = await LitigeService.ouvrir(D.id, {
            objetType: 'incident', objetId: incident.id, description: "J'avais paye en especes au president."
        });
        const p = lInc.preuves;
        verifier('rattache a l incident et a la tontine', lInc.objetType === 'incident' && lInc.groupeId === groupe.id);
        verifier('instantane : incident, cotisation, ecritures, audit',
            p.incident && p.incident.id === incident.id && p.cotisation && p.ecritures.some(e => e.type === 'caution_saisie')
            && p.audit.some(a => a.action === 'TONTINE_INCIDENT_OUVERT'),
            `${p.ecritures.length} ecriture(s), ${p.audit.length} trace(s)`);
        verifier('empreinte SHA-256, et l instantane la respecte',
            /^[0-9a-f]{64}$/.test(lInc.empreintePreuves) && LitigeService.verifierPreuves(await Litige.findByPk(lInc.id)) === true);

        const lAm = await LitigeService.ouvrir(D.id, { objetType: 'amende', objetId: amende.id, description: 'Retard du a la banque.' });
        verifier('amende contestee, avec son montant', lAm.preuves.amende.id === amende.id);
        const lCau = await LitigeService.ouvrir(D.id, { objetType: 'caution', objetId: caution.id, description: 'Saisie injustifiee.' });
        verifier('caution contestee, avec la piece de saisie', lCau.preuves.ecritures.some(e => e.type === 'caution_saisie'));

        let refus = null;
        try { await EligibiliteService.exiger(D.id, 'adhesion'); } catch (e) { refus = e; }
        const decision = await TontineEvaluationEligibilite.findOne({ where: { clientId: D.id, id: { [Op.gt]: maxDecision } }, order: [['id', 'DESC']] });
        verifier('le refus d adhesion est conserve', refus && decision && decision.resultat === 'NON_ELIGIBLE');
        const lEl = await LitigeService.ouvrir(D.id, { objetType: 'eligibilite', objetId: decision.id, description: 'Je conteste ce refus.' });
        verifier('refus conteste, avec la decision et son evaluation de risque',
            lEl.preuves.decision.id === decision.id && lEl.preuves.risque && lEl.preuves.risque.contexte === 'adhesion');

        const libre = await LitigeService.ouvrir(D.id, { description: 'Question generale sur le reglement.' });
        verifier('un litige sans objet reste possible, sans instantane', !libre.objetType && !libre.empreintePreuves);

        // --- 3. Cloisonnement ----------------------------------------------
        titre('3. Cloisonnement');
        await doitEchouer("un autre membre ne conteste pas l'incident de D", 404,
            () => LitigeService.ouvrir(autre.id, { objetType: 'incident', objetId: incident.id, description: 'x' }));
        await doitEchouer('type inconnu', 400,
            () => LitigeService.ouvrir(D.id, { objetType: 'portefeuille_du_voisin', objetId: 1, description: 'x' }));
        await doitEchouer('sans description', 400,
            () => LitigeService.ouvrir(D.id, { objetType: 'amende', objetId: amende.id, description: '  ' }));

        // --- 4. Un seul a la fois ------------------------------------------
        titre('4. Un seul litige ouvert par operation');
        await doitEchouer('deuxieme litige sur le meme incident', 409,
            () => LitigeService.ouvrir(D.id, { objetType: 'incident', objetId: incident.id, description: 'bis' }));

        // --- 5. Integrite --------------------------------------------------
        titre('5. Integrite des preuves');
        const brut = await Litige.findByPk(lAm.id);
        const retouche = { ...brut.preuves, amende: { ...brut.preuves.amende, montant: '1.00' } };
        await Litige.update({ preuves: retouche }, { where: { id: lAm.id } });
        verifier('un instantane retouche est detecte', LitigeService.verifierPreuves(await Litige.findByPk(lAm.id)) === false);

        // --- 6. Decision ---------------------------------------------------
        titre("6. L'administration tranche");
        await doitEchouer('trancher sans reponse est refuse', 400,
            () => LitigeService.trancher(ADMIN, lInc.id, { statut: 'rejeté' }));
        await LitigeService.trancher(ADMIN, lInc.id, { statut: 'en cours' });
        verifier('pris en charge', (await Litige.findByPk(lInc.id)).statut === 'en cours');
        await LitigeService.trancher(ADMIN, lInc.id, { statut: 'rejeté', reponse: "Aucun paiement en especes n'est prevu par le reglement." });
        const fin = await Litige.findByPk(lInc.id);
        verifier('rejete, avec la reponse et la date', fin.statut === 'rejeté' && !!fin.reponse && !!fin.dateResolution);
        await doitEchouer('un litige tranche ne se retranche pas', 409,
            () => LitigeService.trancher(ADMIN, lInc.id, { statut: 'résolu', reponse: 'x' }));
        const n = await Notification.findOne({ where: { id: { [Op.gt]: maxNotif }, cle: `litige-${lInc.id}-rejeté` } });
        verifier('le membre est prevenu, avec la reponse', n && n.message.includes('especes'));
        const mes = await LitigeService.mesLitiges(D.id);
        const vu = mes.find(x => x.id === lInc.id);
        verifier('il retrouve le litige, sa reponse et l operation', vu && vu.reponse && vu.objet && vu.objet.includes('15000'));
        await LitigeService.ouvrir(D.id, { objetType: 'incident', objetId: incident.id, description: 'Nouvel element.' });
        verifier('une fois tranche, un nouveau litige peut etre ouvert', true);

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            await Litige.destroy({ where: { id: { [Op.gt]: maxLitige }, clientId: clients.map(c => c.id) } });
            const ns = await Notification.findAll({ where: { id: { [Op.gt]: maxNotif } }, attributes: ['id'] });
            if (ns.length) {
                await models.NotificationEnvoyer.destroy({ where: { NotificationId: ns.map(x => x.id) } });
                await Notification.destroy({ where: { id: ns.map(x => x.id) } });
            }
            await EvaluationRisque.destroy({ where: { id: { [Op.gt]: maxEval }, clientId: clients.map(c => c.id) } });
            await TontineEvaluationEligibilite.destroy({ where: { id: { [Op.gt]: maxDecision }, clientId: clients.map(c => c.id) } });
            if (groupe) {
                const g = await TontineGroupe.findByPk(groupe.id);
                const ids = g ? [g.portefeuilleId, g.portefeuilleCautionId].filter(Boolean) : [];
                await Transaction.destroy({ where: { groupeTontineId: groupe.id } });
                if (g) await g.destroy();
                if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            }
            for (const [id, etat] of Object.entries(initiaux)) {
                await Portefeuille.update({ montantReserve: 0 }, { where: { id } });
                await Portefeuille.update({ solde: etat.solde, montantReserve: etat.reserve }, { where: { id } });
            }
            console.log('  groupe, litiges, notifications, decisions, ecritures supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

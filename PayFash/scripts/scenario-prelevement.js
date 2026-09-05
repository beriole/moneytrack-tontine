// =====================================================================
//  Scenario de recette du MANDAT DE PRELEVEMENT — chantier D.
//
//    node scripts/scenario-prelevement.js [--plateforme=2] [--garder]
//
//  Le critere n'est pas « le prelevement fonctionne » mais « l'amende est
//  EVITEE ». On compare donc deux membres identiques a l'echeance : l'un
//  sous mandat, l'autre non.
//
//  Et on verifie les trois regles non negociables :
//    1. jamais de decouvert ni de reglement partiel ;
//    2. les amendes d'abord, sinon la cotisation reste bloquee ;
//    3. rien apres l'echeance — passe la date, c'est le defaut.
// =====================================================================

const { Op } = require('sequelize');
const ENV = require('../config/index');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction, Notification, NotificationEnvoyer,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineAmende
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const { AmendeService } = require('../services/tontine/amende.service');
const PrelevementService = require('../services/tontine/prelevement.service');
const planificateur = require('../services/tontine/planificateur');
const { nombre, arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const NOM = 'Prelevement Njangi';
const MONTANT = 20000;

const forcePlateforme = (process.argv.find(a => a.startsWith('--plateforme=')) || '').split('=')[1];
if (forcePlateforme) ENV.TONTINE_CLIENT_PLATEFORME_ID = parseInt(forcePlateforme, 10);
const garder = process.argv.includes('--garder');

let echecs = 0;
let termine = false;
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
async function fixerSolde(id, v) {
    await Portefeuille.update({ solde: v }, { where: { ClientPortefeuilleId: id, typePortefeuille: 'courant' } });
}
async function dernierId() {
    const n = await Notification.findOne({ order: [['id', 'DESC']] });
    return n ? n.id : 0;
}
async function notifsDe(clientId, depuis) {
    return Notification.findAll({
        where: { categorie: 'tontine', id: { [Op.gt]: depuis } },
        include: [{ model: Client, where: { id: clientId }, attributes: ['id'] }],
        order: [['id', 'DESC']]
    });
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

    await TontineGroupe.destroy({ where: { nom: NOM } });
    const bornInf = await dernierId();
    const initiaux = {};
    for (const c of clients) initiaux[c.id] = await soldeDe(c.id);

    let groupe;
    try {
        titre('1. Un groupe, quatre membres, une echeance');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM, type: 'rotative', montantParPeriode: MONTANT,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'anciennete', pourcentageCaution: 0,
            bareme: { retard: 1500, absence: 2000, indiscipline: 5000, autre: 1000 }
        });
        for (const c of [bertrand, clarisse, daniel]) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        await GroupeService.demarrerGroupe(awa.id, groupe.id);

        const cycle = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        const cotisations = await TontineCotisation.findAll({ where: { cycleId: cycle.id }, order: [['id', 'ASC']] });
        const [sousMandat, sansMandat, troisieme] = cotisations;
        const nomDe = async (id) => (await Client.findByPk(id)).nom.split(' ')[0];
        console.log('  sous mandat : ' + await nomDe(sousMandat.clientId)
            + '  |  sans mandat : ' + await nomDe(sansMandat.clientId));

        titre('2. Le mandat se regle finement');
        await (async () => {
            try { await PrelevementService.activer(sousMandat.clientId, groupe.id, { joursAvant: 30 }); verifier('un delai aberrant est refuse', false); }
            catch (e) { verifier('un delai aberrant est refuse', e.code === 400, e.message); }
        })();

        const act = await PrelevementService.activer(sousMandat.clientId, groupe.id, { joursAvant: 2 });
        verifier('mandat actif a J-2', act.actif === true && act.joursAvant === 2, act.message);

        const etat0 = await PrelevementService.etat(sousMandat.clientId, groupe.id);
        verifier('le systeme sait ce qu il faudra : ' + etat0.besoin, etat0.besoin === MONTANT);
        verifier('et si le solde suffira', etat0.couvert === true);

        titre('3. Solde insuffisant : on alerte, on ne preleve rien');
        const avantAlerte = await dernierId();
        await fixerSolde(sousMandat.clientId, 5000);   // il manque 15 000

        const etatCourt = await PrelevementService.etat(sousMandat.clientId, groupe.id);
        verifier('le manque est chiffre : ' + etatCourt.manque, etatCourt.manque === 15000);
        verifier('avec une consigne datee', !!etatCourt.avertissement, etatCourt.avertissement);

        await cycle.update({ dateFinPrevue: new Date(Date.now() + 1 * 86400000) });
        const tentative = await PrelevementService.executerEcheances();
        verifier('le prelevement est tente mais echoue', tentative.examines >= 1 && tentative.insuffisants >= 1,
            JSON.stringify({ examines: tentative.examines, preleves: tentative.preleves, insuffisants: tentative.insuffisants }));
        verifier('AUCUN prelevement partiel : le solde est intact',
            await soldeDe(sousMandat.clientId) === 5000);
        verifier('la cotisation reste ouverte',
            (await TontineCotisation.findByPk(sousMandat.id)).statut === 'attendue');

        const nAlerte = await notifsDe(sousMandat.clientId, avantAlerte);
        verifier('le membre est alerte avec le montant manquant',
            nAlerte.some(n => n.Type === 'alerte' && /manque/i.test(n.message)),
            nAlerte[0]?.message.slice(0, 80));
        verifier("l'alerte renvoie vers la recharge",
            nAlerte.some(n => n.lien?.ecran === 'Recharge'));

        titre('4. Solde suffisant : la cotisation se regle seule');
        await fixerSolde(sousMandat.clientId, 60000);
        const avantPrel = await soldeDe(sousMandat.clientId);
        const r = await PrelevementService.executerEcheances();
        verifier('prelevement effectue', r.preleves === 1 && r.montantTotal === MONTANT, JSON.stringify(r));
        verifier('le portefeuille est debite du montant exact',
            arrondir(avantPrel - await soldeDe(sousMandat.clientId)) === MONTANT);
        verifier('la cotisation est soldee',
            (await TontineCotisation.findByPk(sousMandat.id)).statut === 'payee');
        verifier('un second passage ne preleve pas deux fois',
            (await PrelevementService.executerEcheances()).preleves === 0);

        titre('5. Les amendes passent avant la cotisation');
        // On inflige une amende au troisieme, puis on lui donne mandat.
        const censeur = await TontineMembre.findOne({ where: { groupeId: groupe.id, clientId: awa.id } });
        await censeur.update({ role: 'censeur' });
        const amende = await AmendeService.infliger({ clientId: awa.id }, groupe.id,
            { clientId: troisieme.clientId, motif: 'absence' });
        await PrelevementService.activer(troisieme.clientId, groupe.id, { joursAvant: 2 });

        const etatAmende = await PrelevementService.etat(troisieme.clientId, groupe.id);
        verifier('le besoin inclut l amende : ' + etatAmende.besoin,
            etatAmende.besoin === MONTANT + 2000
            && etatAmende.detailBesoin.amendes === 2000);

        await fixerSolde(troisieme.clientId, MONTANT + 2000);
        const avant3 = await soldeDe(troisieme.clientId);
        const r3 = await PrelevementService.executerEcheances();
        verifier('amende et cotisation reglees en un seul passage',
            r3.preleves === 1 && r3.montantTotal === MONTANT + 2000, JSON.stringify(r3));
        verifier("l'amende est marquee payee",
            (await TontineAmende.findByPk(amende.id)).statut === 'payee');
        verifier('la cotisation aussi',
            (await TontineCotisation.findByPk(troisieme.id)).statut === 'payee');
        verifier('le portefeuille est vide, au franc pres',
            arrondir(avant3 - await soldeDe(troisieme.clientId)) === MONTANT + 2000);

        titre("6. Le mandat n'agit jamais apres l'echeance");
        await cycle.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        await fixerSolde(sansMandat.clientId, 60000);
        const apresEcheance = await PrelevementService.executerEcheances();
        verifier('plus aucun prelevement une fois la date passee', apresEcheance.examines === 0,
            JSON.stringify(apresEcheance));

        titre("7. Le juge de paix : l'amende est-elle evitee ?");
        const avantPasse = await dernierId();
        const rapport = await planificateur.passe();
        console.log('  passe : ' + JSON.stringify({
            preleves: rapport.prelevements?.preleves,
            enDefaut: rapport.echeances?.enDefaut,
            amendes: rapport.echeances?.amendesLevees
        }));

        const amendesMandat = await TontineAmende.count({
            where: { groupeId: groupe.id, clientId: sousMandat.clientId, motif: 'retard', cycleId: cycle.id }
        });
        const amendesSans = await TontineAmende.count({
            where: { groupeId: groupe.id, clientId: sansMandat.clientId, motif: 'retard', cycleId: cycle.id }
        });
        verifier('le membre SOUS mandat n a aucune amende de retard', amendesMandat === 0);
        verifier('le membre SANS mandat en a une', amendesSans === 1);
        verifier('le cycle est en defaut a cause du seul retardataire',
            (await TontineCycle.findByPk(cycle.id)).statut === 'en_defaut');

        titre("8. L'ordre du planificateur");
        const src = require('fs').readFileSync('./services/tontine/planificateur.js', 'utf8');
        verifier('le prelevement est declenche AVANT la mise en defaut',
            src.indexOf('PrelevementService.executerEcheances') < src.indexOf('CycleService.traiterEcheances'),
            'sinon il arriverait apres l amende qu il doit eviter');

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            const notifs = await Notification.findAll({
                where: { categorie: 'tontine', id: { [Op.gt]: bornInf } }, attributes: ['id']
            });
            const ids = notifs.map(n => n.id);
            if (ids.length) {
                await NotificationEnvoyer.destroy({ where: { NotificationId: { [Op.in]: ids } } });
                await Notification.destroy({ where: { id: { [Op.in]: ids } } });
            }
            const g = await TontineGroupe.findOne({ where: { nom: NOM } });
            if (g) {
                const pf = [g.portefeuilleId, g.portefeuilleCautionId, g.portefeuilleEpargneId].filter(Boolean);
                await Transaction.destroy({ where: { groupeTontineId: g.id } });
                await TontineGroupe.destroy({ where: { id: g.id } });
                if (pf.length) await Portefeuille.destroy({ where: { id: { [Op.in]: pf } } });
            }
            for (const c of clients) await fixerSolde(c.id, initiaux[c.id]);
            if (ENV.TONTINE_CLIENT_PLATEFORME_ID) await fixerSolde(ENV.TONTINE_CLIENT_PLATEFORME_ID, 0);
            console.log('  groupe, notifications et ecritures supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})();

// =====================================================================
//  Scenario de recette des NOTIFICATIONS — chantier C.
//
//    node scripts/scenario-notifications.js [--plateforme=2] [--garder]
//
//  Verifie que les evenements du module produisent bien des notifications
//  dans la boite EXISTANTE de l'utilisateur, adressees aux bonnes
//  personnes, actionnables (lien vers l'ecran), et que le planificateur
//  previent AVANT de sanctionner.
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
const NotificationService = require('../services/tontine/notification.service');
const planificateur = require('../services/tontine/planificateur');
const { nombre, arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const NOM = 'Notifications Njangi';
const MONTANT = 15000;

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

/** Notifications tontine d'un client, les plus recentes d'abord. */
async function notifsDe(clientId, depuis) {
    return Notification.findAll({
        where: { categorie: 'tontine', ...(depuis ? { id: { [Op.gt]: depuis } } : {}) },
        include: [{ model: Client, where: { id: clientId }, attributes: ['id'], through: { attributes: ['lu'] } }],
        order: [['id', 'DESC']]
    });
}
async function dernierId() {
    const n = await Notification.findOne({ order: [['id', 'DESC']] });
    return n ? n.id : 0;
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
    const soldes = {};
    for (const c of clients) {
        const pf = await Portefeuille.findOne({ where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' } });
        soldes[c.id] = pf ? arrondir(pf.solde) : 0;
    }

    let groupe;
    try {
        // =============================================================
        titre('1. Le demarrage previent tout le monde');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM, type: 'rotative', montantParPeriode: MONTANT,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'anciennete', pourcentageCaution: 0,
            bareme: { retard: 1200, absence: 2000, indiscipline: 5000, autre: 1000 }
        });
        for (const c of [bertrand, clarisse, daniel]) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);

        const demarrage = await GroupeService.demarrerGroupe(awa.id, groupe.id);
        const cycle1 = await TontineCycle.findByPk(demarrage.cycle.id);
        const benef = await Client.findByPk(cycle1.beneficiaireId);
        console.log('  beneficiaire du cycle 1 : ' + benef.nom);

        for (const c of clients) {
            const n = await notifsDe(c.id, bornInf);
            verifier(`${c.nom.split(' ')[0]} est prevenu du demarrage`, n.length >= 1,
                n[0] ? n[0].message.slice(0, 72) + '...' : 'aucune');
        }

        const notifBenef = (await notifsDe(cycle1.beneficiaireId, bornInf))[0];
        verifier('le beneficiaire recoit un message different des autres',
            /votre tour/i.test(notifBenef.message), notifBenef.message.slice(0, 70));

        // =============================================================
        titre('2. Une notification est actionnable');
        verifier('elle porte une categorie', notifBenef.categorie === 'tontine');
        verifier('elle porte un lien exploitable',
            notifBenef.lien && typeof notifBenef.lien === 'object' && notifBenef.lien.ecran === 'DetailTontine',
            JSON.stringify(notifBenef.lien));
        verifier('le lien survit a l aller-retour en base (JSON sur MariaDB)',
            typeof (await Notification.findByPk(notifBenef.id)).lien === 'object');
        // On lit la table de liaison directement : le modele est declare
        // bd.define("client"), donc l'accesseur d'association est "clients"
        // en minuscule — une ambiguite qu'il vaut mieux contourner.
        const liaison = await NotificationEnvoyer.findOne({
            where: { NotificationId: notifBenef.id, ClientId: cycle1.beneficiaireId }
        });
        verifier('elle est adressee au bon client et non lue', liaison && liaison.lu === false);

        // =============================================================
        titre('3. Le rappel arrive AVANT l amende');
        const avant3j = await dernierId();
        await cycle1.update({ dateFinPrevue: new Date(Date.now() + 2.5 * 86400000) });
        const r3 = await NotificationService.rappelsCotisations();
        verifier('rappel a J-3 envoye aux cotisants', r3.j3 === 3, JSON.stringify(r3));

        const unCotisant = (await TontineCotisation.findAll({ where: { cycleId: cycle1.id } }))[0];
        const n3 = await notifsDe(unCotisant.clientId, avant3j);
        verifier('le rappel ouvre directement l ecran de cotisation',
            n3[0]?.lien?.ecran === 'Cotiser', JSON.stringify(n3[0]?.lien));
        verifier('le beneficiaire n est pas rappele : il ne cotise pas',
            (await notifsDe(cycle1.beneficiaireId, avant3j)).length === 0);

        const avant1j = await dernierId();
        await cycle1.update({ dateFinPrevue: new Date(Date.now() + 0.5 * 86400000) });
        const r1 = await NotificationService.rappelsCotisations();
        verifier('rappel a J-1 envoye', r1.j1 === 3, JSON.stringify(r1));

        // =============================================================
        titre('4. La passe planifiee : prevenir, puis constater');
        const avantPasse = await dernierId();
        await cycle1.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        const rapport = await planificateur.passe();
        console.log('  passe : ' + JSON.stringify({
            retard: rapport.rappelsCotisations?.retard,
            enDefaut: rapport.echeances?.enDefaut,
            amendes: rapport.echeances?.amendesLevees
        }));

        verifier('les retardataires sont alertes', rapport.rappelsCotisations.retard === 3);
        verifier('le cycle bascule en defaut', rapport.echeances.enDefaut === 1);
        verifier('une amende est levee par cotisation impayee', rapport.echeances.amendesLevees === 3);
        verifier('le cron n a toujours pas verse',
            (await TontineCycle.findByPk(cycle1.id)).statut === 'en_defaut');

        const nRetard = await notifsDe(unCotisant.clientId, avantPasse);
        verifier("l'alerte de retard est de type alerte", nRetard.some(n => n.Type === 'alerte'),
            nRetard[0]?.message.slice(0, 70));

        // Une amende infligee a la main previent aussi.
        const avantAmende = await dernierId();
        const censeur = await TontineMembre.findOne({ where: { groupeId: groupe.id, clientId: awa.id } });
        await censeur.update({ role: 'censeur' });
        const amende = await AmendeService.infliger({ clientId: awa.id }, groupe.id,
            { clientId: daniel.id, motif: 'absence' });
        const nAmende = await notifsDe(daniel.id, avantAmende);
        // toLocaleString('fr-FR') separe les milliers par une espace fine
        // insecable (U+202F), pas par une espace ordinaire : toute
        // comparaison sur un montant formate doit normaliser les blancs.
        const sansBlancs = (s) => (s || '').replace(/[\s  ]/g, '');
        verifier('le sanctionne est prevenu, avec le montant',
            nAmende.length >= 1 && sansBlancs(nAmende[0].message).includes('2000FCFA'),
            nAmende[0]?.message.slice(0, 78));
        verifier("elle renvoie vers l'ecran des amendes",
            nAmende[0]?.lien?.ecran === 'MesAmendes');
        verifier('seul le sanctionne est prevenu',
            (await notifsDe(clarisse.id, avantAmende)).length === 0);

        // =============================================================
        titre('5. Le versement annonce la bonne nouvelle');
        // On solde tout : amendes d'abord (elles bloquent la cotisation).
        for (const c of await TontineCotisation.findAll({ where: { cycleId: cycle1.id } })) {
            const { amendes } = await AmendeService.mesAmendes(c.clientId, groupe.id);
            for (const a of amendes.filter(x => x.statut === 'due')) await AmendeService.payer(c.clientId, a.id);
            const f = await TontineCotisation.findByPk(c.id);
            if (f.statut !== 'payee') await CycleService.cotiser(c.clientId, cycle1.id);
        }

        const avantVersement = await dernierId();
        const v = await CycleService.verser({ clientId: awa.id }, cycle1.id);

        const nBenef = await notifsDe(cycle1.beneficiaireId, avantVersement);
        verifier('le beneficiaire est prevenu du montant recu',
            nBenef.some(n => /vous avez recu/i.test(n.message)),
            nBenef[0]?.message.slice(0, 78));
        const autre = clients.find(c => c.id !== cycle1.beneficiaireId);
        verifier('les autres membres sont prevenus du versement',
            (await notifsDe(autre.id, avantVersement)).length >= 1);
        verifier('le cycle suivant est annonce dans la foulee',
            (await notifsDe(v.cycleSuivant.beneficiaireId, avantVersement))
                .some(n => /votre tour/i.test(n.message)));

        // =============================================================
        titre('6. Une notification ne casse jamais un mouvement d argent');
        const notifCassee = await NotificationService.envoyer(null, 'message sans destinataire');
        verifier('un envoi sans destinataire est ignore, pas leve', notifCassee === null);
        const notifVide = await NotificationService.envoyer([999999999], 'client inexistant');
        verifier('un client inexistant ne fait pas planter l envoi', notifVide !== undefined);

        // =============================================================
        titre('7. Volume');
        const total = await Notification.count({ where: { categorie: 'tontine', id: { [Op.gt]: bornInf } } });
        const liens = await NotificationEnvoyer.count({
            where: { NotificationId: { [Op.gt]: bornInf } }
        });
        console.log(`  ${total} notifications creees, ${liens} destinataires servis`);
        verifier('chaque notification a au moins un destinataire', liens >= total);

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
            for (const c of clients) {
                await Portefeuille.update({ solde: soldes[c.id] },
                    { where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' } });
            }
            if (ENV.TONTINE_CLIENT_PLATEFORME_ID) {
                await Portefeuille.update({ solde: 0 },
                    { where: { ClientPortefeuilleId: ENV.TONTINE_CLIENT_PLATEFORME_ID, typePortefeuille: 'courant' } });
            }
            console.log(`  ${ids.length} notifications, groupe et ecritures supprimes ; soldes restaures`);
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

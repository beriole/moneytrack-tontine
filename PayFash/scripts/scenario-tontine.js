// =====================================================================
//  Scenario de recette du noyau rotatif — phase 2.
//
//    node scripts/scenario-tontine.js
//    node scripts/scenario-tontine.js --plateforme=2   (force le compte de frais)
//    node scripts/scenario-tontine.js --garder         (ne nettoie pas)
//
//  Deroule une tontine complete de 4 membres sur 4 cycles en appelant les
//  services directement — pas besoin que le serveur tourne — et controle :
//
//    1. chaque membre mange exactement une fois ;
//    2. un versement sur pot incomplet est REFUSE ;
//    3. la somme des portefeuilles est conservee, aux frais pres ;
//    4. le cron ne verse jamais : il constate le defaut ;
//    5. une cotisation rejouee ne debite pas deux fois.
//
//  Nettoie derriere lui : groupe, caisse, ecritures et soldes remis a l'etat
//  initial, sauf avec --garder.
// =====================================================================

const { Op } = require('sequelize');
const ENV = require('../config/index');
const models = require('../models');
const { db, Client, Portefeuille, Transaction, TontineGroupe, TontineMembre, TontineCycle, TontineCotisation } = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const { nombre, arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const MONTANT = 25000;
const NOM_GROUPE = 'Scenario Recette Phase 2';

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
    return pf ? arrondir(pf.solde) : null;
}

/** Attend que l'appel echoue, et verifie le code HTTP porte par l'erreur. */
async function doitEchouer(libelle, codeAttendu, fn) {
    try {
        await fn();
        verifier(libelle, false, 'aucune erreur levee');
    } catch (e) {
        verifier(libelle, e.code === codeAttendu, `${e.code} — ${e.message}`);
    }
}

(async () => {
    await db.authenticate();

    // --- Pre-requis --------------------------------------------------
    const clients = [];
    for (const email of EMAILS) {
        const c = await Client.findOne({ where: { email } });
        if (!c) {
            console.error(`Compte de demo absent : ${email}\nLancez d'abord : node scripts/seed-tontine-demo.js`);
            process.exit(1);
        }
        clients.push(c);
    }
    const [awa, bertrand, clarisse, daniel] = clients;
    const plateformeId = ENV.TONTINE_CLIENT_PLATEFORME_ID;

    await TontineGroupe.destroy({ where: { nom: NOM_GROUPE } }); // relance propre

    const soldesInitiaux = {};
    for (const c of clients) soldesInitiaux[c.id] = await soldeDe(c.id);
    const plateformeInitial = plateformeId ? await soldeDe(plateformeId) : null;

    console.log('SCENARIO — 4 membres, ' + MONTANT + ' XAF par periode, 4 cycles');
    console.log('Frais de plateforme : ' + (plateformeId
        ? (nombre(ENV.TONTINE_FRAIS_PLATEFORME) * 100) + ' % vers le client #' + plateformeId
        : 'desactives (TONTINE_CLIENT_PLATEFORME_ID absent)'));

    let groupe;
    try {
        // --- 1. Constitution -----------------------------------------
        titre('1. Constitution du groupe');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, type: 'rotative', montantParPeriode: MONTANT,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'tirage'
        });
        verifier('groupe cree, code ' + groupe.codeInvitation, groupe.statut === 'en_attente');

        for (const c of [bertrand, clarisse, daniel]) {
            await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        }
        await doitEchouer('adhesion refusee au-dela de membresMax', 409,
            () => GroupeService.rejoindreGroupe(plateformeId || awa.id, groupe.codeInvitation));
        await doitEchouer('adhesion en double refusee', 409,
            () => GroupeService.rejoindreGroupe(bertrand.id, groupe.codeInvitation));

        await doitEchouer('un non-president ne peut pas demarrer', 403,
            () => GroupeService.demarrerGroupe(daniel.id, groupe.id));

        // --- 2. Demarrage --------------------------------------------
        titre('2. Demarrage et tirage au sort');
        const demarrage = await GroupeService.demarrerGroupe(awa.id, groupe.id);
        const tours = demarrage.ordre.map(o => o.tour);
        verifier('4 tours attribues sans doublon', new Set(tours).size === 4 && tours.length === 4,
            'ordre = ' + demarrage.ordre.map(o => o.tour).join(','));
        verifier('preuve de tirage generee', !!demarrage.preuveTirage,
            demarrage.preuveTirage.slice(0, 16) + '...');

        const pot = MONTANT * 3;
        verifier('pot = ' + pot + ' (le beneficiaire ne cotise pas pour son tour)',
            arrondir(demarrage.cycle.montantAttendu) === pot);

        // --- 3. Les 4 cycles -----------------------------------------
        const beneficiaires = [];
        let fraisTotaux = 0;
        let amendesPayees = 0;

        for (let n = 1; n <= 4; n++) {
            titre('3.' + n + ' Cycle ' + n);
            const g = await TontineGroupe.findByPk(groupe.id);
            const cycle = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: n } });
            const benef = await Client.findByPk(cycle.beneficiaireId);
            beneficiaires.push(cycle.beneficiaireId);
            console.log('  beneficiaire : ' + benef.nom);

            const cotisations = await TontineCotisation.findAll({ where: { cycleId: cycle.id } });
            verifier('3 cotisations attendues', cotisations.length === 3);

            // Invariant central : versement refuse tant que le pot est incomplet
            if (n === 1) {
                await doitEchouer('versement refuse sur pot vide', 409,
                    () => CycleService.verser({ clientId: awa.id }, cycle.id));
                await CycleService.cotiser(cotisations[0].clientId, cycle.id);
                await doitEchouer('versement refuse sur pot partiel (1/3)', 409,
                    () => CycleService.verser({ clientId: awa.id }, cycle.id));

                // Le cron constate et sanctionne, il ne verse pas
                await cycle.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
                const rapport = await CycleService.traiterEcheances();
                const apres = await TontineCycle.findByPk(cycle.id);
                verifier('cron : cycle passe en defaut, aucun versement',
                    apres.statut === 'en_defaut' && rapport.enDefaut >= 1,
                    'statut = ' + apres.statut);
                verifier('cron : amendes de retard levees sur les 2 retardataires',
                    rapport.amendesLevees === 2, rapport.amendesLevees + ' amende(s)');

                // Caisse 4 : la dette bloque la cotisation. Les retardataires
                // doivent solder avant de pouvoir remettre au pot.
                const enRetard = await TontineCotisation.findAll({
                    where: { cycleId: cycle.id, statut: 'en_retard' }
                });
                await doitEchouer('cotisation bloquee tant que l amende est due', 409,
                    () => CycleService.cotiser(enRetard[0].clientId, cycle.id));

                const { AmendeService } = require('../services/tontine/amende.service');
                for (const c of enRetard) {
                    const { amendes } = await AmendeService.mesAmendes(c.clientId, groupe.id);
                    for (const a of amendes.filter(x => x.statut === 'due')) {
                        await AmendeService.payer(c.clientId, a.id);
                        amendesPayees += nombre(a.montant);
                    }
                }
                verifier('amendes reglees, la cotisation redevient possible', true,
                    amendesPayees + ' FCFA verses au pot');
            }

            // Toutes les cotisations restantes
            for (const c of cotisations) {
                const fraiche = await TontineCotisation.findByPk(c.id);
                if (fraiche.statut !== 'payee') await CycleService.cotiser(c.clientId, cycle.id);
            }

            if (n === 1) {
                await doitEchouer('cotisation rejouee refusee', 409,
                    () => CycleService.cotiser(cotisations[0].clientId, cycle.id));
                const nonMembre = plateformeId || 999999;
                await doitEchouer('un non-membre ne peut pas cotiser', 403,
                    () => CycleService.cotiser(nonMembre, cycle.id));
                await doitEchouer('le beneficiaire ne cotise pas pour son tour', 409,
                    () => CycleService.cotiser(cycle.beneficiaireId, cycle.id));
            }

            const avant = await soldeDe(cycle.beneficiaireId);
            const r = await CycleService.verser({ clientId: awa.id }, cycle.id);
            fraisTotaux += r.frais;
            const apresSolde = await soldeDe(cycle.beneficiaireId);

            verifier('pot verse : ' + r.net + ' (frais ' + r.frais + ')',
                arrondir(apresSolde - avant) === arrondir(r.net));
            if (n === 1) {
                verifier('le beneficiaire encaisse aussi les amendes de retard',
                    arrondir(r.bonusAmendes) === arrondir(amendesPayees),
                    'bonus = ' + r.bonusAmendes + ', amendes reglees = ' + amendesPayees);
            }
            verifier('caisse revenue a zero',
                arrondir((await Portefeuille.findByPk(g.portefeuilleId)).solde) === 0);

            if (n < 4) {
                verifier('cycle ' + (n + 1) + ' ouvert automatiquement',
                    r.cycleSuivant && r.cycleSuivant.numeroCycle === n + 1);
            } else {
                verifier('tontine terminee apres le dernier tour', r.tontineTerminee === true);
            }
        }

        // --- 4. Invariants globaux -----------------------------------
        titre('4. Invariants de fin de rotation');
        verifier('chaque membre a mange exactement une fois',
            new Set(beneficiaires).size === 4 && beneficiaires.length === 4);

        const gFinal = await TontineGroupe.findByPk(groupe.id);
        verifier('groupe au statut "termine"', gFinal.statut === 'termine');

        const membres = await TontineMembre.findAll({ where: { groupeId: groupe.id } });
        verifier('les 4 membres sont marques servis', membres.every(m => m.aBeneficie));

        const restantes = await TontineCotisation.count({
            where: { cycleId: { [Op.in]: (await TontineCycle.findAll({ where: { groupeId: groupe.id } })).map(c => c.id) } },
            ...{}
        });
        const impayees = await TontineCotisation.count({
            where: {
                statut: { [Op.ne]: 'payee' },
                cycleId: { [Op.in]: (await TontineCycle.findAll({ where: { groupeId: groupe.id } })).map(c => c.id) }
            }
        });
        verifier('12 cotisations, toutes soldees', restantes === 12 && impayees === 0,
            restantes + ' lignes, ' + impayees + ' impayee(s)');

        titre('5. Conservation de la monnaie');
        let deltaMembres = 0;
        for (const c of clients) {
            const final = await soldeDe(c.id);
            const delta = arrondir(final - soldesInitiaux[c.id]);
            deltaMembres += delta;
            console.log('  ' + c.nom.padEnd(18) + soldesInitiaux[c.id] + ' -> ' + final + '   (' + (delta >= 0 ? '+' : '') + delta + ')');
        }
        const deltaPlateforme = plateformeId ? arrondir((await soldeDe(plateformeId)) - plateformeInitial) : 0;
        console.log('  ' + 'plateforme'.padEnd(18) + (plateformeId ? plateformeInitial + ' -> ' + (await soldeDe(plateformeId)) + '   (+' + deltaPlateforme + ')' : 'n/a'));

        verifier('les membres perdent exactement les frais preleves',
            arrondir(deltaMembres) === arrondir(-fraisTotaux),
            'delta membres = ' + arrondir(deltaMembres) + ', frais = ' + fraisTotaux);
        verifier('la plateforme encaisse exactement ces frais',
            arrondir(deltaPlateforme) === arrondir(fraisTotaux));
        verifier('somme totale conservee',
            arrondir(deltaMembres + deltaPlateforme) === 0);

        termine = true;

    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder && groupe) {
            titre('Nettoyage');
            const g = await TontineGroupe.findByPk(groupe.id);
            const caisseId = g ? g.portefeuilleId : null;
            await Transaction.destroy({ where: { groupeTontineId: groupe.id } });
            if (g) await g.destroy();
            if (caisseId) await Portefeuille.destroy({ where: { id: caisseId } });
            for (const c of clients) {
                await Portefeuille.update({ solde: soldesInitiaux[c.id] },
                    { where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' } });
            }
            if (plateformeId && plateformeInitial !== null) {
                await Portefeuille.update({ solde: plateformeInitial },
                    { where: { ClientPortefeuilleId: plateformeId, typePortefeuille: 'courant' } });
            }
            console.log('  groupe, caisse, ecritures supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

// =====================================================================
//  Scenario de recette de la caisse 4 — phase 3.
//
//    node scripts/scenario-caisse4.js [--plateforme=2] [--garder]
//
//  Critere de sortie annonce : « un membre defaillant voit sa caution
//  saisie, le pot est complete, le cycle se verse normalement et
//  l'incident est trace ».
//
//  Controle aussi la cascade complete — amende, caution, exclusion —
//  et les permissions du bureau.
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
    const groupesAnnexes = [];   // groupes crees en cours de route, a nettoyer aussi

    try {
        // --- 1. Caution ---------------------------------------------
        titre('1. Blocage des cautions');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, montantParPeriode: MONTANT,
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

        // --- 1 bis. La caution exigee au demarrage --------------------
        // pourcentageCaution etait configure et affiche depuis toujours sans
        // que rien ne l'exige jamais : un groupe pouvait demarrer avec une
        // cascade de recours entierement vide. Le drapeau reste facultatif —
        // le groupe ci-dessus a demarre sans lui — mais quand il est leve, il
        // doit mordre.
        const strict = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE + ' (caution exigee)',
            montantParPeriode: MONTANT, frequence: 'mensuelle', membresMax: 3,
            modeOrdre: 'anciennete', pourcentageCaution: 100, cautionObligatoire: true
        });
        groupesAnnexes.push(strict.id);
        for (const c of [bertrand, clarisse]) {
            await GroupeService.rejoindreGroupe(c.id, strict.codeInvitation);
        }
        verifier('le drapeau est bien enregistre',
            (await TontineGroupe.findByPk(strict.id)).cautionObligatoire === true);

        await doitEchouer('caution exigee : le demarrage est refuse sans depot', 409,
            () => GroupeService.demarrerGroupe(awa.id, strict.id));

        for (const c of [awa, bertrand, clarisse]) await CautionService.bloquer(c.id, strict.id);
        const demarrageStrict = await GroupeService.demarrerGroupe(awa.id, strict.id);
        verifier('une fois les cautions deposees, le groupe demarre',
            !!demarrageStrict.cycle && demarrageStrict.cycle.numeroCycle === 1);

        // --- 2. Permissions ------------------------------------------
        titre('2. Le bureau n\'est pas decoratif');
        await doitEchouer('un simple membre ne peut pas infliger d amende', 403,
            () => AmendeService.infliger(president(daniel.id), groupe.id,
                { clientId: clarisse.id, motif: 'absence' }));

        const amendeAbsence = await AmendeService.infliger(president(awa.id), groupe.id,
            { clientId: daniel.id, motif: 'absence', commentaire: 'Absent a la reunion de lancement' });
        verifier('le bureau inflige au bareme du groupe : ' + amendeAbsence.montant,
            arrondir(amendeAbsence.montant) === 2000);
        verifier('avant le demarrage, l amende n est rattachee a aucun cycle',
            amendeAbsence.cycleId === null);

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

        // La cotisation est ouverte et l'echeance pas encore passee : c'est
        // le seul moment ou la saisie manuelle se teste, puisque la regle
        // s'en chargera des que l'echeance tombera.
        await doitEchouer('un simple membre ne peut pas saisir une caution', 403,
            () => RecouvrementService.parCaution(president(bertrand.id), defaillant.id));

        const etatAvant = await RecouvrementService.etat(awa.id, defaillant.id);
        verifier('la cascade voit la caution disponible avant l echeance',
            etatAvant.crans.cautionDisponible === MONTANT && etatAvant.crans.cautionCouvreTout === true);

        const soldeDefaillantAvant = await soldeDe(defaillant.clientId);
        await cycle1.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        const rapport = await CycleService.traiterEcheances();

        const amendeRetard = await TontineAmende.findOne({
            where: { cycleId: cycle1.id, clientId: defaillant.clientId, motif: 'retard' }
        });
        verifier('amende au bareme du groupe (1500) et non au defaut (1000)',
            arrondir(amendeRetard.montant) === 1500);
        verifier('amende levee par la regle, sans auteur nomme', amendeRetard.infligeePar === null);

        // --- 4. La garantie est mobilisee par la regle ----------------
        titre('4. Saisie automatique de la caution');
        // La caution etait bloquee pour exactement ce cas, le montant est
        // ecrit au reglement, et rien ne s'y decide : elle attendait
        // pourtant qu'une personne du bureau la declenche, pendant que le
        // pot restait incomplet et que la garantie dormait.
        verifier('cron : 1 amende levee et 1 caution saisie',
            rapport.amendesLevees === 1 && rapport.cautionsSaisies === 1,
            JSON.stringify(rapport));
        verifier('la saisie a solde la cotisation : ' + rapport.montantRecouvre,
            rapport.cotisationsSoldeesParCaution === 1 && rapport.montantRecouvre === MONTANT);
        verifier('le portefeuille du defaillant n est pas redebite',
            await soldeDe(defaillant.clientId) === soldeDefaillantAvant,
            'l argent etait deja au sequestre');

        const cotisationApres = await TontineCotisation.findByPk(defaillant.id);
        verifier('cotisation soldee par la garantie', cotisationApres.statut === 'payee');
        const cycleApres = await TontineCycle.findByPk(cycle1.id);
        verifier('le cycle quitte le defaut : le pot est complet',
            cycleApres.statut === 'actif' && rapport.enDefaut === 0);

        await doitEchouer('une caution deja consommee ne se saisit pas deux fois', 409,
            () => RecouvrementService.parCaution(president(awa.id), defaillant.id));

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

        // --- 6 bis. L'amende indemnise le membre lese -----------------
        titre('6 bis. L amende va au beneficiaire lese');
        // Le cycle 1 est verse, son amende de retard est encore due.
        // Reglee maintenant, elle tombait dans la caisse du cycle 2 et
        // indemnisait un membre qui n'avait rien subi.
        const avantLese = await soldeDe(cycle1.beneficiaireId);
        const caisseAvant = await soldePortefeuille(g1.portefeuilleId);
        await AmendeService.payer(defaillant.clientId, amendeRetard.id);
        verifier('le beneficiaire du cycle 1 recoit les 1500 FCFA de l amende',
            arrondir(await soldeDe(cycle1.beneficiaireId) - avantLese) === 1500);
        verifier('la caisse du cycle 2 n est pas touchee',
            await soldePortefeuille(g1.portefeuilleId) === caisseAvant);
        verifier('l indemnite est ecrite chez le lese',
            !!(await Transaction.findOne({ where: { reference: `TNT-AMD-I-${amendeRetard.id}` } })));

        // --- 7. Liberation de caution --------------------------------
        titre('7. Restitution de la caution');
        const cycle2 = versement.cycleSuivant;
        const cot2 = await TontineCotisation.findAll({ where: { cycleId: cycle2.id } });
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
        titre('8. Exclusion');
        await doitEchouer('un simple membre ne peut pas exclure', 403,
            () => RecouvrementService.exclure(president(bertrand.id), groupe.id, defaillant.clientId));
        await doitEchouer('le president ne peut pas etre exclu', 409,
            () => RecouvrementService.exclure(president(awa.id), groupe.id, awa.id));

        const exclusion = await RecouvrementService.exclure(
            president(awa.id), groupe.id, defaillant.clientId, 'Defaut de paiement repete');
        verifier('membre exclu et sorti de la rotation',
            exclusion.membre.statut === 'exclu' && exclusion.membre.ordreBeneficiaire === null);
        verifier('le groupe ne compte plus que 3 actifs', exclusion.membresRestants === 3);
        await doitEchouer('un exclu ne peut plus bloquer de caution', 403,
            () => CautionService.bloquer(defaillant.clientId, groupe.id));

        // --- 10. Conservation ----------------------------------------
        titre('9. Conservation de la monnaie');
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
        // Les groupes annexes du scenario immobilisent eux aussi de l'argent :
        // l'ignorer ferait echouer la conservation pour une bonne raison — les
        // fonds existent, ils sont juste ailleurs.
        let annexes = 0;
        for (const id of groupesAnnexes) {
            const ga = await TontineGroupe.findByPk(id);
            if (!ga) continue;
            annexes = arrondir(annexes
                + await soldePortefeuille(ga.portefeuilleId)
                + await soldePortefeuille(ga.portefeuilleCautionId)
                + await soldePortefeuille(ga.portefeuilleEpargneId));
        }

        console.log('  ' + 'sequestre caution'.padEnd(18) + sequestre);
        console.log('  ' + 'caisse du groupe'.padEnd(18) + caisse);
        if (annexes) console.log('  ' + 'groupes annexes'.padEnd(18) + annexes);

        const total = arrondir(deltaMembres + deltaPlateforme + sequestre + caisse + annexes);
        verifier('rien ne se perd, rien ne se cree',
            total === 0, 'somme = ' + total);

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

            for (const id of groupesAnnexes) {
                const ga = await TontineGroupe.findByPk(id);
                if (!ga) continue;
                const idsA = [ga.portefeuilleId, ga.portefeuilleCautionId, ga.portefeuilleEpargneId].filter(Boolean);
                await Transaction.destroy({ where: { groupeTontineId: id } });
                await ga.destroy();
                if (idsA.length) await Portefeuille.destroy({ where: { id: { [Op.in]: idsA } } });
            }
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

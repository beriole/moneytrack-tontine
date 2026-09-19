/**
 * Scenario : les garanties, de l'affectation a la liberation.
 *
 * Le probleme metier : un membre recoit le pot tot, puis cesse de cotiser.
 * Sa caution — une fraction d'une cotisation — ne couvre pas ce qu'il doit
 * encore. Il bloque une part de son epargne en garantie ; si une cotisation
 * reste impayee, MoneyTrack y preleve le montant manquant, et seulement lui.
 *
 *   1. exposition d'un membre, avant et apres le demarrage
 *   2. consentement : texte, empreinte, refus d'une empreinte trafiquee
 *   3. affectation : l'argent ne bouge pas, le disponible baisse
 *   4. l'argent bloque ne sort par aucun chemin
 *   5. confidentialite : le president voit des montants, pas des sources
 *   6. impaye a l'echeance : la garantie couvre le manque, pas plus
 *   7. fin de rotation : le reste est rendu
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-garanties.js [--garder]
 */

const { Op } = require('sequelize');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction,
    TontineGroupe, TontineCycle, TontineCotisation,
    TontineGarantie, TontineGarantieMouvement, TontineConsentementGarantie
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const GarantieService = require('../services/tontine/garantie.service');
const ExpositionService = require('../services/tontine/exposition.service');
const { AmendeService } = require('../services/tontine/amende.service');
const Fonds = require('../services/fonds.service');
const { arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const MONTANT = 20000;
const NOM_GROUPE = 'Scenario Garanties';
const EPARGNE = 100000;
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

(async () => {
    await db.authenticate();

    const clients = [];
    for (const email of EMAILS) {
        const c = await Client.findOne({ where: { email } });
        if (!c) { console.error(`Compte absent : ${email}\nLancez : node scripts/seed-tontine-demo.js`); process.exit(1); }
        clients.push(c);
    }
    const [awa, bertrand] = clients;

    await TontineGroupe.destroy({ where: { nom: NOM_GROUPE } });

    // Etat initial des portefeuilles courant et epargne, restaure a la fin.
    const initiaux = {};
    for (const c of clients) {
        for (const type of ['courant', 'epargne']) {
            const pf = await portefeuilleDe(c.id, type);
            if (pf) initiaux[pf.id] = { solde: pf.solde, reserve: Fonds.reserve(pf) };
        }
    }

    console.log('SCENARIO GARANTIES — 4 membres, ' + MONTANT + ' XAF/periode, sans caution');
    let groupe;
    const crees = [];   // portefeuilles crees pour le scenario

    try {
        // --- 1. Exposition ------------------------------------------------
        titre('1. Exposition');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, montantParPeriode: MONTANT, frequence: 'mensuelle',
            membresMax: 4, modeOrdre: 'tirage', pourcentageCaution: 0
        });
        for (const c of clients.slice(1)) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);

        const avant = await ExpositionService.pourMembre(bertrand.id, groupe.id);
        verifier('avant le demarrage, exposition potentielle : 3 cotisations = 60 000',
            avant.potentielle && avant.exposition === 3 * MONTANT, avant.explication);

        await GroupeService.demarrerGroupe(awa.id, groupe.id);
        const cycle1 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        // Le defaillant : un membre qui cotise au cycle 1 (pas son beneficiaire).
        const cotisations1 = await TontineCotisation.findAll({ where: { cycleId: cycle1.id }, order: [['id', 'ASC']] });
        const defaillantId = cotisations1[0].clientId;
        const defaillant = clients.find(c => c.id === defaillantId);
        console.log('  beneficiaire du cycle 1 : client ' + cycle1.beneficiaireId + ' ; defaillant designe : ' + defaillant.nom);

        const expo = await ExpositionService.pourMembre(defaillantId, groupe.id);
        verifier('apres le demarrage, 3 cotisations restent a payer : 60 000',
            !expo.potentielle && expo.exposition === 3 * MONTANT, JSON.stringify({
                ouvertes: expo.cotisationsOuvertes, projetees: expo.cotisationsProjetees }));

        const consolide = await ExpositionService.pourClient(defaillantId);
        verifier('l exposition consolidee somme les tontines du client',
            consolide.expositionTotale >= expo.exposition && consolide.engagementMensuel >= MONTANT);

        // --- 2. Consentement ---------------------------------------------
        titre('2. Consentement');
        // Les comptes du seed n'ont qu'un portefeuille courant : l'inscription,
        // qui cree aussi l'epargne et le projet, n'est pas passee par eux.
        let epargne = await portefeuilleDe(defaillantId, 'epargne');
        if (!epargne) {
            epargne = await Portefeuille.create({
                nom: 'Epargne (scenario)', solde: 0, devise: 'XAF', typePortefeuille: 'epargne',
                estPrincipal: false, estActif: true, ClientPortefeuilleId: defaillantId
            });
            crees.push(epargne.id);
        }
        await epargne.update({ solde: EPARGNE, montantReserve: 0 });

        const sim = await GarantieService.simuler(defaillantId, groupe.id, epargne.id, 40000);
        verifier('le texte dit combien, d ou, pour quelle tontine',
            sim.texte.includes('40000 FCFA') && sim.texte.includes(NOM_GROUPE) && sim.texte.includes('epargne'));
        verifier('simulation : couverture de 0 % a ' + sim.couvertureApres + ' %',
            sim.couvertureAvant === 0 && sim.couvertureApres === 66.67);

        await doitEchouer('une empreinte qui ne correspond pas au texte est refusee', 409,
            () => GarantieService.affecter(defaillantId, groupe.id,
                { portefeuilleId: epargne.id, montant: 40000, hashTexte: 'f'.repeat(64) }));
        await doitEchouer('le texte accepte pour 40 000 ne vaut pas pour 50 000', 409,
            () => GarantieService.affecter(defaillantId, groupe.id,
                { portefeuilleId: epargne.id, montant: 50000, hashTexte: sim.hashTexte }));
        await doitEchouer('sans consentement, rien n est bloque', 400,
            () => GarantieService.affecter(defaillantId, groupe.id, { portefeuilleId: epargne.id, montant: 40000 }));

        const simTrop = await GarantieService.simuler(defaillantId, groupe.id, epargne.id, 70000);
        await doitEchouer('au-dela de l engagement (60 000), bloquer ne protege rien de plus', 409,
            () => GarantieService.affecter(defaillantId, groupe.id,
                { portefeuilleId: epargne.id, montant: 70000, hashTexte: simTrop.hashTexte }));

        const courantAutre = await portefeuilleDe(bertrand.id === defaillantId ? awa.id : bertrand.id, 'courant');
        await doitEchouer('le portefeuille d un autre membre ne peut pas servir', 404,
            () => GarantieService.simuler(defaillantId, groupe.id, courantAutre.id, 1000));

        // --- 3. Affectation -----------------------------------------------
        titre('3. Affectation');
        const r = await GarantieService.affecter(defaillantId, groupe.id,
            { portefeuilleId: epargne.id, montant: 40000, hashTexte: sim.hashTexte }, { ip: '127.0.0.1' });
        const ep = await Portefeuille.findByPk(epargne.id);
        verifier('l argent ne bouge pas : le solde reste ' + EPARGNE, arrondir(ep.solde) === EPARGNE);
        verifier('le disponible baisse de 40 000', Fonds.disponible(ep) === EPARGNE - 40000 && Fonds.reserve(ep) === 40000);
        verifier('couverture annoncee : ' + r.couverture + ' %', r.couverture === 66.67);
        const consentement = await TontineConsentementGarantie.findByPk(r.consentement.id);
        verifier('le texte exact est conserve avec son empreinte',
            consentement.texte === sim.texte && consentement.hashTexte === sim.hashTexte);

        // --- 4. L'argent bloque ne sort pas -------------------------------
        titre('4. L argent bloque ne sort par aucun chemin');
        const PaiementService = require('../services/paiement/paiement.service').PaiementService;
        await doitEchouer('pas de retrait Mobile Money au-dela du disponible', 402,
            () => PaiementService.initierRetrait(defaultClient(defaillantId), {
                montant: 70000, telephone: '670000000', portefeuilleId: epargne.id, accepterRisque: true }));
        await doitEchouer('pas de liberation tant que la rotation court', 409,
            () => GarantieService.liberer({ clientId: defaillantId }, r.garantie.id));
        await doitEchouer('pas de liberation par un autre membre', 403,
            () => GarantieService.liberer({ clientId: defaillantId === awa.id ? bertrand.id : awa.id }, r.garantie.id));

        // --- 5. Confidentialite -------------------------------------------
        titre('5. Ce que voit le president');
        const vue = await GarantieService.garantiesGroupe(awa.id, groupe.id);
        const ligne = vue.membres.find(m => m.clientId === defaillantId);
        verifier('le president voit le montant garanti et la couverture',
            ligne && ligne.garanties === 40000 && ligne.couverture === 66.67);
        verifier('mais pas la source : ni portefeuille, ni type',
            ligne && !('portefeuilleId' in ligne) && !('type' in ligne) && !('source' in ligne));
        const simpleMembre = clients.find(c => c.id !== awa.id && c.id !== defaillantId);
        await doitEchouer('un simple membre ne consulte pas les garanties des autres', 403,
            () => GarantieService.garantiesGroupe(simpleMembre.id, groupe.id));

        // --- 6. Impaye a l'echeance ---------------------------------------
        titre('6. Le defaillant ne paie pas');
        for (const c of cotisations1) {
            if (c.clientId !== defaillantId) await CycleService.cotiser(c.clientId, cycle1.id);
        }
        await cycle1.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        const rapport = await CycleService.traiterEcheances();
        verifier('la garantie couvre la cotisation manquante : 20 000',
            rapport.garantiesMobilisees === 1 && rapport.montantGaranties === MONTANT, JSON.stringify(rapport));

        const ep2 = await Portefeuille.findByPk(epargne.id);
        verifier('seul le manque est preleve : 20 000 sur 40 000',
            arrondir(ep2.solde) === EPARGNE - MONTANT && Fonds.reserve(ep2) === 40000 - MONTANT);
        verifier('le disponible du membre ne bouge pas',
            Fonds.disponible(ep2) === EPARGNE - 40000);
        const cotDef = await TontineCotisation.findByPk(cotisations1[0].id);
        verifier('la cotisation est soldee', cotDef.statut === 'payee');
        verifier('le cycle quitte le defaut : le pot est complet',
            (await TontineCycle.findByPk(cycle1.id)).statut === 'actif');
        const g1 = await TontineGarantie.findByPk(r.garantie.id);
        verifier('garantie partiellement utilisee', g1.statut === 'partiellement_utilisee'
            && arrondir(g1.montantUtilise) === MONTANT);

        // Invariant : la reserve du portefeuille = ce que ses garanties bloquent.
        verifier('la reserve du portefeuille egale ses garanties bloquees',
            Fonds.reserve(ep2) === await GarantieService.totalBloque(defaillantId, groupe.id));

        // --- 7. Fin de rotation -------------------------------------------
        titre('7. La rotation va au bout');
        const courants = {};
        for (const c of clients) {
            const pf = await portefeuilleDe(c.id, 'courant');
            await pf.update({ solde: arrondir(pf.solde) + 5 * MONTANT });   // de quoi cotiser jusqu au bout
            courants[c.id] = pf.id;
        }
        let cycle = cycle1;
        for (let n = 1; n <= 4; n++) {
            if (n > 1) {
                cycle = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: n } });
                const cots = await TontineCotisation.findAll({ where: { cycleId: cycle.id } });
                for (const c of cots) {
                    // L'amende de retard du cycle 1 bloque la cotisation
                    // suivante tant qu'elle n'est pas reglee.
                    const { amendes } = await AmendeService.mesAmendes(c.clientId, groupe.id);
                    for (const a of amendes.filter(x => x.statut === 'due')) await AmendeService.payer(c.clientId, a.id);
                    await CycleService.cotiser(c.clientId, cycle.id);
                }
            }
            await CycleService.verser({ clientId: awa.id }, cycle.id);
        }
        const gFin = await TontineGarantie.findByPk(r.garantie.id);
        const epFin = await Portefeuille.findByPk(epargne.id);
        verifier('la tontine est achevee', (await TontineGroupe.findByPk(groupe.id)).statut === 'termine');
        verifier('le reste de la garantie est rendu : 20 000 liberes',
            arrondir(gFin.montantLibere) === 20000 && gFin.statut === 'liberee', gFin.statut);
        verifier('plus rien n est bloque sur le portefeuille', Fonds.reserve(epFin) === 0);
        verifier('le membre a garde tout ce qui n a pas servi : 80 000',
            arrondir(epFin.solde) === EPARGNE - MONTANT);

        const mouvements = await TontineGarantieMouvement.findAll({ where: { garantieId: r.garantie.id }, order: [['id', 'ASC']] });
        verifier('l histoire est complete : blocage, mobilisation, liberation',
            mouvements.map(m => m.sens).join(',') === 'blocage,mobilisation,liberation');
        const mob = mouvements.find(m => m.sens === 'mobilisation');
        verifier('la mobilisation est attribuee au systeme, avec sa piece comptable',
            mob.acteurType === 'SYSTEME' && !!mob.transactionId);

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder && groupe) {
            titre('Nettoyage');
            const g = await TontineGroupe.findByPk(groupe.id);
            const ids = g ? [g.portefeuilleId, g.portefeuilleCautionId].filter(Boolean) : [];
            const garanties = await TontineGarantie.findAll({ where: { groupeId: groupe.id }, attributes: ['id', 'consentementId'] });
            await TontineGarantieMouvement.destroy({ where: { garantieId: garanties.map(x => x.id) } });
            await TontineGarantie.destroy({ where: { groupeId: groupe.id } });
            await TontineConsentementGarantie.destroy({ where: { groupeId: groupe.id } });
            await Transaction.destroy({ where: { groupeTontineId: groupe.id } });
            if (g) await g.destroy();
            if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            // La reserve d'abord : la contrainte interdit qu'elle depasse le solde.
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

function defaultClient(id) { return id; }

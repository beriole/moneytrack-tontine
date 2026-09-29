/**
 * Scenario : le grand livre en partie double (section 30).
 *
 *   1. ce que le grand livre refuse : une face, un desequilibre, un
 *      montant nul
 *   2. l'argent qui entre et qui sort : la frontiere est ecrite aussi
 *   3. une tontine complete : chaque mouvement a deux faces, nommees
 *   4. une garantie mobilisee : UN mouvement, pas deux demi-mouvements
 *   5. la preuve : sur le perimetre du scenario, la variation des soldes
 *      egale exactement celle des comptes du livre
 *   6. rejeu : deux fois la meme reference, un seul mouvement
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-ledger.js [--garder]
 */

const { Op } = require('sequelize');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction,
    LedgerCompte, LedgerMouvement, LedgerEcriture,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const GarantieService = require('../services/tontine/garantie.service');
const { LedgerService } = require('../services/ledger.service');
const Fonds = require('../services/fonds.service');
const { arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local'];
const MONTANT = 20000;
const NOM_GROUPE = 'Scenario Ledger';
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

/** Solde d'un portefeuille selon le grand livre. */
async function auLivre(portefeuilleId) {
    const compte = await LedgerCompte.findOne({ where: { portefeuilleId } });
    if (!compte) return 0;
    return LedgerService.soldeCompte(compte.id);
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

    const suivis = [];
    const initiaux = {};
    for (const c of clients) {
        for (const type of ['courant', 'epargne']) {
            const pf = await portefeuilleDe(c.id, type);
            if (pf) { initiaux[pf.id] = { solde: pf.solde, reserve: Fonds.reserve(pf) }; suivis.push(pf.id); }
        }
    }
    const maxMouvement = (await LedgerMouvement.max('id')) || 0;
    // Photo de depart : solde reel et solde au livre, pour comparer les
    // VARIATIONS — la base de demonstration porte l'histoire des autres
    // scenarios, qui posent des soldes a la main.
    const depart = {};
    for (const id of suivis) {
        const pf = await Portefeuille.findByPk(id);
        depart[id] = { solde: arrondir(pf.solde), livre: await auLivre(id) };
    }

    console.log('SCENARIO LEDGER — 3 membres, ' + MONTANT + ' XAF/periode');
    let groupe;
    const crees = [];

    try {
        // --- 1. Ce que le livre refuse ------------------------------------
        titre('1. Un mouvement se tient, ou il n existe pas');
        const pfAwa = await portefeuilleDe(awa.id, 'courant');
        const compteAwa = await LedgerService.comptePortefeuille(pfAwa);
        const externe = await LedgerService.compte(LedgerService.COMPTES.EXTERNE_MOBILE_MONEY);

        await doitEchouer('une seule face est refusee', 400, () => LedgerService.enregistrer({
            type: 'essai', ecritures: [{ compte: compteAwa, sens: 'credit', montant: 1000 }]
        }));
        await doitEchouer('un desequilibre est refuse', 409, () => LedgerService.enregistrer({
            type: 'essai',
            ecritures: [
                { compte: compteAwa, sens: 'credit', montant: 1000 },
                { compte: externe, sens: 'debit', montant: 900 }
            ]
        }));
        await doitEchouer('un montant nul est refuse', 400, () => LedgerService.enregistrer({
            type: 'essai',
            ecritures: [
                { compte: compteAwa, sens: 'credit', montant: 0 },
                { compte: externe, sens: 'debit', montant: 0 }
            ]
        }));
        verifier('aucun de ces essais n a laisse de trace',
            (await LedgerMouvement.count({ where: { type: 'essai' } })) === 0);

        // --- 2. Entrees et sorties ----------------------------------------
        titre('2. L argent qui entre, l argent qui sort');
        const avantEntree = arrondir((await Portefeuille.findByPk(pfAwa.id)).solde);
        await Fonds.entree(await Portefeuille.findByPk(pfAwa.id), 5 * MONTANT, null, {
            type: 'recharge', reference: `LEDGER-TEST-E-${Date.now()}`, clientId: awa.id, description: 'Recette — entree'
        });
        const apresEntree = arrondir((await Portefeuille.findByPk(pfAwa.id)).solde);
        const dernier = await LedgerMouvement.findOne({ order: [['id', 'DESC']] });
        const faces = await LedgerEcriture.findAll({ where: { mouvementId: dernier.id } });
        verifier('le solde monte et le mouvement a deux faces',
            apresEntree === avantEntree + 5 * MONTANT && faces.length === 2);
        verifier('la contrepartie est le monde exterieur, au debit',
            faces.some(f => f.compteId === externe.id && f.sens === 'debit'),
            'une entree ne vient pas de nulle part');

        // --- 3. Une tontine complete --------------------------------------
        titre('3. Une tontine, du premier franc au dernier');
        for (const c of clients) {
            const pf = await portefeuilleDe(c.id, 'courant');
            // Meme une mise en place passe par le livre : sinon le controle
            // final comparerait des variations que le livre ignore.
            await Fonds.ajuster(pf, 'credit', 3 * MONTANT, null, {
                type: 'ajustement', clientId: c.id, description: 'Recette — approvisionnement'
            });
        }
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, montantParPeriode: MONTANT, frequence: 'mensuelle',
            membresMax: 3, modeOrdre: 'tirage', pourcentageCaution: 50
        });
        for (const c of clients.slice(1)) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        const CautionService = require('../services/tontine/caution.service');
        for (const c of clients) await CautionService.bloquer(c.id, groupe.id);
        await GroupeService.demarrerGroupe(awa.id, groupe.id);
        const g = await TontineGroupe.findByPk(groupe.id);
        for (const id of [g.portefeuilleId, g.portefeuilleCautionId]) { if (id) suivis.push(id); }
        for (const id of [g.portefeuilleId, g.portefeuilleCautionId]) {
            if (id) depart[id] = { solde: 0, livre: 0 };
        }

        const cycle1 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        const cots = await TontineCotisation.findAll({ where: { cycleId: cycle1.id } });
        for (const c of cots) await CycleService.cotiser(c.clientId, cycle1.id);
        await CycleService.verser({ clientId: awa.id }, cycle1.id);

        const types = await LedgerMouvement.findAll({
            where: { groupeTontineId: groupe.id }, attributes: ['type', 'montant', 'id']
        });
        const parType = types.reduce((acc, m) => ({ ...acc, [m.type]: (acc[m.type] || 0) + 1 }), {});
        verifier('chaque geste a son mouvement : caution, cotisation, versement, frais',
            parType.caution_blocage === 3 && parType.cotisation === 2 && parType.versement === 1 && parType.frais_plateforme >= 1,
            JSON.stringify(parType));
        const toutesFaces = await LedgerEcriture.findAll({ where: { mouvementId: types.map(m => m.id) } });
        verifier('aucun mouvement n a moins de deux faces',
            types.every(m => toutesFaces.filter(f => f.mouvementId === m.id).length >= 2));
        verifier('chaque mouvement porte son total au debit comme au credit',
            types.every(m => {
                const f = toutesFaces.filter(x => x.mouvementId === m.id);
                const d = arrondir(f.filter(x => x.sens === 'debit').reduce((s, x) => s + Number(x.montant), 0));
                const c = arrondir(f.filter(x => x.sens === 'credit').reduce((s, x) => s + Number(x.montant), 0));
                return d === c && d === arrondir(m.montant);
            }));

        // --- 4. Une garantie mobilisee ------------------------------------
        titre('4. Une garantie mobilisee est UN mouvement');
        const cycle2 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 2 } });
        const cots2 = await TontineCotisation.findAll({ where: { cycleId: cycle2.id } });
        const defaillant = clients.find(c => c.id === cots2[0].clientId);
        let epargne = await portefeuilleDe(defaillant.id, 'epargne');
        if (!epargne) {
            epargne = await Portefeuille.create({
                nom: 'Epargne (scenario ledger)', solde: 0, devise: 'XAF', typePortefeuille: 'epargne',
                estPrincipal: false, estActif: true, ClientPortefeuilleId: defaillant.id
            });
            crees.push(epargne.id);
            suivis.push(epargne.id);
            depart[epargne.id] = { solde: 0, livre: 0 };
        }
        await Fonds.ajuster(await Portefeuille.findByPk(epargne.id), 'credit', 2 * MONTANT, null, {
            type: 'ajustement', clientId: defaillant.id, description: 'Recette — epargne a garantir'
        });
        // Ce qui reste a couvrir, caution deduite : bloquer davantage serait
        // refuse — une garantie ne protege pas au-dela de l'engagement.
        const CouvertureService = require('../services/tontine/couverture.service');
        const c = await CouvertureService.pourMembre(defaillant.id, groupe.id);
        const aGarantir = arrondir(c.exposition - c.couvert);
        verifier('il reste un engagement a garantir', aGarantir > 0, `${aGarantir} FCFA`);
        const sim = await GarantieService.simuler(defaillant.id, groupe.id, epargne.id, aGarantir);
        await GarantieService.affecter(defaillant.id, groupe.id,
            { portefeuilleId: epargne.id, montant: aGarantir, hashTexte: sim.hashTexte });
        for (const c of cots2) { if (c.clientId !== defaillant.id) await CycleService.cotiser(c.clientId, cycle2.id); }
        await cycle2.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        await CycleService.traiterEcheances();

        const mobilisations = await LedgerMouvement.findAll({
            where: { groupeTontineId: groupe.id, type: 'garantie_mobilisation' }
        });
        verifier('la mobilisation existe, et une seule fois', mobilisations.length === 1);
        const facesMob = await LedgerEcriture.findAll({ where: { mouvementId: mobilisations[0].id } });
        verifier('elle a deux faces : l epargne du membre et la caisse du groupe',
            facesMob.length === 2 && facesMob.some(f => f.sens === 'debit') && facesMob.some(f => f.sens === 'credit'),
            'l argent bloque ne sort pas de nulle part');

        // --- 5. La preuve --------------------------------------------------
        titre('5. Les soldes et le livre varient ensemble');
        let concordants = 0;
        const divergents = [];
        for (const id of [...new Set(suivis)]) {
            const pf = await Portefeuille.findByPk(id);
            if (!pf) continue;
            const variationSolde = arrondir(arrondir(pf.solde) - depart[id].solde);
            const variationLivre = arrondir((await auLivre(id)) - depart[id].livre);
            if (Math.abs(variationSolde - variationLivre) > 0.004) divergents.push(`PF:${id} ${variationSolde} vs ${variationLivre}`);
            else concordants++;
        }
        verifier(`les ${concordants} portefeuilles du scenario concordent au centime`,
            divergents.length === 0, divergents.join(' | '));

        const [[global]] = await db.query(
            "SELECT COALESCE(SUM(CASE WHEN sens = 'debit' THEN montant ELSE -montant END), 0) ecart FROM ledger_ecritures");
        verifier('et le grand livre entier reste a zero', Math.abs(Number(global.ecart)) < 0.005, String(global.ecart));

        // --- 6. Rejeu -------------------------------------------------------
        titre('6. Deux fois la meme reference');
        const reference = `LEDGER-REJEU-${Date.now()}`;
        const ecritures = [
            { compte: compteAwa, sens: 'credit', montant: 1000 },
            { compte: externe, sens: 'debit', montant: 1000 }
        ];
        const premier = await LedgerService.enregistrer({ reference, type: 'essai_rejeu', ecritures });
        const second = await LedgerService.enregistrer({ reference, type: 'essai_rejeu', ecritures });
        verifier('le second appel rend le premier mouvement, sans en creer un autre',
            premier.id === second.id && (await LedgerMouvement.count({ where: { reference } })) === 1);
        verifier('et ses faces ne sont pas doublees',
            (await LedgerEcriture.count({ where: { mouvementId: premier.id } })) === 2);

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            // Les mouvements du scenario partent ; le grand livre reste
            // equilibre puisqu'on retire des mouvements entiers.
            const mouvements = await LedgerMouvement.findAll({
                where: { id: { [Op.gt]: maxMouvement } }, attributes: ['id']
            });
            if (mouvements.length) {
                await LedgerEcriture.destroy({ where: { mouvementId: mouvements.map(m => m.id) } });
                await LedgerMouvement.destroy({ where: { id: mouvements.map(m => m.id) } });
            }
            if (groupe) {
                const g = await TontineGroupe.findByPk(groupe.id);
                const ids = g ? [g.portefeuilleId, g.portefeuilleCautionId].filter(Boolean) : [];
                const garanties = await models.TontineGarantie.findAll({ where: { groupeId: groupe.id }, attributes: ['id'] });
                await models.TontineGarantieMouvement.destroy({ where: { garantieId: garanties.map(x => x.id) } });
                await models.TontineGarantie.destroy({ where: { groupeId: groupe.id } });
                await models.TontineConsentementGarantie.destroy({ where: { groupeId: groupe.id } });
                await Transaction.destroy({ where: { groupeTontineId: groupe.id } });
                if (g) await g.destroy();
                if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            }
            for (const [id, etat] of Object.entries(initiaux)) {
                await Portefeuille.update({ montantReserve: 0 }, { where: { id } });
                await Portefeuille.update({ solde: etat.solde, montantReserve: etat.reserve }, { where: { id } });
            }
            if (crees.length) {
                await Portefeuille.update({ montantReserve: 0 }, { where: { id: crees } });
                await Portefeuille.destroy({ where: { id: crees } });
            }
            console.log('  groupe, garanties, mouvements et ecritures du scenario supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

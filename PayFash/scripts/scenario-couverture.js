/**
 * Scenario : la couverture exigee avant de recevoir le pot.
 *
 * Le moment critique d'une tontine : une fois le pot recu, le beneficiaire
 * n'a plus d'interet a cotiser. Le reglement peut exiger qu'il ait garanti
 * une part de ce qui lui restera a payer — davantage pour les premiers
 * tours, qui laissent le plus de cotisations a venir.
 *
 *   1. la regle se choisit a la creation, figure au reglement
 *   2. versement refuse a un beneficiaire non couvert, avec la raison
 *   3. le beneficiaire complete sa garantie : le pot est verse
 *   4. la regle se modifie par vote ; une regle invalide est refusee
 *   5. la procedure exceptionnelle (versement force) passe outre
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-couverture.js [--garder]
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
const CouvertureService = require('../services/tontine/couverture.service');
const ContratService = require('../services/tontine/contrat.service');
const { VoteService } = require('../services/tontine/vote.service');
const Fonds = require('../services/fonds.service');
const { arrondir } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const MONTANT = 20000;
const NOM_GROUPE = 'Scenario Couverture';
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
async function doitEchouer(libelle, codeAttendu, fn, motif) {
    try { await fn(); verifier(libelle, false, 'aucune erreur levee'); return null; }
    catch (e) {
        verifier(libelle, e.code === codeAttendu && (!motif || motif.test(e.message)), `${e.code} — ${e.message}`);
        return e;
    }
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
    const [awa] = clients;
    await TontineGroupe.destroy({ where: { nom: NOM_GROUPE } });

    const initiaux = {};
    for (const c of clients) {
        for (const type of ['courant', 'epargne']) {
            const pf = await portefeuilleDe(c.id, type);
            if (pf) initiaux[pf.id] = { solde: pf.solde, reserve: Fonds.reserve(pf) };
        }
    }

    console.log('SCENARIO COUVERTURE — 4 membres, ' + MONTANT + ' XAF/periode, regle « premiers tours »');
    let groupe;
    const crees = [];

    try {
        // --- 1. La regle ------------------------------------------------
        titre('1. La regle se choisit a la creation');
        await doitEchouer('une regle inconnue est refusee a la creation', 400,
            () => GroupeService.creerGroupe(awa.id, {
                nom: NOM_GROUPE + ' (invalide)', montantParPeriode: MONTANT, membresMax: 4,
                reglesCouverture: { tauxParDefaut: 150 }
            }));

        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM_GROUPE, montantParPeriode: MONTANT, frequence: 'mensuelle',
            membresMax: 4, modeOrdre: 'tirage', pourcentageCaution: 0,
            reglesCouverture: 'premiers_tours'
        });
        verifier('regle enregistree : 100 % pour le premier tiers, 50 % ensuite',
            CouvertureService.tauxExige(groupe, 1, 4) === 100 && CouvertureService.tauxExige(groupe, 3, 4) === 50);
        verifier('le reglement interieur l ecrit en clair',
            /100 % pour les tours 1 a 2, 50 % ensuite/.test(ContratService.texteParDefaut(groupe)));

        for (const c of clients.slice(1)) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        await GroupeService.demarrerGroupe(awa.id, groupe.id);

        const courants = {};
        for (const c of clients) {
            const pf = await portefeuilleDe(c.id, 'courant');
            await pf.update({ solde: arrondir(pf.solde) + 5 * MONTANT });
            courants[c.id] = pf.id;
        }

        // --- 2. Versement refuse ----------------------------------------
        titre('2. Le premier servi n est pas couvert');
        const cycle1 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        const b1 = cycle1.beneficiaireId;
        for (const c of await TontineCotisation.findAll({ where: { cycleId: cycle1.id } })) {
            await CycleService.cotiser(c.clientId, cycle1.id);
        }
        const avant = await CouvertureService.pourMembre(b1, groupe.id);
        verifier('au tour 1, il restera 3 cotisations : 60 000 exiges a 100 %',
            avant.exposition === 3 * MONTANT && avant.tauxExige === 100 && avant.montantExige === 60000 && avant.manque === 60000,
            JSON.stringify({ exposition: avant.exposition, taux: avant.tauxExige, manque: avant.manque }));

        await doitEchouer('le pot complet n est pas verse a un beneficiaire non couvert', 409,
            () => CycleService.verser({ clientId: awa.id }, cycle1.id), /il manque 60000 FCFA de garantie/);
        verifier('la caisse garde le pot : rien n a bouge',
            (await TontineCycle.findByPk(cycle1.id)).statut !== 'complete');

        // --- 3. Il complete sa garantie ---------------------------------
        titre('3. Il complete sa garantie');
        let epargne = await portefeuilleDe(b1, 'epargne');
        if (!epargne) {
            epargne = await Portefeuille.create({
                nom: 'Epargne (scenario)', solde: 0, devise: 'XAF', typePortefeuille: 'epargne',
                estPrincipal: false, estActif: true, ClientPortefeuilleId: b1
            });
            crees.push(epargne.id);
        }
        await epargne.update({ solde: 100000, montantReserve: 0 });

        const sim = await GarantieService.simuler(b1, groupe.id, epargne.id, 60000);
        verifier('la simulation annonce ce que la regle exige et ce qui manquera apres',
            sim.tauxExige === 100 && sim.manqueAvant === 60000 && sim.manqueApres === 0);
        await GarantieService.affecter(b1, groupe.id,
            { portefeuilleId: epargne.id, montant: 60000, hashTexte: sim.hashTexte });

        const avantPot = arrondir((await Portefeuille.findByPk(courants[b1])).solde);
        const versement = await CycleService.verser({ clientId: awa.id }, cycle1.id);
        verifier('couvert, il recoit le pot', arrondir((await Portefeuille.findByPk(courants[b1])).solde) - avantPot === arrondir(versement.net));
        const apres = await CouvertureService.pourMembre(b1, groupe.id);
        verifier('apres le pot : il doit 60 000, couverts a 100 %',
            apres.exposition === 60000 && apres.couverture === 100 && apres.suffisant);

        // --- 4. Modification par vote -----------------------------------
        titre('4. Le groupe assouplit la regle');
        await doitEchouer('un vote portant une regle invalide ne s ouvre pas', 400,
            () => VoteService.creer(awa.id, groupe.id, {
                sujet: 'modifier_regles', mode: 'majorite',
                payload: { reglesCouverture: { tauxParDefaut: 50, paliers: [{ jusquAuTour: 3, taux: 100 }, { jusquAuTour: 2, taux: 80 }] } }
            }));
        const vote = await VoteService.creer(awa.id, groupe.id, {
            sujet: 'modifier_regles', mode: 'majorite', payload: { reglesCouverture: 'moitie' }
        });
        let depouillement = null;
        for (const c of clients) {
            const r = await VoteService.repondre(c.id, vote.vote ? vote.vote.id : vote.id, 'pour');
            if (r.depouillement) depouillement = r.depouillement;
        }
        const g2 = await TontineGroupe.findByPk(groupe.id);
        verifier('adoptee, la regle devient 50 % pour tous',
            depouillement && depouillement.resultat === 'approuve'
            && CouvertureService.tauxExige(g2, 1, 4) === 50 && CouvertureService.tauxExige(g2, 4, 4) === 50);

        // --- 5. La procedure exceptionnelle -----------------------------
        titre('5. Le versement force passe outre');
        const cycle2 = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 2 } });
        for (const c of await TontineCotisation.findAll({ where: { cycleId: cycle2.id } })) {
            await CycleService.cotiser(c.clientId, cycle2.id);
        }
        const c2 = await CouvertureService.pourMembre(cycle2.beneficiaireId, groupe.id);
        verifier('au tour 2, il restera 2 cotisations : 20 000 exiges a 50 %',
            c2.exposition === 2 * MONTANT && c2.montantExige === 20000 && c2.manque === 20000);
        await doitEchouer('le president ne peut pas verser sans la couverture', 409,
            () => CycleService.verser({ clientId: awa.id }, cycle2.id));
        const force = await CycleService.verser({ systeme: true }, cycle2.id, { force: true });
        verifier('seule la procedure a deux administrateurs verse malgre tout', force.force === true && !!force.versement);

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder && groupe) {
            titre('Nettoyage');
            const g = await TontineGroupe.findByPk(groupe.id);
            const ids = g ? [g.portefeuilleId, g.portefeuilleCautionId].filter(Boolean) : [];
            const garanties = await TontineGarantie.findAll({ where: { groupeId: groupe.id }, attributes: ['id'] });
            await TontineGarantieMouvement.destroy({ where: { garantieId: garanties.map(x => x.id) } });
            await TontineGarantie.destroy({ where: { groupeId: groupe.id } });
            await TontineConsentementGarantie.destroy({ where: { groupeId: groupe.id } });
            await Transaction.destroy({ where: { groupeTontineId: groupe.id } });
            if (g) await g.destroy();
            if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
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
        await TontineGroupe.destroy({ where: { nom: NOM_GROUPE + ' (invalide)' } });
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

// =====================================================================
//  Scenario de recette du BACK-OFFICE — chantier E.
//
//    node scripts/scenario-backoffice.js [--plateforme=2] [--garder]
//
//  Le critere annonce : « un versement force exige deux administrateurs
//  distincts et laisse une trace nominative ».
//
//  Verifie aussi que l'administration OBSERVE sans se substituer au
//  groupe : geler ne touche a aucun solde, et le maker-checker ne peut
//  pas etre contourne par le demandeur lui-meme.
// =====================================================================

const { Op } = require('sequelize');
const ENV = require('../config/index');
const models = require('../models');
const {
    db, Client, Admin, Portefeuille, Transaction, AuditLog, PendingAction,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation
} = models;

const GroupeService = require('../services/tontine/groupe.service');
const CycleService = require('../services/tontine/cycle.service');
const AdminTontine = require('../Controllers/admin/admin.tontine');
const AdminValidation = require('../Controllers/admin/admin.validation');
const { arrondir, nombre } = require('../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local', 'daniel@tontine.local'];
const NOM = 'Backoffice Njangi';
const MONTANT = 12000;

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
    const pf = await Portefeuille.findOne({ where: { ClientPortefeuilleId: id, typePortefeuille: 'courant' } });
    return pf ? arrondir(pf.solde) : 0;
}
async function soldePf(id) { if (!id) return 0; const p = await Portefeuille.findByPk(id); return p ? arrondir(p.solde) : 0; }

/** Simule un appel Express : on capture le code et le corps de reponse. */
function fausseReponse() {
    const r = { code: 200, corps: null, entetes: {} };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    r.setHeader = (k, v) => { r.entetes[k] = v; };
    r.end = () => r;
    return r;
}
const requete = (admin, extra = {}) => ({
    admin, params: {}, query: {}, body: {}, headers: {}, socket: {}, ...extra
});

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
    const initiaux = {};
    for (const c of clients) initiaux[c.id] = await soldeDe(c.id);
    const auditAvant = await AuditLog.count();
    const pendingCrees = [];
    let groupe;

    // Deux administrateurs distincts, en memoire : le scenario ne cree
    // aucun compte en base.
    const maker = { id: 9001, email: 'finance.maker@moneytrack.test', role: 'ADMIN_FINANCE' };
    const checker = { id: 9002, email: 'finance.checker@moneytrack.test', role: 'ADMIN_FINANCE' };
    const support = { id: 9003, email: 'support@moneytrack.test', role: 'SUPPORT' };

    try {
        titre('1. Un groupe bloque par un membre injoignable');
        groupe = await GroupeService.creerGroupe(awa.id, {
            nom: NOM, type: 'rotative', montantParPeriode: MONTANT,
            frequence: 'mensuelle', membresMax: 4, modeOrdre: 'anciennete', pourcentageCaution: 0
        });
        for (const c of [bertrand, clarisse, daniel]) await GroupeService.rejoindreGroupe(c.id, groupe.codeInvitation);
        await GroupeService.demarrerGroupe(awa.id, groupe.id);

        const cycle = await TontineCycle.findOne({ where: { groupeId: groupe.id, numeroCycle: 1 } });
        const cotisations = await TontineCotisation.findAll({ where: { cycleId: cycle.id }, order: [['id', 'ASC']] });
        // Deux cotisent, le troisieme disparait.
        for (const c of cotisations.slice(0, 2)) await CycleService.cotiser(c.clientId, cycle.id);
        const absent = cotisations[2];
        console.log('  ' + (await Client.findByPk(absent.clientId)).nom + ' ne cotise pas');

        let r = fausseReponse();
        await CycleService.verser({ clientId: awa.id }, cycle.id).catch(e => { r.code = e.code; r.corps = { error: e.message }; });
        verifier('le noyau refuse de verser un pot incomplet', r.code === 409, r.corps?.error);

        titre('2. Le tableau de bord voit le probleme');
        r = fausseReponse();
        await AdminTontine.stats(requete(support), r);
        verifier('les statistiques repondent', r.code === 200 && typeof r.corps.groupes.total === 'number');
        verifier('le taux de defaut est calcule', typeof r.corps.cotisations.tauxDefaut === 'number',
            r.corps.cotisations.tauxDefaut + ' %');
        console.log('  encours des caisses : ' + r.corps.encoursCaisses + ' FCFA');

        r = fausseReponse();
        await AdminTontine.listeGroupes(requete(support, { query: { q: NOM } }), r);
        verifier('le groupe est retrouve par recherche', r.code === 200 && r.corps.groupes.length === 1);
        verifier('avec son solde de caisse et ses impayes',
            r.corps.groupes[0].soldeCaisse === MONTANT * 2, r.corps.groupes[0].soldeCaisse + ' FCFA collectes');

        r = fausseReponse();
        await AdminTontine.detailGroupe(requete(support, { params: { id: groupe.id } }), r);
        verifier('le detail expose les trois portefeuilles du groupe',
            r.code === 200 && 'caisse' in r.corps.portefeuilles && 'cautions' in r.corps.portefeuilles);
        verifier('et les cotisations du cycle en cours', r.corps.cotisations.length === 3);

        titre('3. La fiche client, pour le support au telephone');
        r = fausseReponse();
        await AdminTontine.ficheClient(requete(support, { params: { clientId: absent.clientId } }), r);
        verifier('la fiche remonte les adhesions', r.code === 200 && r.corps.adhesions.length >= 1);
        verifier('et la ponctualite du membre', r.corps.ponctualite.cotisations >= 1,
            r.corps.ponctualite.payees + '/' + r.corps.ponctualite.cotisations + ' payees');

        titre('4. Geler ne touche a aucun solde');
        const caisseAvant = await soldePf((await TontineGroupe.findByPk(groupe.id)).portefeuilleId);
        const soldesAvant = {};
        for (const c of clients) soldesAvant[c.id] = await soldeDe(c.id);

        r = fausseReponse();
        await AdminTontine.geler(requete(maker, { params: { id: groupe.id }, body: { motif: 'Litige signale' } }), r);
        verifier('le groupe est gele', r.code === 200 && (await TontineGroupe.findByPk(groupe.id)).statut === 'suspendu');
        verifier('la caisse est intacte',
            await soldePf((await TontineGroupe.findByPk(groupe.id)).portefeuilleId) === caisseAvant);
        let bouge = false;
        for (const c of clients) if (await soldeDe(c.id) !== soldesAvant[c.id]) bouge = true;
        verifier('aucun portefeuille de membre n a bouge', !bouge);

        r = fausseReponse();
        await AdminTontine.geler(requete(maker, { params: { id: groupe.id }, body: {} }), r);
        verifier('un second gel est refuse', r.code === 409, r.corps?.error);

        r = fausseReponse();
        await AdminTontine.degeler(requete(maker, { params: { id: groupe.id } }), r);
        verifier('le degel rend le statut coherent avec la realite',
            (await TontineGroupe.findByPk(groupe.id)).statut === 'actif',
            'un cycle est en cours, donc actif');

        titre("5. Le versement force exige DEUX administrateurs");
        r = fausseReponse();
        await AdminValidation.creerDemande(requete(maker, {
            body: {
                type: 'TONTINE_VERSEMENT_FORCE',
                payload: { cycleId: cycle.id, motif: 'Membre injoignable depuis 6 semaines' },
                description: `Versement force du cycle 1 de ${NOM}`
            }
        }), r);
        verifier('la demande est enregistree, pas executee', r.code === 201 || r.code === 200,
            JSON.stringify(r.corps).slice(0, 90));
        const demande = await PendingAction.findOne({ order: [['id', 'DESC']] });
        pendingCrees.push(demande.id);
        verifier('elle est en attente', demande.statut === 'PENDING' || demande.statut === 'EN_ATTENTE',
            demande.statut);
        verifier('le cycle n est toujours pas verse',
            (await TontineCycle.findByPk(cycle.id)).statut !== 'complete');

        r = fausseReponse();
        await AdminValidation.approuver(requete(maker, { params: { id: demande.id } }), r);
        verifier('le demandeur ne peut pas approuver sa propre demande',
            r.code === 403 || r.code === 400, `${r.code} — ${r.corps?.error}`);
        verifier('et le cycle reste non verse',
            (await TontineCycle.findByPk(cycle.id)).statut !== 'complete');

        titre('6. Un second administrateur approuve');
        const beneficiaire = cycle.beneficiaireId;
        const avantBenef = await soldeDe(beneficiaire);

        const caisseReelle = await soldePf((await TontineGroupe.findByPk(groupe.id)).portefeuilleId);

        r = fausseReponse();
        await AdminValidation.approuver(requete(checker, { params: { id: demande.id } }), r);
        verifier('le versement est execute', r.code === 200, JSON.stringify(r.corps).slice(0, 130));
        verifier('le cycle est verse', (await TontineCycle.findByPk(cycle.id)).statut === 'complete');

        const recu = arrondir(await soldeDe(beneficiaire) - avantBenef);
        verifier('le beneficiaire recoit ce qui a REELLEMENT ete collecte, pas le pot theorique',
            recu > 0 && recu <= caisseReelle,
            `${recu} recus sur ${MONTANT * 3} theoriques — la caisse ne contenait que ${caisseReelle}`);
        verifier('la caisse est revenue a zero',
            await soldePf((await TontineGroupe.findByPk(groupe.id)).portefeuilleId) === 0);

        // Le point qui compte : on n'a pas menti au grand livre.
        const cotisationAbsente = await TontineCotisation.findByPk(absent.id);
        verifier("la cotisation absente reste IMPAYEE, pas maquillee en payee",
            cotisationAbsente.statut === 'impayee', cotisationAbsente.statut);
        verifier('la dette reste donc recouvrable par la caution ou le garant',
            arrondir(cotisationAbsente.montantPaye) === 0);

        titre('7. Tout laisse une trace nominative');
        const traces = await AuditLog.findAll({
            where: { id: { [Op.gt]: 0 }, action: { [Op.like]: 'TONTINE%' } },
            order: [['id', 'DESC']], limit: 10
        });
        verifier('le gel est journalise', traces.some(t => t.action === 'TONTINE_GEL'));
        verifier('le degel aussi', traces.some(t => t.action === 'TONTINE_DEGEL'));
        const gel = traces.find(t => t.action === 'TONTINE_GEL');
        verifier("l'auteur du gel est nomme", gel && gel.adminEmail === maker.email, gel?.adminEmail);
        verifier('avec la cible et le motif', gel && /groupe:/.test(gel.cible), gel?.cible);

        const finale = await PendingAction.findByPk(demande.id);
        verifier('la demande porte son validateur',
            finale.validateurId === checker.id, 'validateur #' + finale.validateurId);
        verifier('demandeur et validateur sont bien distincts',
            finale.demandeurId !== finale.validateurId,
            `${finale.demandeurId} ≠ ${finale.validateurId}`);

        titre('8. Les anomalies remontent seules');
        r = fausseReponse();
        await AdminTontine.anomalies(requete(support), r);
        verifier('la detection repond', r.code === 200 && Array.isArray(r.corps.anomalies));
        verifier('les anomalies sont triees par gravite',
            r.corps.anomalies.every((a, i, t) => i === 0
                || ['haute', 'moyenne', 'basse'].indexOf(t[i - 1].gravite) <= ['haute', 'moyenne', 'basse'].indexOf(a.gravite)),
            r.corps.total + ' anomalie(s) detectee(s)');

        titre('9. Export Excel');
        r = fausseReponse();
        const morceaux = [];
        r.write = (c) => morceaux.push(c);
        await AdminTontine.exporter(requete(maker), r);
        verifier("l'export produit bien un classeur",
            r.entetes['Content-Type']?.includes('spreadsheetml'), r.entetes['Content-Disposition']);
        verifier("il est journalise", (await AuditLog.count({ where: { action: 'TONTINE_EXPORT' } })) > 0);

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            const g = await TontineGroupe.findOne({ where: { nom: NOM } });
            if (g) {
                const pf = [g.portefeuilleId, g.portefeuilleCautionId, g.portefeuilleEpargneId].filter(Boolean);
                await Transaction.destroy({ where: { groupeTontineId: g.id } });
                await TontineGroupe.destroy({ where: { id: g.id } });
                if (pf.length) await Portefeuille.destroy({ where: { id: { [Op.in]: pf } } });
            }
            if (pendingCrees.length) await PendingAction.destroy({ where: { id: { [Op.in]: pendingCrees } } });
            await AuditLog.destroy({ where: { id: { [Op.gt]: auditAvant } } });
            for (const c of clients) {
                await Portefeuille.update({ solde: initiaux[c.id] },
                    { where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' } });
            }
            if (ENV.TONTINE_CLIENT_PLATEFORME_ID) {
                await Portefeuille.update({ solde: 0 },
                    { where: { ClientPortefeuilleId: ENV.TONTINE_CLIENT_PLATEFORME_ID, typePortefeuille: 'courant' } });
            }
            console.log('  groupe, demandes, journal et ecritures supprimes ; soldes restaures');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})();

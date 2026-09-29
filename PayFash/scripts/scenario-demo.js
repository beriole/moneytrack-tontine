/**
 * Repetition generale — le parcours de la soutenance, par HTTP.
 *
 * Rejoue exactement les routes que l'application mobile appelle :
 *
 *   1. connexion et solde
 *   2. recharge du portefeuille par Fapshi (lien reel du bac a sable ;
 *      la confirmation de l'operateur est simulee)
 *   3. epargne : objectif, depot, retrait
 *   4. tontine : creation, adhesions, demarrage
 *   5. cotisations et versement du pot
 *   6. ce que l'application affiche apres : synthese, notifications,
 *      situation, grand livre
 *
 * Tout ce qui est cree est supprime a la fin (--garder pour conserver).
 *
 * Prerequis : node scripts/seed-tontine-demo.js
 * Usage     : node scripts/scenario-demo.js [--garder]
 */

const express = require('express');
const { Op } = require('sequelize');
const models = require('../models');
const {
    db, Client, Portefeuille, Transaction, Paiement, Epargne, Notification,
    LedgerMouvement, LedgerEcriture, TontineGroupe, TontineCycle, TontineCotisation
} = models;
const { FapshiService } = require('../services/paiement/fapshi.service');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local'];
const MOT_DE_PASSE = 'Demo@2026';
const MONTANT = 15000;
const RECHARGE = 25000;
const NOM_GROUPE = 'Demonstration soutenance';
const PORT = 3399;
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

const app = express();
app.use(express.json());
app.use('/auth', require('../router/client/authentification'));
app.use('/wallet', require('../router/client/wallet'));
app.use('/tontine', require('../router/tontine/tontine'));
app.use('/paiement', require('../router/paiement/paiement'));
app.use('/epargne/advanced', require('../router/client/epargne.advanced'));

(async () => {
    await db.authenticate();
    const serveur = app.listen(PORT);
    const B = `http://localhost:${PORT}`;

    const appel = async (chemin, jeton, opts = {}) => {
        const r = await fetch(B + chemin, {
            method: opts.method || 'GET',
            headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
            body: opts.corps ? JSON.stringify(opts.corps) : undefined
        });
        let corps = null; try { corps = await r.json(); } catch (e) { /* reponse sans JSON */ }
        return { code: r.status, corps };
    };

    const soldeCourant = async (clientId) => {
        const pf = await Portefeuille.findOne({
            where: { ClientPortefeuilleId: clientId, typePortefeuille: 'courant', estActif: true }
        });
        return pf ? Math.round(Number(pf.solde) * 100) / 100 : 0;
    };

    console.log('REPETITION GENERALE — le parcours de la soutenance, par HTTP');
    const maxMouvement = (await LedgerMouvement.max('id')) || 0;
    const maxNotif = (await Notification.max('id')) || 0;
    const references = [];
    let groupe = null;
    let epargneId = null;
    const initiaux = {};

    try {
        // --- 1. Connexion --------------------------------------------------
        titre('1. Connexion des comptes de demonstration');
        const sessions = {};
        for (const email of EMAILS) {
            const r = await appel('/auth/login', null, { method: 'POST', corps: { email, motDePasse: MOT_DE_PASSE } });
            if (r.code !== 200) throw new Error(`Connexion impossible pour ${email} : ${JSON.stringify(r.corps)}`);
            sessions[email] = { jeton: r.corps.token, id: r.corps.utilisateur.id, nom: r.corps.utilisateur.nom };
        }
        verifier('les trois comptes se connectent', Object.keys(sessions).length === 3,
            EMAILS.map(e => `${sessions[e].nom} (#${sessions[e].id})`).join(', '));
        const hote = sessions[EMAILS[0]];
        const membres = EMAILS.slice(1).map(e => sessions[e]);
        for (const s of Object.values(sessions)) {
            for (const pf of await Portefeuille.findAll({ where: { ClientPortefeuilleId: s.id } })) {
                initiaux[pf.id] = { solde: pf.solde, reserve: Number(pf.montantReserve) };
            }
        }

        const solde = await appel('/wallet/solde', hote.jeton);
        verifier('le portefeuille repond avec son solde',
            solde.code === 200 && (solde.corps.totalSolde !== undefined || solde.corps.portefeuilles),
            `${solde.code}`);

        // --- 2. Recharge Fapshi --------------------------------------------
        titre('2. Recharge du portefeuille (Fapshi, bac a sable)');
        const avantRecharge = await soldeCourant(hote.id);
        const ouverture = await appel('/paiement/recharge', hote.jeton, {
            method: 'POST', corps: { montant: RECHARGE, telephone: '670000000' }
        });
        const lien = ouverture.corps && (ouverture.corps.lien || (ouverture.corps.data && ouverture.corps.data.lien));
        const reference = ouverture.corps && (ouverture.corps.reference || (ouverture.corps.data && ouverture.corps.data.reference));
        if (reference) references.push(reference);
        verifier('Fapshi rend un lien de paiement et une reference',
            ouverture.code < 400 && !!lien && !!reference, lien ? lien.slice(0, 48) + '…' : JSON.stringify(ouverture.corps));
        verifier('aucun franc n entre avant la confirmation',
            (await soldeCourant(hote.id)) === avantRecharge);

        // L'operateur confirme : c'est la seule chose qu'on simule, pour ne
        // pas dependre d'un paiement reel le jour de la demonstration.
        const vraiStatut = FapshiService.statut;
        FapshiService.statut = async () => ({
            reussi: true, termine: true, statut: 'SUCCESSFUL',
            montant: RECHARGE, medium: 'mobile money', brut: { simule: true }
        });
        const confirmation = await appel(`/paiement/${reference}/verifier`, hote.jeton);
        FapshiService.statut = vraiStatut;

        const apresRecharge = await soldeCourant(hote.id);
        verifier('la confirmation credite le portefeuille',
            confirmation.code === 200 && apresRecharge > avantRecharge,
            `${avantRecharge} -> ${apresRecharge} FCFA (frais de plateforme deduits)`);
        const ecriture = await Transaction.findOne({ where: { reference } });
        verifier('une ecriture « reussie » porte la recharge',
            ecriture && ecriture.statut === 'SUCCESS' && ecriture.type === 'recharge', ecriture && ecriture.statut);
        const mouvement = await LedgerMouvement.findOne({ where: { reference: `LEDGER-${reference}` } });
        const faces = mouvement ? await LedgerEcriture.count({ where: { mouvementId: mouvement.id } }) : 0;
        verifier('et le grand livre l ecrit des deux cotes', !!mouvement && faces === 2);

        // --- 3. Epargne -----------------------------------------------------
        titre('3. Epargne : objectif, depot, retrait');
        const objectif = await appel('/epargne/advanced/avancee', hote.jeton, {
            method: 'POST',
            corps: {
                objectif: 'Demonstration soutenance',
                montant_total: 100000,
                date_debut: new Date().toISOString().slice(0, 10),
                date_fin: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
                couleur: '#4F46E5', icone: 'piggy-bank'
            }
        });
        const objet = objectif.corps && (objectif.corps.epargne || objectif.corps.data || objectif.corps);
        epargneId = objet && (objet.id || objet.epargneId);
        verifier("l'objectif d'epargne est cree", objectif.code < 400 && !!epargneId, `${objectif.code}`);

        const pfCourant = await Portefeuille.findOne({
            where: { ClientPortefeuilleId: hote.id, typePortefeuille: 'courant', estActif: true }
        });
        const avantDepot = await soldeCourant(hote.id);
        const depot = await appel(`/epargne/advanced/${epargneId}/deposer`, hote.jeton, {
            method: 'POST', corps: { montant: 10000, portefeuilleSourceId: pfCourant.id }
        });
        verifier('le depot part du portefeuille courant',
            depot.code < 400 && (await soldeCourant(hote.id)) === avantDepot - 10000,
            `${depot.code} ${JSON.stringify(depot.corps).slice(0, 200)}`);
        const epargneApres = await Epargne.findByPk(epargneId);
        verifier("l'objectif enregistre le cumul", Number(epargneApres.montant_cumule) === 10000,
            `${epargneApres.montant_cumule} FCFA epargnes`);

        const retrait = await appel(`/epargne/advanced/${epargneId}/retirer`, hote.jeton, {
            method: 'POST', corps: { montant: 4000, portefeuilleCibleId: pfCourant.id }
        });
        verifier('le retrait revient au portefeuille',
            retrait.code < 400 && (await soldeCourant(hote.id)) === avantDepot - 6000,
            `${await soldeCourant(hote.id)} FCFA`);

        // --- 4. Creation de la tontine ---------------------------------------
        titre('4. Creation de la tontine et adhesions');
        await TontineGroupe.destroy({ where: { nom: NOM_GROUPE } });
        const creation = await appel('/tontine/groupes', hote.jeton, {
            method: 'POST',
            corps: {
                nom: NOM_GROUPE, montantParPeriode: MONTANT, frequence: 'mensuelle',
                membresMax: 3, modeOrdre: 'tirage', pourcentageCaution: 0,
                description: 'Groupe de demonstration'
            }
        });
        groupe = creation.corps && (creation.corps.groupe || creation.corps.data);
        verifier('la tontine est creee, avec son code d invitation',
            creation.code < 400 && groupe && !!groupe.codeInvitation, groupe && groupe.codeInvitation);

        for (const m of membres) {
            const r = await appel('/tontine/groupes/rejoindre', m.jeton, {
                method: 'POST', corps: { codeInvitation: groupe.codeInvitation }
            });
            verifier(`${m.nom} rejoint avec le code`, r.code < 400, r.code < 400 ? '' : JSON.stringify(r.corps));
        }

        const demarrage = await appel(`/tontine/groupes/${groupe.id}/demarrer`, hote.jeton, { method: 'POST' });
        verifier('le president demarre : l ordre de passage est tire',
            demarrage.code < 400, demarrage.code < 400 ? '' : JSON.stringify(demarrage.corps));

        const refus = await appel(`/tontine/groupes/${groupe.id}/demarrer`, membres[0].jeton, { method: 'POST' });
        verifier('un simple membre ne peut pas demarrer ni gerer', refus.code === 403, String(refus.code));

        // --- 5. Cotisations et versement --------------------------------------
        titre('5. Cotisations et versement du pot');
        const detail = await appel(`/tontine/groupes/${groupe.id}`, hote.jeton);
        const cycle = detail.corps.cycleEnCours;
        verifier('le premier cycle est ouvert, avec son beneficiaire',
            !!cycle && !!cycle.beneficiaireId, cycle && `cycle ${cycle.numeroCycle}, pot attendu ${cycle.montantAttendu}`);

        const cotisations = await TontineCotisation.findAll({ where: { cycleId: cycle.id } });
        for (const c of cotisations) {
            const membre = Object.values(sessions).find(s => s.id === c.clientId);
            const r = await appel(`/tontine/cycles/${cycle.id}/cotiser`, membre.jeton, { method: 'POST', corps: {} });
            verifier(`${membre.nom} cotise ${MONTANT} FCFA`, r.code < 400, r.code < 400 ? '' : JSON.stringify(r.corps));
        }

        const etat = await appel(`/tontine/cycles/${cycle.id}/cotisations`, hote.jeton);
        verifier('le pot est complet', etat.corps && etat.corps.potComplet === true,
            etat.corps && etat.corps.avancement);

        const beneficiaire = Object.values(sessions).find(s => s.id === cycle.beneficiaireId);
        const avantVersement = await soldeCourant(beneficiaire.id);
        const versement = await appel(`/tontine/cycles/${cycle.id}/verser`, hote.jeton, { method: 'POST' });
        const apresVersement = await soldeCourant(beneficiaire.id);
        verifier(`le pot est verse a ${beneficiaire.nom}`,
            versement.code < 400 && apresVersement > avantVersement,
            `${avantVersement} -> ${apresVersement} FCFA`);
        verifier('la rotation a tourne : un nouveau cycle est ouvert',
            versement.corps && !!versement.corps.cycleSuivant);

        // --- 6. Ce que l'application montre ensuite ----------------------------
        titre('6. Ce que l application affiche ensuite');
        const synthese = await appel('/tontine/synthese', hote.jeton);
        verifier('la synthese repond', synthese.code === 200, `${synthese.code}`);
        const situation = await appel('/tontine/moi/situation', hote.jeton);
        verifier('la situation du compte (KYC, restrictions) repond',
            situation.code === 200 && situation.corps.kyc, situation.corps && situation.corps.kyc && situation.corps.kyc.libelle);
        const risque = await appel('/tontine/moi/risque', hote.jeton);
        verifier('« Ma situation » rend le risque et ses facteurs',
            risque.code === 200 && !!risque.corps.libelle, risque.corps && risque.corps.libelle);
        const notifs = await appel(`/auth/notification/${beneficiaire.id}`, beneficiaire.jeton);
        verifier('le beneficiaire est prevenu du versement',
            notifs.code === 200 && Array.isArray(notifs.corps)
            && notifs.corps.some(n => /pot|recu|versement/i.test(n.message || '')),
            notifs.corps && notifs.corps[0] && notifs.corps[0].message);

        const [[balance]] = await db.query(
            "SELECT COALESCE(SUM(CASE WHEN sens = 'debit' THEN montant ELSE -montant END), 0) ecart FROM ledger_ecritures");
        verifier('le grand livre reste equilibre apres tout le parcours',
            Math.abs(Number(balance.ecart)) < 0.005, `ecart ${balance.ecart}`);

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            const mouvements = await LedgerMouvement.findAll({ where: { id: { [Op.gt]: maxMouvement } }, attributes: ['id'] });
            if (mouvements.length) {
                await LedgerEcriture.destroy({ where: { mouvementId: mouvements.map(m => m.id) } });
                await LedgerMouvement.destroy({ where: { id: mouvements.map(m => m.id) } });
            }
            const notifs = await Notification.findAll({ where: { id: { [Op.gt]: maxNotif } }, attributes: ['id'] });
            if (notifs.length) {
                await models.NotificationEnvoyer.destroy({ where: { NotificationId: notifs.map(n => n.id) } });
                await Notification.destroy({ where: { id: notifs.map(n => n.id) } });
            }
            if (epargneId) {
                await models.TransactionEpargne.destroy({ where: { epargne_id: epargneId } }).catch(() => {});
                await Epargne.destroy({ where: { id: epargneId } });
            }
            if (groupe) {
                const g = await TontineGroupe.findByPk(groupe.id);
                const ids = g ? [g.portefeuilleId, g.portefeuilleCautionId].filter(Boolean) : [];
                await Transaction.destroy({ where: { groupeTontineId: groupe.id } });
                if (g) await g.destroy();
                if (ids.length) await Portefeuille.destroy({ where: { id: { [Op.in]: ids } } });
            }
            if (references.length) {
                await Transaction.destroy({ where: { reference: { [Op.in]: references } } });
                await Paiement.destroy({ where: { reference: { [Op.in]: references } } });
            }
            for (const [id, etat] of Object.entries(initiaux)) {
                await Portefeuille.update({ montantReserve: 0 }, { where: { id } });
                await Portefeuille.update({ solde: etat.solde, montantReserve: etat.reserve }, { where: { id } });
            }
            console.log('  tontine, epargne, paiements, notifications et mouvements supprimes ; soldes restaures');
        }
        serveur.close();
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0
            ? 'REPETITION REUSSIE — le parcours de demonstration passe de bout en bout'
            : 'REPETITION EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})().catch(e => { console.error('\nERREUR INATTENDUE : ' + (e.stack || e.message)); process.exit(1); });

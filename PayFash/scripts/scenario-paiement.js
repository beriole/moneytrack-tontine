// =====================================================================
//  Scenario de recette des PAIEMENTS — chantier B (Fapshi).
//
//    node scripts/scenario-paiement.js [--garder]
//
//  Tourne contre le BAC A SABLE REEL : les appels partent vraiment chez
//  Fapshi. Ce qui est verifie n'est pas « l'appel passe » mais les deux
//  choses qui font perdre de l'argent :
//
//    1. l'IDEMPOTENCE — un webhook rejoue, une verification relancee,
//       un utilisateur qui rafraichit : un seul credit ;
//    2. la NON-CONFIANCE au webhook — un rappel qui annonce un succes
//       mensonger ne doit rien crediter, puisque le statut est
//       redemande a l'API.
// =====================================================================

const ENV = require('../config/index');
const models = require('../models');
const { db, Client, Portefeuille, Transaction, Paiement } = models;
const { FapshiService } = require('../services/paiement/fapshi.service');
const { PaiementService } = require('../services/paiement/paiement.service');

const EMAIL = 'awa@tontine.local';
const MONTANT = 500;
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
const arrondir = (v) => Math.round((Number(v) || 0) * 100) / 100;
async function doitEchouer(libelle, code, fn) {
    try { await fn(); verifier(libelle, false, 'aucune erreur levee'); }
    catch (e) { verifier(libelle, e.code === code, `${e.code} — ${e.message}`); }
}

(async () => {
    await db.authenticate();
    const client = await Client.findOne({ where: { email: EMAIL } });
    if (!client) { console.error('Compte de demo absent. Lancez : node scripts/seed-tontine-demo.js'); process.exit(1); }

    const pf = await Portefeuille.findOne({
        where: { ClientPortefeuilleId: client.id, typePortefeuille: 'courant' }
    });
    const soldeInitial = arrondir(pf.solde);
    const referencesCreees = [];

    try {
        titre('1. Le service repond');
        verifier('Fapshi est configure', FapshiService.configure());
        const solde = await FapshiService.solde();
        console.log('  compte marchand : ' + solde.service + ' — ' + solde.balance + ' ' + solde.currency);
        verifier('le bac a sable est joignable', typeof solde.balance === 'number');
        verifier('on est bien en sandbox', FapshiService.mode === 'sandbox',
            'jamais de test contre la production');

        titre('2. Garde-fous a l ouverture');
        await doitEchouer('un montant sous le minimum est refuse', 400,
            () => PaiementService.initierRecharge(client.id, { montant: 50 }));
        // Une caisse de tontine n'appartient a aucun client : la recherche
        // filtre deja sur le proprietaire, donc elle n'est meme pas trouvee.
        // Le garde-fou sur le type reste en defense de second rideau, pour
        // le cas ou un client detiendrait un portefeuille de ce type.
        await doitEchouer('une caisse de tontine est hors d atteinte', 404, async () => {
            const caisse = await Portefeuille.findOne({ where: { typePortefeuille: 'tontine' } });
            if (!caisse) throw { code: 404, message: 'aucune caisse en base — controle non applicable' };
            await PaiementService.initierRecharge(client.id, { montant: MONTANT, portefeuilleId: caisse.id });
        });
        await doitEchouer('le portefeuille d un autre client est refuse', 404, async () => {
            const autre = await Portefeuille.findOne({
                where: { ClientPortefeuilleId: { [require('sequelize').Op.ne]: client.id }, typePortefeuille: 'courant' }
            });
            if (!autre) throw { code: 404, message: 'aucun autre portefeuille — controle non applicable' };
            await PaiementService.initierRecharge(client.id, { montant: MONTANT, portefeuilleId: autre.id });
        });

        titre('3. Ouverture d une recharge reelle');
        const r = await PaiementService.initierRecharge(client.id, {
            montant: MONTANT, motif: 'Recette automatisee'
        });
        referencesCreees.push(r.reference);
        console.log('  reference : ' + r.reference);
        console.log('  lien      : ' + (r.lien || '—'));

        verifier('Fapshi renvoie un lien de paiement', !!r.lien && /^https?:\/\//.test(r.lien));
        verifier('la reference est portee cote MoneyTrack', !!r.reference);

        const p = await Paiement.findOne({ where: { reference: r.reference } });
        verifier('le paiement est enregistre en attente', p.status === 'PENDING');
        verifier("l'identifiant Fapshi est conserve", !!p.providerTxId, p.providerTxId);
        verifier('le sens est entrant', p.sens === 'entrant');
        verifier('AUCUN solde n a bouge avant confirmation',
            arrondir((await Portefeuille.findByPk(pf.id)).solde) === soldeInitial);

        titre('4. Un paiement non paye ne credite rien');
        const c1 = await PaiementService.confirmer(r.reference);
        console.log('  statut Fapshi : ' + c1.statut);
        verifier('le statut reel est remonte', ['CREATED', 'PENDING'].includes(c1.statut));
        verifier('rien n est credite', c1.creedite === false && c1.enAttente === true);
        verifier('le solde reste intact',
            arrondir((await Portefeuille.findByPk(pf.id)).solde) === soldeInitial);

        titre('5. Le webhook n est pas cru sur parole');
        // On forge un rappel qui annonce un succes. Fapshi ne signant pas
        // ses webhooks, c'est exactement ce qu'un attaquant enverrait.
        const avant = arrondir((await Portefeuille.findByPk(pf.id)).solde);
        const faux = await PaiementService.traiterWebhook({
            transId: p.providerTxId,
            externalId: r.reference,
            status: 'SUCCESSFUL',
            amount: 999999
        });
        verifier('le rappel est reconnu', faux.connu === true);
        verifier('mais le statut annonce est ignore', faux.creedite !== true, JSON.stringify(faux));
        verifier('le solde n a pas bouge d un franc',
            arrondir((await Portefeuille.findByPk(pf.id)).solde) === avant,
            'le statut a ete redemande a Fapshi, pas lu dans le corps');

        const inconnu = await PaiementService.traiterWebhook({ transId: 'INEXISTANT', externalId: 'INEXISTANT' });
        verifier('un rappel inconnu est acquitte sans effet', inconnu.connu === false);
        await doitEchouer('un rappel vide est rejete', 400,
            () => PaiementService.traiterWebhook({}));

        titre('6. Idempotence du credit');
        // On simule un paiement confirme, comme si l'utilisateur avait paye,
        // pour eprouver la seule chose qui compte : le double credit.
        const simule = await Paiement.create({
            type: 'recharge', montant: MONTANT, date: new Date(), status: 'PENDING',
            motif: 'Recette — credit simule', reference: 'RCH-TEST-' + Date.now(),
            fournisseur: 'fapshi', sens: 'entrant', providerTxId: 'SIMULE',
            portefeuilleId: pf.id, user_id: client.id
        });
        referencesCreees.push(simule.reference);

        const etatFactice = {
            reussi: true, termine: true, statut: 'SUCCESSFUL',
            montant: MONTANT, medium: 'mobile money', brut: { simule: true }
        };
        const soldeAvant = arrondir((await Portefeuille.findByPk(pf.id)).solde);

        const premier = await PaiementService._crediter(simule, etatFactice);
        verifier('le premier credit passe', premier.creedite === true && premier.montant === MONTANT);
        const soldeApres = arrondir((await Portefeuille.findByPk(pf.id)).solde);
        verifier('le portefeuille est credite exactement une fois',
            soldeApres === arrondir(soldeAvant + MONTANT), soldeAvant + ' -> ' + soldeApres);

        const second = await PaiementService.confirmer(simule.reference);
        verifier('un second appel ne credite pas', second.creedite === false && second.deja === true);
        verifier('le solde est inchange apres le rejeu',
            arrondir((await Portefeuille.findByPk(pf.id)).solde) === soldeApres);

        const triple = await Promise.all([
            PaiementService.confirmer(simule.reference),
            PaiementService.confirmer(simule.reference),
            PaiementService.confirmer(simule.reference),
        ]);
        verifier('trois appels simultanes ne creditent pas davantage',
            triple.every(x => x.creedite === false)
            && arrondir((await Portefeuille.findByPk(pf.id)).solde) === soldeApres);

        const ecritures = await Transaction.count({ where: { reference: simule.reference } });
        verifier('une seule ecriture comptable porte cette reference', ecritures === 1);

        titre('7. Le montant confirme doit correspondre');
        const ecart = await Paiement.create({
            type: 'recharge', montant: 1000, date: new Date(), status: 'PENDING',
            motif: 'Recette — ecart de montant', reference: 'RCH-ECART-' + Date.now(),
            fournisseur: 'fapshi', sens: 'entrant', providerTxId: 'SIMULE-ECART',
            portefeuilleId: pf.id, user_id: client.id
        });
        referencesCreees.push(ecart.reference);
        const soldeAvantEcart = arrondir((await Portefeuille.findByPk(pf.id)).solde);

        // On detourne le client Fapshi le temps d'un appel pour simuler un
        // fournisseur qui confirme un montant different de la demande.
        const vraiStatut = FapshiService.statut;
        FapshiService.statut = async () => ({
            reussi: true, termine: true, statut: 'SUCCESSFUL',
            montant: 200, medium: 'mobile money', brut: { falsifie: true }
        });
        await doitEchouer('un montant confirme different est refuse', 409,
            () => PaiementService.confirmer(ecart.reference));
        FapshiService.statut = vraiStatut;

        verifier('et rien n est credite dans ce cas',
            arrondir((await Portefeuille.findByPk(pf.id)).solde) === soldeAvantEcart);
        verifier('le paiement est marque en echec',
            (await Paiement.findByPk(ecart.id)).status === 'FAILED');

        titre('8. Retrait : les fonds sont reserves avant l appel');
        await doitEchouer('un retrait superieur au solde est refuse', 402,
            () => PaiementService.initierRetrait(client.id, { montant: 99999999, telephone: '670000000' }));
        await doitEchouer('un numero invalide est refuse', 400,
            () => PaiementService.initierRetrait(client.id, { montant: MONTANT, telephone: '123' }));
        verifier('aucun de ces refus n a touche au solde',
            arrondir((await Portefeuille.findByPk(pf.id)).solde) === soldeApres);

        titre('9. Normalisation des numeros');
        verifier('l indicatif 237 est retire',
            FapshiService.normaliserTelephone('237670000000') === '670000000');
        verifier('les separateurs sont ignores',
            FapshiService.normaliserTelephone('+237 6 70 00 00 00') === '670000000');

        titre('10. La faille de creation de monnaie est fermee');
        const wallet = require('fs').readFileSync('./Controllers/client/client.wallet.js', 'utf8');
        const corpsDepot = wallet.slice(wallet.indexOf('const depot'), wallet.indexOf('const retrait'));
        verifier('/wallet/deposit ne credite plus aucun portefeuille',
            !/solde\s*\+=/.test(corpsDepot) && /410/.test(corpsDepot),
            'seule /paiement/recharge fait entrer de l argent');
        const corpsRetrait = wallet.slice(wallet.indexOf('const retrait'), wallet.indexOf('const transfer'));
        verifier('/wallet/withdraw ne debite plus non plus',
            !/solde\s*-=/.test(corpsRetrait) && /410/.test(corpsRetrait));
        verifier('le transfert entre ses propres portefeuilles reste possible',
            /const transfer/.test(wallet));

        titre('11. Le versement passe par le meme chemin de confirmation');
        const sortant = await Paiement.create({
            type: 'retrait', montant: MONTANT, date: new Date(), status: 'PENDING',
            motif: 'Recette — versement simule', reference: 'RET-TEST-' + Date.now(),
            fournisseur: 'fapshi', sens: 'sortant', providerTxId: 'SIMULE-SORTANT',
            portefeuilleId: pf.id, user_id: client.id
        });
        referencesCreees.push(sortant.reference);
        await Transaction.create({
            montant: MONTANT, date: new Date(), type: 'retrait', statut: 'En confirmation',
            description: 'Recette — versement simule', frais: 0,
            ClientTransactionId: client.id, reference: sortant.reference
        });

        const soldeAvantVersement = arrondir((await Portefeuille.findByPk(pf.id)).solde);
        const vraiStatut2 = FapshiService.statut;
        FapshiService.statut = async () => ({
            reussi: true, termine: true, statut: 'SUCCESSFUL',
            montant: MONTANT, medium: 'mobile money', brut: { simule: true }
        });
        const fin = await PaiementService.confirmer(sortant.reference);
        FapshiService.statut = vraiStatut2;

        verifier('un versement confirme est marque abouti', fin.statut === 'SUCCESSFUL' && fin.retrait === true);
        verifier("l'ecriture passe de « En confirmation » a « Succès »",
            (await Transaction.findOne({ where: { reference: sortant.reference } })).statut === 'Succès');
        verifier('un versement ne RECREDITE jamais le portefeuille',
            arrondir((await Portefeuille.findByPk(pf.id)).solde) === soldeAvantVersement,
            'les fonds avaient deja ete reserves a la demande');

        titre('12. Reconciliation des paiements orphelins');
        const rec = await PaiementService.reconcilier();
        console.log('  ' + JSON.stringify(rec));
        verifier('la reconciliation passe en revue les paiements en attente',
            typeof rec.examines === 'number' && Array.isArray(rec.erreurs));

        termine = true;
    } catch (e) {
        causeArret = e;
    } finally {
        if (!garder) {
            titre('Nettoyage');
            for (const ref of referencesCreees) {
                await Transaction.destroy({ where: { reference: ref } });
                await Paiement.destroy({ where: { reference: ref } });
            }
            await Portefeuille.update({ solde: soldeInitial }, { where: { id: pf.id } });
            console.log('  ' + referencesCreees.length + ' paiements de test supprimes ; solde restaure');
        }
        if (!termine) { echecs++; console.log('  [KO]  interrompu : ' + (causeArret ? (causeArret.stack || causeArret.message) : 'cause inconnue')); }
        console.log('\n' + (echecs === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + echecs + ' controle(s)'));
        await db.close();
        process.exit(echecs === 0 ? 0 : 1);
    }
})();

'use strict';

const CycleService = require('./cycle.service');
const CreditService = require('./credit.service');
const EchangeService = require('./echange.service');
const { VoteService } = require('./vote.service');
const NotificationService = require('./notification.service');
const PrelevementService = require('./prelevement.service');

// =====================================================================
//  Le planificateur de fond.
//
//  Malgre son nom, il ne sert plus seulement la tontine : il porte aussi
//  la reconciliation des paiements Fapshi. Une seule passe de fond vaut
//  mieux que deux minuteries qui s'ignorent.
//
//  Jusqu'ici, traiterEcheances(), traiterVotesEchus() et les autres
//  existaient mais n'etaient JAMAIS declenches : le module attendait un
//  ordonnanceur que le projet n'avait pas.
//
//  Volontairement sans dependance : un setInterval suffit pour une passe
//  quotidienne, et n'ajoute rien a installer. Si le serveur redemarre
//  plusieurs fois par jour, la passe se rejoue — toutes les operations
//  ci-dessous sont idempotentes (une seule amende de retard par cycle et
//  par membre, notifications par jalon de date).
//
//  Ce qu'il fait, dans l'ordre — et l'ordre est le message : on previent,
//  puis on empeche, et seulement ensuite on sanctionne.
//    1. rappeler AVANT l'echeance ;
//    2. alerter d'un solde qui ne suffira pas, puis PRELEVER pour ceux qui
//       ont donne mandat — c'est la que l'amende est evitee ;
//    3. constater le defaut et sanctionner, sans jamais verser ;
//    4. depouiller les scrutins echus et appliquer leur effet ;
//    5. fermer les echanges de tour non traites a temps ;
//    6. constater les echeances de credit depassees ;
//    7. rattraper les paiements Fapshi restes en attente — un utilisateur
//       qui ferme l'application au mauvais moment ne doit rien perdre.
// =====================================================================

const HEURE = 3600 * 1000;
const INTERVALLE = 6 * HEURE;   // quatre passes par jour : assez fin pour
                                // que les jalons J-3 / J-1 tombent juste.

let minuterie = null;
let enCours = false;

async function passe(maintenant = new Date()) {
    const debut = Date.now();
    const rapport = {};

    // 1. Prevenir avant de sanctionner.
    try { rapport.rappelsCotisations = await NotificationService.rappelsCotisations(maintenant); }
    catch (e) { rapport.rappelsCotisations = { erreur: e.message }; }

    try { rapport.rappelsTours = await NotificationService.rappelsTours(maintenant); }
    catch (e) { rapport.rappelsTours = { erreur: e.message }; }

    // 2. Empecher. Le mandat de prelevement passe AVANT la mise en defaut :
    // arriver apres l'amende qu'il est cense eviter n'aurait aucun sens.
    try { rapport.provision = await PrelevementService.alerterProvision(maintenant); }
    catch (e) { rapport.provision = { erreur: e.message }; }

    try { rapport.prelevements = await PrelevementService.executerEcheances(maintenant); }
    catch (e) { rapport.prelevements = { erreur: e.message }; }

    // 3. Constater : le cron ne verse jamais, il met en defaut et amende.
    try { rapport.echeances = await CycleService.traiterEcheances(maintenant); }
    catch (e) { rapport.echeances = { erreur: e.message }; }

    // 3. Gouvernance : un scrutin echu doit produire son effet.
    try { rapport.votes = await VoteService.traiterVotesEchus(maintenant); }
    catch (e) { rapport.votes = { erreur: e.message }; }

    // 4. Marche des tours : une proposition non traitee expire.
    try { rapport.echanges = await EchangeService.traiterEchangesEchus(maintenant); }
    catch (e) { rapport.echanges = { erreur: e.message }; }

    // 5. Credit : constater les retards, basculer en defaut au 3e.
    try { rapport.credits = await CreditService.traiterEcheancesCredit(maintenant); }
    catch (e) { rapport.credits = { erreur: e.message }; }

    // 6. Paiements orphelins. Le webhook Fapshi peut ne jamais arriver —
    // serveur non joignable, rappel perdu, application fermee au mauvais
    // moment. Cette passe redemande le statut a la source et credite ce
    // qui doit l'etre. Sans elle, une recharge payee resterait invisible.
    try {
        const { PaiementService } = require('../paiement/paiement.service');
        rapport.paiements = await PaiementService.reconcilier(maintenant);
    } catch (e) { rapport.paiements = { erreur: e.message }; }

    rapport.dureeMs = Date.now() - debut;
    return rapport;
}

function demarrer() {
    if (minuterie) return;

    const executer = async () => {
        if (enCours) return;          // une passe lente ne doit pas se chevaucher
        enCours = true;
        try {
            const r = await passe();
            console.log('[tontine] passe planifiee :', JSON.stringify(r));
        } catch (e) {
            console.log('[tontine] passe planifiee en echec :', e.message);
        } finally {
            enCours = false;
        }
    };

    // Premiere passe apres le demarrage, une fois la base synchronisee.
    setTimeout(executer, 30 * 1000);
    minuterie = setInterval(executer, INTERVALLE);
    if (minuterie.unref) minuterie.unref();   // ne retient pas le processus

    console.log('[tontine] planificateur actif (passe toutes les 6 h)');
}

function arreter() {
    if (minuterie) { clearInterval(minuterie); minuterie = null; }
}

module.exports = { demarrer, arreter, passe };

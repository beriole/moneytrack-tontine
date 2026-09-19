'use strict';

const { Op } = require('sequelize');
const {
    Client, Portefeuille, Transaction, EvaluationRisque,
    TontineMembre, TontineCycle, TontineCotisation, TontineCaution,
    TontineIncidentDefaut, TontineGarantie, TontineGarantieMouvement
} = require('../models');
const Fonds = require('./fonds.service');
const KycService = require('./kyc.service');

// =====================================================================
//  Moteur de risque (sections 10 a 14).
//
//  Le risque et la couverture sont deux mesures distinctes. La couverture
//  dit quelles ressources protegent la tontine ; le risque, la capacite
//  probable du membre a tenir ses engagements, d'apres ce que MoneyTrack
//  sait reellement de lui. Un membre couvert a 100 % peut avoir un risque
//  eleve, et l'inverse.
//
//  Le moteur est deterministe : une table de regles, des seuils ecrits,
//  des points. Il rend un niveau, un score et chaque facteur qui l'explique,
//  positif ou negatif, avec les chiffres utilises. Il ne predit rien et
//  ne juge personne : il mesure une situation financiere. Son vocabulaire
//  est celui de la section 42.
//
//  A ce stade, le risque NE DECIDE RIEN. Il est calcule et conserve a cote
//  des decisions d'eligibilite, qui restent seules a autoriser ou refuser.
//  Le brancher dans une decision sera un choix explicite du reglement.
//
//  Deux parties :
//    collecter(clientId)  lit la base : historique, portefeuilles, flux,
//                         engagements, couverture ;
//    noter(donnees)       pure : applique les regles aux chiffres.
// =====================================================================

const VERSION = 'risque-1.1';
const JOUR = 86400000;

// Les regles, en un seul endroit. Tout seuil ou tout point qui change
// change la version.
const REGLES = Object.freeze({
    base: 30,
    niveaux: { modereDes: 25, eleveDes: 55 },
    historiqueMinimum: 3,           // cotisations echues en dessous desquelles l'historique ne dit rien
    fenetreRecenteJours: 180,
    fenetreMobilisationJours: 365,
    fenetreFluxJours: 90,
    fenetreLiquiditeJours: 14,
    horizonEcheancesJours: 30,
    points: {
        identiteVerifiee: -10,
        cycleTermine: -5, cyclesTerminesMax: -15,
        ponctualite: -15, ponctualiteMin: 0.9, ponctualiteCotisationsMin: 6,
        cautionActive: -5,
        anciennete: -5, ancienneteMois: 12,
        retardRecent: 10, retardsRecentsMax: 30,
        dureeRetard: 10, dureeRetardJours: 7,
        echeanceEnRetard: 20,
        incidentOuvert: 10, incidentsMax: 20,
        garantieMobilisee: 10, garantiesMobiliseesMax: 20,
        engagementsEleves: 15, engagementsPartRevenus: 0.5,
        capaciteReduite: 15,
        liquiditeAccrue: 15, liquiditeFacteurDepenses: 2,
        couvertureFaible: 10, couvertureSeuil: 50
    }
});

// Classement des ecritures du grand livre, du point de vue du client.
// Les types absents (mouvements internes entre ses propres portefeuilles,
// types ambigus comme 'pret' ou 'retenue_pot') ne sont pas comptes.
const ENTREES = ['revenu', 'recharge', 'depot', 'transfert_entrant', 'versement',
    'decote_enchere', 'amende_indemnite', 'caution_liberation'];
const SORTIES = ['depense', 'dépense', 'retrait', 'transfert_sortant', 'cotisation',
    'amende', 'regularisation', 'caution_blocage'];

const arrondir = (v) => Math.round((Number(v) || 0) * 100) / 100;
const fcfa = (v) => `${Math.round(Number(v) || 0).toLocaleString('fr-FR')} FCFA`;

const NIVEAUX = {
    FAIBLE: 'Risque faible',
    MODERE: 'Risque modere',
    ELEVE: 'Risque financier accru'
};

class RisqueService {

    static version() { return VERSION; }
    static regles() { return REGLES; }

    // -----------------------------------------------------------------
    //  Notation (pure)
    // -----------------------------------------------------------------
    /**
     * Applique les regles aux donnees. Pure : memes donnees, meme resultat.
     */
    static noter(d) {
        const P = REGLES.points;
        const facteurs = [];
        const ajouter = (code, points, libelle) => facteurs.push({
            code, points, sens: points < 0 ? 'positif' : (points > 0 ? 'negatif' : 'neutre'), libelle
        });

        const h = d.historique;
        const suffisant = h.echues >= REGLES.historiqueMinimum;

        // --- Positifs ---------------------------------------------------
        if (d.kyc.niveau >= 2) ajouter('identite', P.identiteVerifiee, 'Identite verifiee');
        if (h.cyclesTermines > 0) {
            ajouter('cycles', Math.max(P.cyclesTerminesMax, P.cycleTermine * h.cyclesTermines),
                `${h.cyclesTermines} tontine(s) menee(s) a terme`);
        }
        if (h.echues >= P.ponctualiteCotisationsMin && h.aTemps / h.echues >= P.ponctualiteMin) {
            ajouter('ponctualite', P.ponctualite, `${h.aTemps} cotisation(s) sur ${h.echues} payee(s) a l'heure`);
        }
        if (d.cautionsActives > 0) ajouter('caution', P.cautionActive, 'Caution active');
        if (d.ancienneteMois >= P.ancienneteMois) {
            ajouter('anciennete', P.anciennete, `Compte ouvert depuis ${d.ancienneteMois} mois`);
        }

        // --- Negatifs ---------------------------------------------------
        if (h.retardsRecents > 0) {
            ajouter('retards', Math.min(P.retardsRecentsMax, P.retardRecent * h.retardsRecents),
                `${h.retardsRecents} echeance(s) reglee(s) en retard sur les ${REGLES.fenetreRecenteJours} derniers jours`);
        }
        if (h.retardMoyenJours !== null && h.retardMoyenJours > P.dureeRetardJours) {
            ajouter('duree_retard', P.dureeRetard, `Retard moyen de ${h.retardMoyenJours} jours sur les echeances reglees en retard`);
        }
        if (h.enRetardMaintenant > 0) {
            ajouter('echeance_en_retard', P.echeanceEnRetard, `Echeance en retard : ${h.enRetardMaintenant} cotisation(s)`);
        }
        if (d.incidentsOuverts > 0) {
            ajouter('incidents', Math.min(P.incidentsMax, P.incidentOuvert * d.incidentsOuverts),
                `Garanties epuisees : ${d.incidentsOuverts} echeance(s) que ni la caution ni les garanties n'ont couverte(s)`);
        }
        if (d.mobilisations > 0) {
            ajouter('garanties_mobilisees', Math.min(P.garantiesMobiliseesMax, P.garantieMobilisee * d.mobilisations),
                `Garantie a reconstituer : ${d.mobilisations} prelevement(s) sur caution ou garantie en un an`);
        }

        const f = d.flux;
        const revenusMensuels = f.entrees > 0 ? arrondir(f.entrees * 30 / REGLES.fenetreFluxJours) : null;
        if (revenusMensuels && d.engagementMensuel > revenusMensuels * P.engagementsPartRevenus) {
            ajouter('engagements', P.engagementsEleves,
                `Engagements eleves : ${fcfa(d.engagementMensuel)} par mois de tontines, pour environ ${fcfa(revenusMensuels)} d'entrees mensuelles`);
        }
        if (d.echeances30j > 0 && d.disponible < d.echeances30j) {
            ajouter('capacite', P.capaciteReduite,
                `Capacite financiere reduite : ${fcfa(d.disponible)} disponibles pour ${fcfa(d.echeances30j)} d'echeances sous ${REGLES.horizonEcheancesJours} jours`);
            // Section 12 : une forte depense recente qui laisse le compte
            // court avant une echeance. Une mesure de liquidite, rien d'autre.
            if (f.sortiesHabituelles > 0 && f.sortiesRecentes > P.liquiditeFacteurDepenses * f.sortiesHabituelles) {
                ajouter('liquidite', P.liquiditeAccrue,
                    `Risque de liquidite accru : ${fcfa(f.sortiesRecentes)} sortis sur ${REGLES.fenetreLiquiditeJours} jours, `
                    + `contre ${fcfa(f.sortiesHabituelles)} d'habitude`);
            }
        }
        if (d.couvertureMin !== null && d.couvertureMin < P.couvertureSeuil) {
            ajouter('couverture', P.couvertureFaible, `Couverture insuffisante : ${d.couvertureMin} % dans « ${d.couvertureGroupe} »`);
        }

        if (!suffisant) {
            ajouter('historique', 0, `Historique insuffisant : ${h.echues} cotisation(s) echue(s) connue(s)`);
        }

        const brut = REGLES.base + facteurs.reduce((s, x) => s + x.points, 0);
        const score = Math.max(0, Math.min(100, brut));
        const niveau = score >= REGLES.niveaux.eleveDes ? 'ELEVE'
            : score >= REGLES.niveaux.modereDes ? 'MODERE' : 'FAIBLE';

        return {
            niveau,
            libelle: NIVEAUX[niveau],
            score,
            donneesSuffisantes: suffisant,
            positifs: facteurs.filter(x => x.sens === 'positif'),
            negatifs: facteurs.filter(x => x.sens === 'negatif'),
            neutres: facteurs.filter(x => x.sens === 'neutre'),
            facteurs,
            versionMoteur: VERSION
        };
    }

    // -----------------------------------------------------------------
    //  Collecte
    // -----------------------------------------------------------------
    static async collecter(clientId, maintenant = new Date()) {
        const ExpositionService = require('./tontine/exposition.service');
        const CouvertureService = require('./tontine/couverture.service');
        const t0 = maintenant.getTime();

        const client = await Client.findByPk(clientId);
        if (!client) throw new (require('./tontine/commun').ErreurTontine)(404, 'Client introuvable');

        // --- Historique de paiement -----------------------------------
        const cotisations = await TontineCotisation.findAll({
            where: { clientId },
            include: [{ model: TontineCycle, as: 'cycle', attributes: ['id', 'dateFinPrevue'] }]
        });
        const h = { echues: 0, aTemps: 0, payeesEnRetard: 0, retardsRecents: 0, enRetardMaintenant: 0, retardMoyenJours: null };
        const delais = [];
        let echeances30j = 0;
        for (const c of cotisations) {
            // L'echeance qui fait foi est celle du cycle (voir defaut.service).
            const echeance = new Date(c.cycle ? c.cycle.dateFinPrevue : c.dateEcheance).getTime();
            const reste = arrondir(Number(c.montantDu) - Number(c.montantPaye));
            if (c.statut !== 'payee' && echeance <= t0 + REGLES.horizonEcheancesJours * JOUR) {
                echeances30j = arrondir(echeances30j + reste);
            }
            const echue = echeance <= t0;
            if (c.statut !== 'payee' && !echue) continue;     // encore a venir
            h.echues++;
            const recente = echeance >= t0 - REGLES.fenetreRecenteJours * JOUR;

            // Un meme evenement ne compte qu'une fois : une echeance en cours
            // de retard est « en retard maintenant » ; elle ne rejoindra les
            // retards passes (nombre, duree) qu'une fois reglee.
            if (['en_retard', 'impayee'].includes(c.statut)) {
                h.enRetardMaintenant++;
                continue;
            }
            if (c.statut !== 'payee') continue;              // partielle echue : comptee au constat
            const paiement = c.datePaiement ? new Date(c.datePaiement).getTime() : echeance;
            const recouvree = Number(c.montantRecouvre || 0) > 0;
            if (!recouvree && paiement <= echeance) { h.aTemps++; continue; }
            h.payeesEnRetard++;
            if (recente) h.retardsRecents++;
            delais.push(Math.max(0, (paiement - echeance) / JOUR));
        }
        if (delais.length) h.retardMoyenJours = Math.round(delais.reduce((s, x) => s + x, 0) / delais.length);
        h.cyclesTermines = await TontineMembre.count({ where: { clientId, statut: 'termine' } });

        const incidentsOuverts = await TontineIncidentDefaut.count({ where: { clientId, statut: 'ouvert' } });

        const depuis = new Date(t0 - REGLES.fenetreMobilisationJours * JOUR);
        const garanties = await TontineGarantie.findAll({ where: { clientId }, attributes: ['id'] });
        const mobGaranties = garanties.length ? await TontineGarantieMouvement.count({
            where: { garantieId: garanties.map(g => g.id), sens: 'mobilisation', createdAt: { [Op.gte]: depuis } }
        }) : 0;
        const saisies = await Transaction.count({
            where: { ClientTransactionId: clientId, type: 'caution_saisie', date: { [Op.gte]: depuis } }
        });

        const cautions = await TontineCaution.findAll({ where: { clientId, statut: { [Op.ne]: 'liberee' } } });
        const cautionsActives = cautions.filter(c => Number(c.montantBloque) - Number(c.montantUtilise) > 0).length;

        // --- Capacite financiere --------------------------------------
        const portefeuilles = await Portefeuille.findAll({ where: { ClientPortefeuilleId: clientId, estActif: true } });
        const solde = arrondir(portefeuilles.reduce((s, p) => s + Number(p.solde), 0));
        const bloque = arrondir(portefeuilles.reduce((s, p) => s + Fonds.reserve(p), 0));
        const disponible = arrondir(portefeuilles.reduce((s, p) => s + Fonds.disponible(p), 0));

        const debutFlux = new Date(t0 - REGLES.fenetreFluxJours * JOUR);
        const debutRecent = t0 - REGLES.fenetreLiquiditeJours * JOUR;
        const ecritures = await Transaction.findAll({
            where: { ClientTransactionId: clientId, date: { [Op.gte]: debutFlux } },
            attributes: ['type', 'montant', 'date']
        });
        let entrees = 0, sorties = 0, sortiesRecentes = 0, sortiesAnciennes = 0, nonClassees = 0;
        for (const e of ecritures) {
            const m = Number(e.montant) || 0;
            if (ENTREES.includes(e.type)) { entrees += m; continue; }
            if (!SORTIES.includes(e.type)) { nonClassees++; continue; }
            sorties += m;
            if (new Date(e.date).getTime() >= debutRecent) sortiesRecentes += m; else sortiesAnciennes += m;
        }
        const joursAnciens = REGLES.fenetreFluxJours - REGLES.fenetreLiquiditeJours;
        const flux = {
            entrees: arrondir(entrees),
            sorties: arrondir(sorties),
            sortiesRecentes: arrondir(sortiesRecentes),
            // Ce qui sort d'habitude sur la meme duree, d'apres les jours precedents.
            sortiesHabituelles: arrondir(sortiesAnciennes * REGLES.fenetreLiquiditeJours / joursAnciens),
            ecritures: ecritures.length,
            nonClassees
        };

        // --- Engagements, toutes tontines -----------------------------
        const expo = await ExpositionService.pourClient(clientId);

        // --- Couverture (mesure distincte, rapportee comme facteur) ----
        let couvertureMin = null, couvertureGroupe = null;
        // Seulement les tontines demarrees : avant le tirage, l'engagement
        // n'est que potentiel et personne n'a encore eu a se couvrir.
        for (const g of expo.parGroupe || []) {
            if (!(g.exposition > 0) || g.potentielle) continue;
            try {
                const c = await CouvertureService.pourMembre(clientId, g.groupeId);
                if (couvertureMin === null || c.couverture < couvertureMin) {
                    couvertureMin = c.couverture; couvertureGroupe = g.nom;
                }
            } catch (e) { /* adhesion devenue inaccessible : ignoree */ }
        }

        const kyc = KycService.etat(client);
        return {
            dateCalcul: maintenant.toISOString(),
            kyc: { niveau: KycService.niveauEffectif(client), libelle: kyc.libelle || null },
            ancienneteMois: Math.floor((t0 - new Date(client.createdAt).getTime()) / (30 * JOUR)),
            historique: h,
            incidentsOuverts,
            mobilisations: mobGaranties + saisies,
            cautionsActives,
            solde, bloque, disponible,
            flux,
            engagementMensuel: expo.engagementMensuel,
            expositionTotale: expo.expositionTotale,
            tontinesEnCours: expo.tontines,
            echeances30j,
            couvertureMin, couvertureGroupe
        };
    }

    // -----------------------------------------------------------------
    //  Evaluation
    // -----------------------------------------------------------------
    /**
     * Collecte, note, et — si `contexte` est donne — conserve l'evaluation.
     * Renvoie l'evaluation avec les donnees utilisees.
     */
    static async evaluer(clientId, { contexte = null, groupeId = null, maintenant = new Date() } = {}) {
        const donnees = await this.collecter(clientId, maintenant);
        const resultat = this.noter(donnees);
        let id = null;
        if (contexte) {
            const e = await EvaluationRisque.create({
                clientId, groupeId, contexte,
                niveau: resultat.niveau, score: resultat.score,
                donneesSuffisantes: resultat.donneesSuffisantes,
                facteurs: resultat.facteurs, donnees, regles: REGLES,
                versionMoteur: VERSION
            });
            id = e.id;
        }
        return { id, ...resultat, donnees };
    }

    /**
     * Conserve une evaluation a cote d'une decision, sans jamais la faire
     * echouer : le risque accompagne la decision, il ne la conditionne pas.
     */
    static async accompagner(clientId, contexte, groupeId) {
        try {
            return await this.evaluer(clientId, { contexte, groupeId });
        } catch (e) {
            console.log('[risque] evaluation non enregistree :', e.message);
            return null;
        }
    }

    /** Ce que le membre voit de lui-meme : les facteurs, sans jargon. */
    static vueMembre(r) {
        return {
            niveau: r.niveau,
            libelle: r.libelle,
            donneesSuffisantes: r.donneesSuffisantes,
            atouts: r.positifs.map(f => f.libelle),
            pointsAttention: r.negatifs.map(f => f.libelle),
            remarques: r.neutres.map(f => f.libelle),
            indicateurs: {
                engagementMensuel: r.donnees.engagementMensuel,
                expositionTotale: r.donnees.expositionTotale,
                disponible: r.donnees.disponible,
                bloque: r.donnees.bloque,
                echeances30j: r.donnees.echeances30j
            },
            note: 'Cette analyse decrit votre situation financiere dans MoneyTrack. Elle ne decide pas a elle seule '
                + 'de votre eligibilite : ce sont les regles de chaque tontine qui s\'appliquent.',
            versionMoteur: r.versionMoteur
        };
    }

    static async historique(clientId, limite = 10) {
        return EvaluationRisque.findAll({ where: { clientId }, order: [['createdAt', 'DESC']], limit: limite });
    }
}

module.exports = RisqueService;

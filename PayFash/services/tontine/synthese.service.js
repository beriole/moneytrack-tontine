'use strict';

const { Op } = require('sequelize');
const {
    Portefeuille,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation,
    TontineAmende, TontineCaution, TontineDemandeCredit, TontineRemboursementCredit
} = require('../../models');
const { nombre, arrondir } = require('./commun');
const EcheancierService = require('./echeancier.service');

// =====================================================================
//  La synthese d'engagements — la piece qui fait de la tontine et du
//  reste de MoneyTrack un seul systeme.
//
//  Le probleme qu'elle resout : Portefeuille.solde ment. Il affiche
//  150 000 alors que 25 000 sont dus dans trois jours et 20 000 dorment
//  en caution. Le disponible reel est 105 000, et aucun ecran ne le sait.
//
//  Ici on distingue trois natures d'argent :
//
//    brut         ce qui est sur les portefeuilles
//    engage       ce qui est deja promis (cotisations, amendes, echeances)
//    immobilise   ce qui existe mais ne peut pas servir (cautions, epargne
//                 de groupe) — ni depensable, ni perdu
//    disponible   brut - engage
//
//  Et une ligne de temps unique : ce qui sort, ce qui rentre, avec dates.
//  C'est elle qui permet de dire « ton tour tombe le 12 mars, il couvre
//  ton projet moto ».
// =====================================================================

const HORIZON_COURT = 30;   // jours

class SyntheseService {

    /**
     * Adhesions actives d'un client, avec leur groupe.
     */
    static async _adhesions(clientId) {
        return TontineMembre.findAll({
            where: { clientId, statut: { [Op.in]: ['actif', 'suspendu'] } },
            include: [{ model: TontineGroupe, as: 'groupe' }]
        });
    }

    // -----------------------------------------------------------------
    //  Ce qui sort
    // -----------------------------------------------------------------
    /**
     * Cotisations ouvertes sur les cycles non verses. Une cotisation est
     * une dette datee : elle a un montant restant et une echeance.
     */
    static async _sorties(clientId) {
        const lignes = [];

        const cotisations = await TontineCotisation.findAll({
            where: { clientId, statut: { [Op.in]: ['attendue', 'partielle', 'en_retard'] } },
            include: [{
                model: TontineCycle, as: 'cycle',
                include: [{ model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom'] }]
            }]
        });
        for (const c of cotisations) {
            if (!c.cycle || c.cycle.statut === 'complete') continue;
            lignes.push({
                nature: 'cotisation',
                libelle: `Cotisation ${c.cycle.groupe?.nom || 'tontine'} — cycle ${c.cycle.numeroCycle}`,
                montant: arrondir(nombre(c.montantDu) - nombre(c.montantPaye)),
                date: c.dateEcheance,
                enRetard: c.statut === 'en_retard',
                groupeId: c.cycle.groupeId,
                reference: { type: 'cotisation', id: c.id }
            });
        }

        // Une amende est exigible tout de suite : elle bloque la cotisation
        // suivante, donc elle passe avant tout le reste.
        const amendes = await TontineAmende.findAll({
            where: { clientId, statut: 'due' },
            include: [{ model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom'] }]
        });
        for (const a of amendes) {
            lignes.push({
                nature: 'amende',
                libelle: `Amende (${a.motif}) — ${a.groupe?.nom || 'tontine'}`,
                montant: arrondir(a.montant),
                date: a.createdAt,
                enRetard: true,
                groupeId: a.groupeId,
                reference: { type: 'amende', id: a.id }
            });
        }

        const echeances = await TontineRemboursementCredit.findAll({
            where: { statut: { [Op.in]: ['attendu', 'en_retard'] } },
            include: [{
                model: TontineDemandeCredit, as: 'demande',
                where: { clientId, statut: { [Op.in]: ['decaissee', 'en_defaut'] } },
                required: true
            }]
        });
        for (const e of echeances) {
            lignes.push({
                nature: 'credit',
                libelle: `Echeance ${e.numeroEcheance} de credit tontine`,
                montant: arrondir(nombre(e.montantDu) - nombre(e.montantPaye)),
                date: e.dateEcheance,
                enRetard: e.statut === 'en_retard',
                reference: { type: 'echeance_credit', id: e.id }
            });
        }

        lignes.push(...(await this._cotisationsProjetees(clientId)));
        return lignes.filter(l => l.montant > 0);
    }

    /**
     * Les cotisations des cycles a venir n'existent pas encore en base :
     * elles sont creees cycle par cycle, au fur et a mesure. Sans cette
     * projection, la tresorerie n'annoncerait qu'un seul mois d'engagement
     * alors que le membre s'est engage pour toute la rotation.
     *
     * On projette donc les cycles restants, en sautant celui ou le membre
     * est lui-meme beneficiaire — il n'y cotise pas.
     */
    static async _cotisationsProjetees(clientId) {
        const lignes = [];
        const adhesions = await this._adhesions(clientId);

        for (const m of adhesions) {
            const g = m.groupe;
            if (!g || g.statut !== 'actif' || !m.ordreBeneficiaire) continue;

            const cycleCourant = await TontineCycle.findOne({
                where: { groupeId: g.id, numeroCycle: g.numeroCycleActuel }
            });
            if (!cycleCourant) continue;

            const membresActifs = await TontineMembre.count({
                where: { groupeId: g.id, statut: 'actif' }
            });
            const dernierCycle = membresActifs;               // un tour par membre
            const aVenir = dernierCycle - g.numeroCycleActuel;
            if (aVenir <= 0) continue;

            const dates = EcheancierService.genererDates(
                new Date(cycleCourant.dateFinPrevue), g.frequence, aVenir + 1
            );

            for (let c = g.numeroCycleActuel + 1; c <= dernierCycle; c++) {
                if (c === m.ordreBeneficiaire) continue;       // mon tour : je ne cotise pas
                lignes.push({
                    nature: 'cotisation',
                    projete: true,                             // pas encore ouverte en base
                    libelle: `Cotisation ${g.nom} — cycle ${c} (prevue)`,
                    montant: arrondir(g.montantParPeriode),
                    date: dates[c - g.numeroCycleActuel] || dates[dates.length - 1],
                    enRetard: false,
                    groupeId: g.id,
                    reference: { type: 'cotisation_projetee', groupeId: g.id, cycle: c }
                });
            }
        }
        return lignes;
    }

    // -----------------------------------------------------------------
    //  Ce qui rentre
    // -----------------------------------------------------------------
    /**
     * Tours a recevoir. Pour un membre au rang k dans un groupe qui en est
     * au cycle c, le tour tombe apres (k - c) periodes : la date se
     * projette depuis l'echeance du cycle en cours.
     *
     * C'est cette projection qui rend une tontine planifiable, et qui
     * permet de la brancher sur un projet ou une epargne.
     */
    static async _entrees(clientId) {
        const lignes = [];
        const adhesions = await this._adhesions(clientId);

        for (const m of adhesions) {
            const g = m.groupe;
            if (!g || g.statut !== 'actif') continue;
            if (m.aBeneficie || !m.ordreBeneficiaire) continue;

            const cycleCourant = await TontineCycle.findOne({
                where: { groupeId: g.id, numeroCycle: g.numeroCycleActuel }
            });
            if (!cycleCourant) continue;

            const restants = m.ordreBeneficiaire - g.numeroCycleActuel;
            if (restants < 0) continue;

            // Le cycle en cours se termine a sa date prevue ; chaque tour
            // suivant ajoute une periode.
            const dates = EcheancierService.genererDates(
                new Date(cycleCourant.dateFinPrevue), g.frequence, Math.max(1, restants + 1)
            );
            const dateTour = dates[restants] || dates[dates.length - 1];

            const membresActifs = await TontineMembre.count({
                where: { groupeId: g.id, statut: 'actif' }
            });
            const pot = arrondir(nombre(g.montantParPeriode) * Math.max(0, membresActifs - 1));

            lignes.push({
                nature: 'tour',
                libelle: `Votre tour — ${g.nom}`,
                montant: pot,
                date: dateTour,
                groupeId: g.id,
                rang: m.ordreBeneficiaire,
                cyclesRestants: restants,
                destinationId: m.portefeuilleDestinationId || null,
                reference: { type: 'tour', id: m.id }
            });
        }

        return lignes;
    }

    // -----------------------------------------------------------------
    //  Ce qui est immobilise
    // -----------------------------------------------------------------
    static async _immobilise(clientId) {
        const lignes = [];

        const cautions = await TontineCaution.findAll({
            where: { clientId, statut: { [Op.ne]: 'liberee' } },
            include: [{ model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom'] }]
        });
        for (const c of cautions) {
            const restant = arrondir(nombre(c.montantBloque) - nombre(c.montantUtilise));
            if (restant <= 0) continue;
            lignes.push({
                nature: 'caution',
                libelle: `Caution bloquee — ${c.groupe?.nom || 'tontine'}`,
                montant: restant,
                groupeId: c.groupeId,
                recuperableA: 'la fin de la tontine, si aucune dette'
            });
        }

        // Apports a la caisse d'epargne : recuperables a la casse annuelle.
        const { EpargneService } = require('./epargne.service');
        const adhesions = await this._adhesions(clientId);
        for (const m of adhesions) {
            const g = m.groupe;
            if (!g || g.type === 'rotative') continue;
            try {
                const apports = await EpargneService.apportsParMembre(g.id, null);
                const mien = arrondir(apports[clientId] || 0);
                if (mien > 0) {
                    lignes.push({
                        nature: 'epargne_groupe',
                        libelle: `Apports a la caisse — ${g.nom}`,
                        montant: mien,
                        groupeId: g.id,
                        recuperableA: "la cloture de l'exercice, avec sa part du produit"
                    });
                }
            } catch (e) { /* groupe sans pool : rien a compter */ }
        }

        return lignes;
    }

    // -----------------------------------------------------------------
    //  Synthese
    // -----------------------------------------------------------------
    /**
     * Le chiffre que toute l'application devrait afficher a la place du
     * solde brut.
     */
    static async soldeReel(clientId) {
        const portefeuilles = await Portefeuille.findAll({
            where: { ClientPortefeuilleId: clientId, estActif: true }
        });
        const brut = arrondir(portefeuilles.reduce((s, p) => s + nombre(p.solde), 0));

        const sorties = await this._sorties(clientId);
        const immobilise = await this._immobilise(clientId);

        const limite = new Date(Date.now() + HORIZON_COURT * 86400000);
        const engageCourt = arrondir(
            sorties.filter(l => new Date(l.date) <= limite).reduce((s, l) => s + l.montant, 0)
        );
        const engageTotal = arrondir(sorties.reduce((s, l) => s + l.montant, 0));
        const exigible = arrondir(sorties.filter(l => l.enRetard).reduce((s, l) => s + l.montant, 0));

        return {
            brut,
            exigible,                                   // du maintenant, bloque la suite
            engage30j: engageCourt,
            engageTotal,
            immobilise: arrondir(immobilise.reduce((s, l) => s + l.montant, 0)),
            disponible: arrondir(brut - engageCourt),   // ce qu'on peut vraiment depenser ce mois
            alerte: brut < engageCourt
                ? `Vos engagements des 30 prochains jours (${engageCourt}) depassent votre solde (${brut}).`
                : null
        };
    }

    /**
     * Ligne de temps unique : sorties et entrees fusionnees, triees.
     * C'est la vue qui permet de repondre a « est-ce que je tiens jusqu'a
     * mon tour ? ».
     */
    static async tresorerie(clientId, jours = 90) {
        const limite = new Date(Date.now() + jours * 86400000);
        const [sorties, entrees] = await Promise.all([this._sorties(clientId), this._entrees(clientId)]);

        const evenements = [
            ...sorties.map(l => ({ ...l, sens: 'sortie', signe: -1 })),
            ...entrees.map(l => ({ ...l, sens: 'entree', signe: 1 })),
        ]
            .filter(l => new Date(l.date) <= limite)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const solde = await this.soldeReel(clientId);
        let courant = solde.brut;
        let creux = { montant: courant, date: null };

        const projection = evenements.map(e => {
            courant = arrondir(courant + e.signe * e.montant);
            if (courant < creux.montant) creux = { montant: courant, date: e.date };
            return { ...e, soldeApres: courant };
        });

        return {
            soldeDepart: solde.brut,
            soldeFin: courant,
            creux,                       // le point bas : la ou ca casse
            tiendra: creux.montant >= 0,
            evenements: projection
        };
    }

    /**
     * Vue complete, destinee a l'accueil de l'application et au contexte
     * du chatbot.
     */
    static async complete(clientId) {
        const [solde, sorties, entrees, immobilise] = await Promise.all([
            this.soldeReel(clientId),
            this._sorties(clientId),
            this._entrees(clientId),
            this._immobilise(clientId),
        ]);

        const prochainTour = entrees.sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
        const prochaineSortie = sorties
            .slice()
            .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;

        return {
            solde,
            engagements: sorties.sort((a, b) => new Date(a.date) - new Date(b.date)),
            aRecevoir: entrees,
            immobilise,
            prochainTour,
            prochaineEcheance: prochaineSortie,
            totalARecevoir: arrondir(entrees.reduce((s, l) => s + l.montant, 0))
        };
    }

    /**
     * « Combien de temps pour financer ce projet par la tontine ? »
     *
     * Repond a la question que se pose vraiment un utilisateur devant un
     * projet trop cher : est-ce qu'une tontine m'y amene, et quand.
     */
    static async simulerFinancement(clientId, montantCible) {
        const cible = arrondir(montantCible);
        const entrees = await this._entrees(clientId);
        const tries = entrees.sort((a, b) => new Date(a.date) - new Date(b.date));

        let cumul = 0;
        const couverture = [];
        for (const t of tries) {
            cumul = arrondir(cumul + t.montant);
            couverture.push({ ...t, cumul });
            if (cumul >= cible) break;
        }

        const suffisant = cumul >= cible;
        return {
            cible,
            couvertPar: couverture,
            totalPrevu: cumul,
            manque: suffisant ? 0 : arrondir(cible - cumul),
            suffisant,
            dateCouverture: suffisant ? couverture[couverture.length - 1].date : null,
            conseil: suffisant
                ? `Vos tours a venir couvrent ce montant. Le dernier necessaire tombe le ${new Date(couverture[couverture.length - 1].date).toLocaleDateString('fr-FR')}.`
                : entrees.length
                    ? `Vos tours actuels apportent ${cumul} FCFA. Il manque ${arrondir(cible - cumul)} FCFA : une seconde tontine ou un apport d'epargne comblerait l'ecart.`
                    : "Vous n'avez aucun tour a venir. Rejoindre une tontine rendrait ce projet finançable a date fixe."
        };
    }
}

module.exports = SyntheseService;

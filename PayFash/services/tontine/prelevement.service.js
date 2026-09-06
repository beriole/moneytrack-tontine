'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineAmende
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir, portefeuilleClient, exigerRole
} = require('./commun');
const CycleService = require('./cycle.service');
const { AmendeService } = require('./amende.service');
const NotificationService = require('./notification.service');

// =====================================================================
//  Le mandat de prelevement — « ne rate plus jamais une cotisation ».
//
//  Une amende evitee vaut mieux qu'une amende notifiee. Le membre
//  autorise le systeme a regler sa cotisation quelques jours avant
//  l'echeance ; le planificateur s'en charge, et previent dans les deux
//  cas : preleve, ou solde insuffisant.
//
//  Trois regles non negociables :
//
//    1. jamais de decouvert. Si le solde ne suffit pas, on ne preleve
//       rien du tout et on alerte — un prelevement partiel laisserait la
//       cotisation ouverte ET le portefeuille vide.
//    2. les amendes d'abord. Une amende due bloque la cotisation ; les
//       regler ensemble est la seule facon d'honorer le mandat.
//    3. rien ne s'execute apres l'echeance. Passe la date, c'est la
//       procedure de defaut qui s'applique, pas un prelevement discret.
// =====================================================================

// Minuit du jour de l'echeance. La fenetre de prelevement s'ouvre a
// « debut du jour de l'echeance moins n jours », et non a l'INSTANT de
// l'echeance moins n jours : avec joursAvant = 0 l'ouverture tombait
// exactement sur dateFinPrevue, or les cycles retenus sont ceux dont
// l'echeance est encore a venir — les deux conditions s'excluaient et le
// mandat « le jour de l'echeance » ne s'executait jamais.
function debutDuJour(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function ouvertureFenetre(echeance, joursAvant) {
    return new Date(debutDuJour(echeance).getTime() - joursAvant * 86400000);
}

class PrelevementService {

    // -----------------------------------------------------------------
    //  Reglage
    // -----------------------------------------------------------------
    static async activer(clientId, groupeId, options = {}) {
        const jours = options.joursAvant !== undefined ? parseInt(options.joursAvant, 10) : 2;
        if (!(jours >= 0 && jours <= 15)) {
            throw new ErreurTontine(400, 'Le delai doit etre compris entre 0 et 15 jours avant l\'echeance');
        }

        const membre = await exigerRole(groupeId, clientId, [], null);
        if (membre.statut !== 'actif') throw new ErreurTontine(403, 'Seul un membre actif peut donner un mandat');

        await membre.update({ prelevementAuto: true, prelevementJoursAvant: jours });
        return {
            actif: true,
            joursAvant: jours,
            message: jours === 0
                ? 'Votre cotisation sera reglee automatiquement le jour de l\'echeance.'
                : `Votre cotisation sera reglee automatiquement ${jours} jour(s) avant l'echeance.`
        };
    }

    static async desactiver(clientId, groupeId) {
        const membre = await exigerRole(groupeId, clientId, [], null);
        await membre.update({ prelevementAuto: false });
        return { actif: false, message: 'Mandat retire. Vos cotisations redeviennent manuelles.' };
    }

    // -----------------------------------------------------------------
    //  Etat et anticipation
    // -----------------------------------------------------------------
    /**
     * Etat du mandat, ET la question qui compte vraiment : est-ce que le
     * solde suffira le jour venu ? Prevenir dix jours avant qu'il manquera
     * 12 000 FCFA vaut mieux que le constater le jour meme.
     */
    static async etat(clientId, groupeId) {
        const membre = await exigerRole(groupeId, clientId, [], null);
        const groupe = await TontineGroupe.findByPk(groupeId);

        const cycle = groupe.numeroCycleActuel > 0
            ? await TontineCycle.findOne({
                where: { groupeId, numeroCycle: groupe.numeroCycleActuel }
            })
            : null;

        const cotisation = cycle
            ? await TontineCotisation.findOne({ where: { cycleId: cycle.id, clientId } })
            : null;

        const amendes = await TontineAmende.findAll({
            where: { groupeId, clientId, statut: 'due' }
        });
        const totalAmendes = arrondir(amendes.reduce((s, a) => s + nombre(a.montant), 0));

        let portefeuille = null;
        try { portefeuille = await portefeuilleClient(clientId, null); } catch (e) { /* aucun portefeuille */ }
        const solde = portefeuille ? arrondir(portefeuille.solde) : 0;

        const restant = cotisation && cotisation.statut !== 'payee'
            ? arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye))
            : 0;
        const besoin = arrondir(restant + totalAmendes);
        const manque = arrondir(Math.max(0, besoin - solde));

        // L'execution se cale sur cycle.dateFinPrevue : l'etat doit annoncer
        // la meme date, sinon l'utilisateur lit un jour et le systeme en
        // applique un autre des que les deux divergent.
        const dateEcheance = cycle ? cycle.dateFinPrevue : (cotisation ? cotisation.dateEcheance : null);
        const datePrelevement = dateEcheance
            ? ouvertureFenetre(dateEcheance, membre.prelevementJoursAvant)
            : null;

        return {
            actif: membre.prelevementAuto,
            joursAvant: membre.prelevementJoursAvant,
            prochaineEcheance: dateEcheance,
            datePrelevement,
            besoin,
            detailBesoin: { cotisation: restant, amendes: totalAmendes },
            solde,
            manque,
            couvert: besoin === 0 || manque === 0,
            avertissement: manque > 0
                ? `Il vous manquera ${manque} FCFA le jour du prelevement. Rechargez avant le ${
                    datePrelevement ? new Date(datePrelevement).toLocaleDateString('fr-FR') : 'jour de l\'echeance'}.`
                : null
        };
    }

    // -----------------------------------------------------------------
    //  Execution — appelee par le planificateur
    // -----------------------------------------------------------------
    /**
     * Regle les cotisations sous mandat dont la date de prelevement est
     * atteinte et l'echeance pas encore passee.
     */
    static async executerEcheances(maintenant = new Date()) {
        const rapport = { examines: 0, preleves: 0, insuffisants: 0, montantTotal: 0, erreurs: [] };

        const cycles = await TontineCycle.findAll({
            where: { statut: 'actif', dateFinPrevue: { [Op.gt]: maintenant } },
            include: [{ model: TontineGroupe, as: 'groupe' }]
        });

        for (const cycle of cycles) {
            const impayees = await TontineCotisation.findAll({
                where: { cycleId: cycle.id, statut: { [Op.in]: ['attendue', 'partielle'] } }
            });

            for (const cotisation of impayees) {
                const membre = await TontineMembre.findByPk(cotisation.membreId);
                if (!membre || !membre.prelevementAuto || membre.statut !== 'actif') continue;

                // La fenetre s'ouvre au debut du jour J-n et se ferme a
                // l'echeance. Voir ouvertureFenetre : calee sur l'instant de
                // l'echeance, elle etait vide pour joursAvant = 0.
                const ouverture = ouvertureFenetre(cycle.dateFinPrevue, membre.prelevementJoursAvant);
                if (maintenant.getTime() < ouverture.getTime()) continue;

                rapport.examines++;
                try {
                    const r = await this._reglerUn(cotisation, cycle, membre);
                    if (r.preleve) {
                        rapport.preleves++;
                        rapport.montantTotal = arrondir(rapport.montantTotal + r.montant);
                    } else {
                        rapport.insuffisants++;
                    }
                } catch (e) {
                    rapport.erreurs.push({ cotisationId: cotisation.id, message: e.message });
                }
            }
        }

        rapport.montantTotal = arrondir(rapport.montantTotal);
        return rapport;
    }

    /**
     * Regle une cotisation sous mandat : amendes d'abord, cotisation
     * ensuite, et rien du tout si le compte ne couvre pas l'ensemble.
     */
    static async _reglerUn(cotisation, cycle, membre) {
        const clientId = cotisation.clientId;
        const groupe = cycle.groupe || await TontineGroupe.findByPk(cycle.groupeId);

        const amendes = await TontineAmende.findAll({
            where: { groupeId: groupe.id, clientId, statut: 'due' }
        });
        const totalAmendes = arrondir(amendes.reduce((s, a) => s + nombre(a.montant), 0));
        const restant = arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye));
        const besoin = arrondir(totalAmendes + restant);
        if (besoin <= 0) return { preleve: false, montant: 0, raison: 'rien a regler' };

        // Regles 1 et 2 dans UNE SEULE transaction.
        //
        // Le controle de solde se faisait hors transaction, puis chaque amende
        // et la cotisation ouvraient la leur : un echec en cours de route —
        // solde parti entre-temps, cotisation refusee — laissait les amendes
        // payees et la cotisation ouverte. C'est exactement le reglement
        // partiel que la regle 1 interdit. Tout passe ou rien ne passe.
        try {
            await db.transaction(async (t) => {
                const portefeuille = await portefeuilleClient(clientId, t, true);

                if (arrondir(portefeuille.solde) < besoin) {
                    const manque = arrondir(besoin - arrondir(portefeuille.solde));
                    throw Object.assign(new Error('solde insuffisant'), { insuffisant: true, manque });
                }

                // Les amendes d'abord : une amende due bloque la cotisation.
                for (const a of amendes) {
                    await AmendeService.payerDans(clientId, a.id, t);
                }
                await CycleService.cotiserDans(clientId, cycle.id, restant, t);
            });
        } catch (e) {
            if (e.insuffisant) {
                await NotificationService.envoyer(clientId,
                    `Prelevement automatique impossible pour « ${groupe.nom} » : il manque ${
                        Math.round(e.manque).toLocaleString('fr-FR')} FCFA. Rechargez avant l'echeance pour eviter l'amende.`,
                    {
                        type: 'alerte', lien: { ecran: 'Recharge' },
                        cle: `prel-ko-${cycle.id}-${clientId}-${new Date().toISOString().slice(0, 10)}`
                    });
                return { preleve: false, montant: 0, raison: 'solde insuffisant', manque: e.manque };
            }
            if (e.code === 404 && /portefeuille/i.test(e.message || '')) {
                await NotificationService.envoyer(clientId,
                    `Prelevement impossible pour « ${groupe.nom} » : aucun portefeuille actif.`,
                    { type: 'alerte', lien: { ecran: 'DetailTontine', params: { groupeId: groupe.id } } });
                return { preleve: false, montant: 0, raison: 'aucun portefeuille' };
            }
            throw e;
        }

        await NotificationService.envoyer(clientId,
            totalAmendes > 0
                ? `Cotisation de « ${groupe.nom} » reglee automatiquement : ${
                    Math.round(restant).toLocaleString('fr-FR')} FCFA, plus ${
                    Math.round(totalAmendes).toLocaleString('fr-FR')} FCFA d'amendes.`
                : `Cotisation de « ${groupe.nom} » reglee automatiquement : ${
                    Math.round(restant).toLocaleString('fr-FR')} FCFA.`,
            {
                lien: { ecran: 'DetailTontine', params: { groupeId: groupe.id } },
                cle: `prel-ok-${cycle.id}-${clientId}`
            });

        return { preleve: true, montant: besoin, amendes: totalAmendes, cotisation: restant };
    }

    /**
     * Alerte anticipee : prevenir plusieurs jours avant qu'il manquera de
     * l'argent, pendant qu'il est encore temps de recharger.
     */
    static async alerterProvision(maintenant = new Date(), joursAnticipation = 5) {
        let alertes = 0;
        const limite = new Date(maintenant.getTime() + joursAnticipation * 86400000);

        const cycles = await TontineCycle.findAll({
            where: {
                statut: 'actif',
                dateFinPrevue: { [Op.gt]: maintenant, [Op.lte]: limite }
            },
            include: [{ model: TontineGroupe, as: 'groupe' }]
        });

        for (const cycle of cycles) {
            const impayees = await TontineCotisation.findAll({
                where: { cycleId: cycle.id, statut: { [Op.in]: ['attendue', 'partielle'] } }
            });

            for (const cotisation of impayees) {
                const membre = await TontineMembre.findByPk(cotisation.membreId);
                if (!membre || !membre.prelevementAuto) continue;

                const etat = await this.etat(cotisation.clientId, cycle.groupeId).catch(() => null);
                if (!etat || etat.couvert) continue;

                const jour = new Date(maintenant).toISOString().slice(0, 10);
                const envoye = await NotificationService.envoyer(cotisation.clientId,
                    `Il vous manquera ${Math.round(etat.manque).toLocaleString('fr-FR')} FCFA pour le prelevement de « ${
                        cycle.groupe.nom} ». Rechargez avant le ${
                        new Date(etat.datePrelevement).toLocaleDateString('fr-FR')}.`,
                    {
                        type: 'alerte', lien: { ecran: 'Recharge' },
                        cle: `prov-${cycle.id}-${cotisation.clientId}-${jour}`
                    });
                if (envoye) alertes++;
            }
        }
        return { alertes };
    }
}

module.exports = PrelevementService;

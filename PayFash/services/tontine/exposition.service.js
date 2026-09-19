'use strict';

const { Op } = require('sequelize');
const {
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineAmende
} = require('../../models');
const { ErreurTontine, nombre, arrondir } = require('./commun');

// =====================================================================
//  Exposition — ce qu'un membre doit encore a sa tontine.
//
//  Le probleme metier : un membre cotise, recoit le pot au tour 3 d'une
//  tontine de 10, et disparait. Il lui restait 7 cotisations a payer ;
//  les neuf autres perdent 7 x 50 000 = 350 000 FCFA. Ce montant — pas le
//  pot, l'ENGAGEMENT RESTANT — est ce que le systeme doit mesurer,
//  couvrir et surveiller. Plus le pot arrive tot, plus il est grand.
//
//  Le calcul existait deja, dans SyntheseService._cotisationsProjetees,
//  pour tracer un plan de tresorerie. Il ne servait qu'a afficher. Il vit
//  maintenant ici, seul, pour etre oppose a une operation : bloquer une
//  garantie, verser un pot, autoriser une enchere.
//
//  Trois natures d'engagement composent l'exposition :
//
//    ouverte    la cotisation du cycle en cours, tant qu'elle n'est pas
//               soldee — c'est une dette datee, deja en base ;
//    projetee   les cotisations des cycles a venir : elles n'existent pas
//               encore, on les deduit de la rotation (un tour par membre,
//               sauf le sien) ;
//    amendes    les amendes dues : exigibles tout de suite.
//
//  Un groupe qui n'a pas demarre n'a pas de tour attribue. On y calcule
//  l'exposition POTENTIELLE : celle du pire cas, ou l'on mangerait au
//  premier tour — tous les autres restent a payer.
// =====================================================================

class ExpositionService {

    /**
     * Cycles qu'il reste a jouer dans un groupe actif, en excluant celui
     * ou `membre` est beneficiaire : il n'y cotise pas.
     */
    static _cyclesRestants(groupe, membre, membresActifs) {
        const dernier = membresActifs;                // un tour par membre actif
        const restants = [];
        for (let c = groupe.numeroCycleActuel + 1; c <= dernier; c++) {
            if (c !== membre.ordreBeneficiaire) restants.push(c);
        }
        return restants;
    }

    /**
     * Exposition d'un membre dans un groupe.
     *
     * `options.t` : transaction ouverte, quand le calcul precede une
     * decision qu'il doit fonder.
     */
    static async pourMembre(clientId, groupeId, options = {}) {
        const t = options.t || null;
        const groupe = options.groupe
            || await TontineGroupe.findByPk(groupeId, { transaction: t });
        if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

        const membre = options.membre
            || await TontineMembre.findOne({ where: { groupeId, clientId }, transaction: t });
        if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");

        const cotisation = arrondir(groupe.montantParPeriode);
        const detail = [];

        // --- Amendes dues : exigibles maintenant -------------------------
        const amendes = await TontineAmende.findAll({
            where: { groupeId, clientId, statut: 'due' }, transaction: t
        });
        const amendesDues = arrondir(amendes.reduce((s, a) => s + nombre(a.montant), 0));
        for (const a of amendes) {
            detail.push({ nature: 'amende', cycle: a.cycleId, montant: arrondir(a.montant), motif: a.motif });
        }

        // --- Groupe clos ou adhesion finie : plus rien a venir ----------
        const finie = groupe.statut === 'termine'
            || ['exclu', 'sorti', 'termine'].includes(membre.statut);

        // --- Groupe pas demarre : le pire cas ------------------------------
        if (groupe.statut === 'en_attente') {
            const membres = await TontineMembre.count({
                where: { groupeId, statut: ['invite', 'actif'] }, transaction: t
            });
            const restantes = Math.max(0, membres - 1);
            const exposition = arrondir(restantes * cotisation);
            return {
                groupeId, clientId,
                statutGroupe: groupe.statut,
                demarre: false,
                potentielle: true,
                montantParPeriode: cotisation,
                cotisationsRestantes: restantes,
                cotisationsOuvertes: 0,
                amendesDues,
                exposition: arrondir(exposition + amendesDues),
                explication: `Tontine non demarree : au pire, vous mangez au premier tour et il vous reste `
                    + `${restantes} cotisation(s) de ${cotisation} FCFA a payer.`,
                detail
            };
        }

        // --- Cotisations ouvertes sur les cycles non verses ---------------
        let ouvertes = 0;
        if (!finie) {
            const cycles = await TontineCycle.findAll({
                where: { groupeId, statut: { [Op.ne]: 'complete' } },
                attributes: ['id', 'numeroCycle'], transaction: t
            });
            if (cycles.length) {
                const lignes = await TontineCotisation.findAll({
                    where: {
                        clientId,
                        cycleId: cycles.map(c => c.id),
                        statut: { [Op.in]: ['attendue', 'partielle', 'en_retard'] }
                    },
                    transaction: t
                });
                for (const c of lignes) {
                    const reste = arrondir(nombre(c.montantDu) - nombre(c.montantPaye));
                    if (reste <= 0) continue;
                    ouvertes = arrondir(ouvertes + reste);
                    const cycle = cycles.find(x => x.id === c.cycleId);
                    detail.push({
                        nature: 'cotisation_ouverte', cycle: cycle ? cycle.numeroCycle : null,
                        montant: reste, enRetard: c.statut === 'en_retard', date: c.dateEcheance
                    });
                }
            }
        }

        // --- Cotisations projetees sur les cycles a venir -----------------
        let projetees = [];
        if (!finie && membre.ordreBeneficiaire) {
            const actifs = await TontineMembre.count({ where: { groupeId, statut: 'actif' }, transaction: t });
            projetees = this._cyclesRestants(groupe, membre, actifs);
            for (const c of projetees) {
                detail.push({ nature: 'cotisation_projetee', cycle: c, montant: cotisation });
            }
        }
        const projete = arrondir(projetees.length * cotisation);

        const exposition = arrondir(ouvertes + projete + amendesDues);
        const dejaServi = membre.aBeneficie === true;

        return {
            groupeId, clientId,
            statutGroupe: groupe.statut,
            demarre: true,
            potentielle: false,
            montantParPeriode: cotisation,
            tour: membre.ordreBeneficiaire,
            cycleActuel: groupe.numeroCycleActuel,
            dejaServi,
            cotisationsOuvertes: ouvertes,
            cotisationsRestantes: projetees.length + (ouvertes > 0 ? 1 : 0),
            cotisationsProjetees: projete,
            amendesDues,
            exposition,
            explication: dejaServi
                ? `Vous avez recu le pot : il vous reste ${exposition} FCFA a verser au groupe. `
                  + "C'est l'engagement que vos garanties doivent couvrir."
                : `Il vous reste ${exposition} FCFA a cotiser avant la fin de la rotation.`,
            detail
        };
    }

    /**
     * Exposition consolidee d'un client sur toutes ses tontines.
     *
     * Une analyse qui ne regarderait que la tontine courante manquerait
     * l'essentiel : trois tontines a 50 000, 75 000 et 100 000 par mois,
     * c'est 225 000 FCFA d'engagement mensuel, quelle que soit celle qu'on
     * regarde.
     */
    static async pourClient(clientId) {
        const adhesions = await TontineMembre.findAll({
            where: { clientId, statut: { [Op.in]: ['invite', 'actif', 'suspendu'] } },
            include: [{ model: TontineGroupe, as: 'groupe' }]
        });

        const parGroupe = [];
        let total = 0, mensuel = 0;
        for (const m of adhesions) {
            if (!m.groupe || m.groupe.statut === 'termine') continue;
            const e = await this.pourMembre(clientId, m.groupe.id, { groupe: m.groupe, membre: m });
            parGroupe.push({ groupeId: m.groupe.id, nom: m.groupe.nom, frequence: m.groupe.frequence, ...e });
            total = arrondir(total + e.exposition);
            mensuel = arrondir(mensuel + this._parMois(m.groupe));
        }

        return {
            clientId,
            expositionTotale: total,
            engagementMensuel: mensuel,
            tontines: parGroupe.length,
            parGroupe
        };
    }

    /** Ramene une cotisation periodique a un equivalent mensuel. */
    static _parMois(groupe) {
        const m = arrondir(groupe.montantParPeriode);
        switch (groupe.frequence) {
            case 'hebdomadaire': return arrondir(m * 52 / 12);
            case 'quinzaine': return arrondir(m * 26 / 12);
            case 'trimestrielle': return arrondir(m / 3);
            default: return m;
        }
    }
}

module.exports = ExpositionService;

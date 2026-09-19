'use strict';

const { Op } = require('sequelize');
const { TontineGroupe, TontineMembre, TontineCaution, TontineGarantie } = require('../../models');
const { ErreurTontine, nombre, arrondir } = require('./commun');
const ExpositionService = require('./exposition.service');

// =====================================================================
//  Couverture — ce qui protege le groupe contre la defaillance d'un
//  membre, rapporte a ce que ce membre doit encore.
//
//    couverture = (caution disponible + garanties bloquees) / exposition
//
//  Et la regle qui dit combien il en faut. Le principe metier : plus un
//  membre recoit le pot tot, plus il lui reste a payer, plus le groupe
//  doit exiger de lui. L'exposition, elle, grandit deja avec la precocite
//  — dix cotisations restantes au tour 1, une au tour 10 — si bien qu'un
//  taux fixe exige deja davantage, en francs, des premiers servis. Le
//  reglement peut accentuer ce biais en exigeant un taux plus eleve pour
//  les premiers tours.
//
//  Rien n'est code en dur : la regle vit sur le groupe, se choisit a la
//  creation, se modifie par vote et figure au reglement interieur. Un
//  groupe sans regle n'exige rien : c'est l'etat de tous les groupes
//  anterieurs, qui ne changent donc pas de comportement.
//
//  Forme de la regle :
//
//    { tauxParDefaut: 50,
//      paliers: [ { jusquAuTour: 2, taux: 100 },
//                 { jusquAuTour: 5, taux: 75 } ] }
//
//  Le taux d'un tour est celui du premier palier dont il ne depasse pas la
//  borne, sinon le taux par defaut.
// =====================================================================

/** Des regles toutes faites, pour que personne n'ait a ecrire de JSON. */
const MODELES = {
    aucune: {
        libelle: 'Aucune garantie exigee',
        regles: null
    },
    moitie: {
        libelle: 'La moitie de ce qui reste a payer, pour tous',
        regles: { tauxParDefaut: 50, paliers: [] }
    },
    premiers_tours: {
        libelle: 'Tout le reste a payer pour le premier tiers des tours, la moitie ensuite',
        // Le tiers est calcule a l'application, selon la taille du groupe.
        regles: { tauxParDefaut: 50, paliers: [{ jusquAuTiers: 1, taux: 100 }] }
    },
    totale: {
        libelle: 'Tout le reste a payer, pour tous',
        regles: { tauxParDefaut: 100, paliers: [] }
    }
};

class CouvertureService {

    static modeles() {
        return Object.entries(MODELES).map(([cle, m]) => ({ cle, libelle: m.libelle, regles: m.regles }));
    }

    /**
     * Valide et normalise une regle fournie par un client ou par un vote.
     * Accepte un nom de modele ('premiers_tours') ou un objet.
     * Renvoie null pour « aucune exigence ».
     */
    static normaliser(entree) {
        if (entree === undefined || entree === null || entree === '' || entree === 'aucune') return null;

        let r = entree;
        if (typeof entree === 'string') {
            if (MODELES[entree]) return MODELES[entree].regles;
            try { r = JSON.parse(entree); } catch (e) {
                throw new ErreurTontine(400, `Regle de couverture inconnue : « ${entree} »`);
            }
        }
        if (typeof r !== 'object' || Array.isArray(r)) {
            throw new ErreurTontine(400, 'La regle de couverture doit etre un objet');
        }

        const taux = (v, ou) => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0 || n > 100) {
                throw new ErreurTontine(400, `${ou} : un taux se donne entre 0 et 100 %`);
            }
            return Math.round(n * 100) / 100;
        };

        const tauxParDefaut = taux(r.tauxParDefaut ?? 0, 'Taux par defaut');
        const paliers = [];
        let precedent = 0;
        for (const [i, p] of (r.paliers || []).entries()) {
            const ou = `Palier ${i + 1}`;
            const tiers = p.jusquAuTiers !== undefined;
            const borne = Number(tiers ? p.jusquAuTiers : p.jusquAuTour);
            if (!Number.isInteger(borne) || borne < 1 || (tiers && borne > 3)) {
                throw new ErreurTontine(400, `${ou} : borne invalide`);
            }
            if (!tiers && borne <= precedent) {
                throw new ErreurTontine(400, `${ou} : les paliers se donnent par tours croissants`);
            }
            precedent = tiers ? precedent : borne;
            paliers.push(tiers
                ? { jusquAuTiers: borne, taux: taux(p.taux, ou) }
                : { jusquAuTour: borne, taux: taux(p.taux, ou) });
        }
        if (tauxParDefaut === 0 && paliers.every(p => p.taux === 0)) return null;
        return { tauxParDefaut, paliers };
    }

    /** La regle d'un groupe, lue telle qu'enregistree (JSON ou objet). */
    static regles(groupe) {
        let r = groupe.reglesCouverture;
        if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = null; } }
        return r && typeof r === 'object' ? r : null;
    }

    /**
     * Taux de couverture exige pour un tour donne, dans un groupe de
     * `taille` tours.
     */
    static tauxExige(groupe, tour, taille) {
        const r = this.regles(groupe);
        if (!r) return 0;
        if (tour) {
            for (const p of r.paliers || []) {
                const borne = p.jusquAuTiers !== undefined
                    ? Math.max(1, Math.ceil((taille || 1) * p.jusquAuTiers / 3))
                    : p.jusquAuTour;
                if (tour <= borne) return nombre(p.taux);
            }
        }
        return nombre(r.tauxParDefaut);
    }

    /** Description lisible, pour le reglement et les ecrans. */
    static decrire(groupe, taille) {
        const r = this.regles(groupe);
        if (!r) return 'Aucune garantie exigee.';
        const morceaux = [];
        for (const p of r.paliers || []) {
            const borne = p.jusquAuTiers !== undefined
                ? Math.max(1, Math.ceil((taille || 1) * p.jusquAuTiers / 3))
                : p.jusquAuTour;
            morceaux.push(`${p.taux} % pour les tours 1 a ${borne}`);
        }
        morceaux.push(`${r.tauxParDefaut} % ${morceaux.length ? 'ensuite' : 'pour tous les tours'}`);
        return `Couverture exigee avant de recevoir le pot, en part de ce qui reste a payer : ${morceaux.join(', ')}.`;
    }

    static ratio(couvert, exposition) {
        // Sans engagement, la couverture est entiere : rien a couvrir.
        if (!(exposition > 0)) return 100;
        return Math.round((couvert / exposition) * 10000) / 100;
    }

    static async _cautionDisponible(clientId, groupeId, t) {
        const caution = await TontineCaution.findOne({
            where: { clientId, groupeId, statut: { [Op.ne]: 'liberee' } }, transaction: t
        });
        return caution ? arrondir(nombre(caution.montantBloque) - nombre(caution.montantUtilise)) : 0;
    }

    static async _garantiesBloquees(clientId, groupeId, t) {
        const garanties = await TontineGarantie.findAll({
            where: { clientId, groupeId, statut: { [Op.in]: ['active', 'partiellement_utilisee'] } },
            transaction: t
        });
        return arrondir(garanties.reduce((s, g) =>
            s + nombre(g.montantInitial) - nombre(g.montantUtilise) - nombre(g.montantLibere), 0));
    }

    /**
     * Couverture d'un membre, et ce que la regle du groupe exige de lui.
     *
     * `options.t` : transaction ouverte, quand le calcul fonde une decision.
     */
    static async pourMembre(clientId, groupeId, options = {}) {
        const t = options.t || null;
        const groupe = options.groupe || await TontineGroupe.findByPk(groupeId, { transaction: t });
        if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
        const membre = options.membre
            || await TontineMembre.findOne({ where: { groupeId, clientId }, transaction: t });
        if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");

        const exposition = await ExpositionService.pourMembre(clientId, groupeId, { t, groupe, membre });
        const caution = await this._cautionDisponible(clientId, groupeId, t);
        const garanties = await this._garantiesBloquees(clientId, groupeId, t);
        const couvert = arrondir(caution + garanties);

        const taille = groupe.statut === 'en_attente'
            ? groupe.membresMax
            : await TontineMembre.count({
                where: { groupeId, ordreBeneficiaire: { [Op.ne]: null } }, transaction: t
            });
        // Avant le tirage, le tour est inconnu : on applique l'exigence du
        // pire cas, celle du premier tour.
        const tour = membre.ordreBeneficiaire || (groupe.statut === 'en_attente' ? 1 : null);
        const tauxExige = this.tauxExige(groupe, tour, taille);
        const montantExige = arrondir(exposition.exposition * tauxExige / 100);
        const manque = arrondir(Math.max(0, montantExige - couvert));

        return {
            groupeId: groupe.id, clientId,
            tour,
            exposition: exposition.exposition,
            caution, garanties, couvert,
            couverture: this.ratio(couvert, exposition.exposition),
            tauxExige,
            montantExige,
            manque,
            suffisant: manque <= 0,
            regle: this.decrire(groupe, taille)
        };
    }

    /**
     * La couverture exigee au moment de verser le pot a son beneficiaire.
     *
     * C'est le moment critique : juste apres, il n'aura plus d'interet a
     * cotiser. Le calcul est refait ICI, dans la transaction du versement,
     * et non repris d'un etat anterieur. L'exposition du beneficiaire ne
     * compte deja plus le cycle en cours — il n'y cotise pas — : c'est ce
     * qu'il devra encore APRES avoir recu le pot.
     */
    static async exigerPourVersement(beneficiaireId, groupe, t) {
        const c = await this.pourMembre(beneficiaireId, groupe.id, { t, groupe });
        if (c.suffisant) return c;
        throw new ErreurTontine(409,
            `Versement suspendu : le beneficiaire doit encore ${c.exposition} FCFA au groupe apres ce tour, `
            + `et le reglement exige qu'il en garantisse ${c.tauxExige} % (${c.montantExige} FCFA). `
            + `Il en couvre ${c.couvert} FCFA : il manque ${c.manque} FCFA de garantie. `
            + `Le pot sera verse des qu'il aura complete sa couverture.`);
    }
}

module.exports = CouvertureService;

'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation
} = require('../../models');
const ENV = require('../../config/index');
const EcheancierService = require('./echeancier.service');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, caisseGroupe, ecrireTransaction, transferer
} = require('./commun');

class CycleService {

    // -----------------------------------------------------------------
    //  Cotisations attendues
    // -----------------------------------------------------------------
    /**
     * Ouvre une ligne de cotisation par membre actif, sauf le beneficiaire
     * du cycle : il ne cotise pas pour son propre tour.
     *
     * C'est la table qui manquait a NjanguiPay. Sans elle on ne connait que
     * le solde global du groupe, jamais qui a paye pour quel cycle.
     */
    static async genererCotisations(cycle, groupe, membres, t) {
        const montant = nombre(groupe.montantParPeriode);
        const lignes = membres
            .filter(m => m.statut === 'actif' && m.clientId !== cycle.beneficiaireId)
            .map(m => ({
                cycleId: cycle.id,
                membreId: m.id,
                clientId: m.clientId,
                montantDu: montant,
                montantPaye: 0,
                statut: 'attendue',
                dateEcheance: cycle.dateFinPrevue
            }));

        if (lignes.length) await TontineCotisation.bulkCreate(lignes, { transaction: t });
        return lignes.length;
    }

    // -----------------------------------------------------------------
    //  Cotiser
    // -----------------------------------------------------------------
    /**
     * Debite le portefeuille du membre et credite la caisse du groupe,
     * dans une seule transaction SQL.
     * `montant` est optionnel : par defaut on solde ce qui reste du.
     */
    static async cotiser(clientId, cycleId, montant) {
        return db.transaction(async (t) => {
            const cycle = await TontineCycle.findByPk(cycleId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!cycle) throw new ErreurTontine(404, 'Cycle introuvable');
            if (cycle.statut === 'complete') throw new ErreurTontine(409, 'Ce cycle est deja verse');

            const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t });
            if (groupe.statut !== 'actif') throw new ErreurTontine(409, "Ce groupe n'est pas actif");

            const membre = await TontineMembre.findOne({
                where: { groupeId: groupe.id, clientId }, transaction: t
            });
            if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");
            if (membre.statut !== 'actif') throw new ErreurTontine(403, `Votre statut dans ce groupe est "${membre.statut}"`);

            const cotisation = await TontineCotisation.findOne({
                where: { cycleId: cycle.id, membreId: membre.id },
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (!cotisation) {
                throw new ErreurTontine(409, "Aucune cotisation attendue de votre part sur ce cycle : vous en etes le beneficiaire");
            }
            if (cotisation.statut === 'payee') throw new ErreurTontine(409, 'Votre cotisation est deja soldee pour ce cycle');

            // Caisse 4 : une amende impayee bloque la cotisation suivante.
            const { AmendeService } = require('./amende.service');
            await AmendeService.exigerAucuneAmendeDue(clientId, groupe.id, t);

            const dejaPaye = nombre(cotisation.montantPaye);
            const reste = arrondir(nombre(cotisation.montantDu) - dejaPaye);
            const aVerser = montant !== undefined && montant !== null
                ? Math.min(arrondir(montant), reste)
                : reste;
            if (aVerser <= 0) throw new ErreurTontine(400, 'Le montant doit etre strictement positif');

            const portefeuille = await portefeuilleClient(clientId, t, true);
            const caisse = await caisseGroupe(groupe, t, true);
            await transferer(portefeuille, caisse, aVerser, t);

            // La reference inclut le deja-paye : un double clic reenvoie la
            // meme reference et heurte la contrainte d'unicite, tandis qu'un
            // second versement legitime en produit une differente.
            const transaction = await this._ecrireOuRejeter({
                montant: aVerser,
                type: 'cotisation',
                description: `Cotisation cycle ${cycle.numeroCycle} — ${groupe.nom}`,
                clientId,
                groupeId: groupe.id,
                cycleId: cycle.id,
                reference: `TNT-COT-${cycle.id}-${membre.id}-${dejaPaye}`
            }, t);

            // Pont vers le budget : si le membre a rattache cette tontine a
            // une categorie, la cotisation s'y inscrit comme depense. Dans la
            // MEME transaction : un budget qui derive du grand livre est pire
            // qu'un budget absent.
            const IntegrationService = require('./integration.service');
            await IntegrationService.imputerCotisation(
                membre, groupe, aVerser,
                `Cotisation ${groupe.nom} — cycle ${cycle.numeroCycle}`, t
            );

            const total = arrondir(dejaPaye + aVerser);
            const solde = total >= nombre(cotisation.montantDu);
            await cotisation.update({
                montantPaye: total,
                statut: solde ? 'payee' : 'partielle',
                datePaiement: solde ? new Date() : cotisation.datePaiement,
                transactionId: transaction.id
            }, { transaction: t });

            await cycle.update({
                montantCollecte: arrondir(nombre(cycle.montantCollecte) + aVerser)
            }, { transaction: t });

            const restantes = await TontineCotisation.count({
                where: { cycleId: cycle.id, statut: { [Op.ne]: 'payee' } }, transaction: t
            });

            return {
                cotisation,
                transaction,
                soldeRestantPortefeuille: arrondir(portefeuille.solde),
                potActuel: arrondir(caisse.solde),
                cotisationsRestantes: restantes,
                potComplet: restantes === 0
            };
        });
    }

    /** Transforme une violation d'unicite de reference en 409 lisible. */
    static async _ecrireOuRejeter(donnees, t) {
        try {
            return await ecrireTransaction(donnees, t);
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new ErreurTontine(409, 'Cette operation a deja ete enregistree');
            }
            throw e;
        }
    }

    // -----------------------------------------------------------------
    //  Etat des cotisations
    // -----------------------------------------------------------------
    static async etatCotisations(clientId, cycleId) {
        const cycle = await TontineCycle.findByPk(cycleId);
        if (!cycle) throw new ErreurTontine(404, 'Cycle introuvable');

        const moi = await TontineMembre.findOne({ where: { groupeId: cycle.groupeId, clientId } });
        if (!moi) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");

        const cotisations = await TontineCotisation.findAll({
            where: { cycleId },
            include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }],
            order: [['id', 'ASC']]
        });

        const payees = cotisations.filter(c => c.statut === 'payee');
        return {
            cycle,
            attendu: arrondir(cycle.montantAttendu),
            collecte: arrondir(cycle.montantCollecte),
            potComplet: payees.length === cotisations.length && cotisations.length > 0,
            avancement: `${payees.length}/${cotisations.length}`,
            cotisations
        };
    }

    // -----------------------------------------------------------------
    //  Versement du pot
    // -----------------------------------------------------------------
    /**
     * Verse le pot au beneficiaire et fait tourner la rotation, dans une
     * seule transaction SQL : une tontine ne peut jamais rester payee sans
     * avoir tourne, ni avoir tourne sans avoir paye.
     *
     * `acteur` vaut { clientId } depuis une route, { systeme: true } depuis
     * un appel interne.
     */
    static async verser(acteur, cycleId, options = {}) {
        return this._verser(acteur, cycleId, options).then(async (r) => {
            // Apres le commit : le pot est verse, la notification est un
            // bonus. Si elle echoue, l'argent a quand meme bouge.
            const NotificationService = require('./notification.service');
            const groupe = await TontineGroupe.findByPk(r.groupeId);
            if (groupe) {
                await NotificationService.potVerse(
                    groupe, r.cycleVerse, r.beneficiaireId, r.net, r.destination);
                if (r.cycleSuivant) {
                    await NotificationService.cycleDemarre(groupe, r.cycleSuivant, r.cycleSuivant.beneficiaireId);
                }
            }
            return r;
        });
    }

    static async _verser(acteur, cycleId, options = {}) {
        // Le forçage est reserve a un appel systeme : il n'arrive ici que
        // par le maker-checker, apres accord de deux administrateurs.
        const force = options.force === true && acteur.systeme === true;

        return db.transaction(async (t) => {
            const cycle = await TontineCycle.findByPk(cycleId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!cycle) throw new ErreurTontine(404, 'Cycle introuvable');
            if (cycle.statut === 'complete') throw new ErreurTontine(409, 'Ce cycle a deja ete verse');

            const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            // --- Autorisation -------------------------------------------
            if (!acteur.systeme) {
                const moi = await TontineMembre.findOne({
                    where: { groupeId: groupe.id, clientId: acteur.clientId }, transaction: t
                });
                const autorise = groupe.createurId === acteur.clientId
                    || (moi && ['president', 'tresorier'].includes(moi.role));
                if (!autorise) {
                    throw new ErreurTontine(403, 'Seuls le president et le tresorier peuvent declencher le versement');
                }
            }

            // --- Invariant : le pot doit etre complet -------------------
            // NjanguiPay ne verifiait que le solde global du groupe. Un
            // groupe enrichi par les cycles precedents pouvait donc payer
            // alors que plusieurs membres n'avaient rien verse.
            const impayees = await TontineCotisation.findAll({
                where: { cycleId: cycle.id, statut: { [Op.ne]: 'payee' } },
                include: [{ model: Client, as: 'client', attributes: ['nom'] }],
                transaction: t
            });
            if (impayees.length && !force) {
                const noms = impayees.map(c => (c.client ? c.client.nom : `client ${c.clientId}`)).join(', ');
                throw new ErreurTontine(409, `Pot incomplet : ${impayees.length} cotisation(s) non soldee(s) — ${noms}`);
            }

            const caisse = await caisseGroupe(groupe, t, true);
            const attendu = arrondir(cycle.montantAttendu);
            if (arrondir(caisse.solde) < attendu && !force) {
                throw new ErreurTontine(409, `Caisse insuffisante : ${arrondir(caisse.solde)} disponible, ${attendu} requis`);
            }
            if (force && arrondir(caisse.solde) <= 0) {
                throw new ErreurTontine(409, "La caisse est vide : il n'y a rien a verser");
            }

            // En versement force, le beneficiaire recoit ce qui a REELLEMENT
            // ete collecte, pas le pot theorique. Marquer les cotisations
            // manquantes comme payees pour faire tomber le controle serait
            // mentir au grand livre : l'argent n'est pas la. Le manque reste
            // une dette, recouvrable ensuite par la caution ou le garant.
            const manque = force ? arrondir(Math.max(0, attendu - arrondir(caisse.solde))) : 0;

            // Le beneficiaire prend TOUT le contenu de la caisse, pas
            // seulement le montant attendu. La caisse ne porte que le cycle
            // en cours (elle revient a zero a chaque versement), donc le
            // surplus ne peut venir que des amendes dirigees vers le pot :
            // c'est exactement l'indemnisation du beneficiaire lese par un
            // retard. Cautions et epargne vivent dans d'autres portefeuilles.
            const pot = arrondir(caisse.solde);
            const bonusAmendes = arrondir(pot - attendu);

            // --- Frais de plateforme ------------------------------------
            // Resolus AVANT tout mouvement : sans compte d'arrivee, on ne
            // preleve rien plutot que de creer une ecriture orpheline
            // (piege n.6 de NjanguiPay).
            let frais = 0;
            let portefeuillePlateforme = null;
            const taux = nombre(ENV.TONTINE_FRAIS_PLATEFORME);
            if (taux > 0 && ENV.TONTINE_CLIENT_PLATEFORME_ID) {
                try {
                    portefeuillePlateforme = await portefeuilleClient(ENV.TONTINE_CLIENT_PLATEFORME_ID, t, true);
                    frais = Math.floor(pot * taux);
                } catch (e) {
                    console.warn(`[tontine] Frais non preleves : ${e.message}`);
                    portefeuillePlateforme = null;
                    frais = 0;
                }
            }
            // --- Decote d'enchere ---------------------------------------
            // Si le pot a ete adjuge, le gagnant renonce a une part et
            // celle-ci revient aux cotisants : c'est le rendement de leur
            // patience, et toute la raison d'etre du mode enchere.
            const EnchereService = require('./enchere.service');
            const enchere = await EnchereService.gagnante(cycle.id, t);
            const decote = enchere ? arrondir(enchere.montantDecote) : 0;

            let partDecote = 0;
            let cotisants = [];
            if (decote > 0) {
                cotisants = await TontineCotisation.findAll({ where: { cycleId: cycle.id }, transaction: t });
                partDecote = cotisants.length ? Math.floor(decote / cotisants.length) : 0;
            }
            const totalRedistribue = arrondir(partDecote * cotisants.length);

            // Le reliquat de division reste au beneficiaire : la caisse doit
            // revenir a zero au centime pres.
            const net = arrondir(pot - frais - totalRedistribue);

            // --- Mouvements ---------------------------------------------
            // Le beneficiaire peut avoir dirige son tour vers un projet ou
            // une epargne. C'est le geste qui fait d'une tontine un moyen de
            // financement plutot qu'une rentree qui se dilue dans le courant.
            const IntegrationService = require('./integration.service');
            const destinationChoisie = await IntegrationService.destinationTour(cycle.beneficiaireId, groupe.id, t);
            const portefeuilleBeneficiaire = destinationChoisie
                || await portefeuilleClient(cycle.beneficiaireId, t, true);
            await transferer(caisse, portefeuilleBeneficiaire, net, t);

            for (const c of cotisants) {
                if (partDecote <= 0) break;
                const pf = await portefeuilleClient(c.clientId, t, true);
                await transferer(caisse, pf, partDecote, t);
                await this._ecrireOuRejeter({
                    montant: partDecote,
                    type: 'decote_enchere',
                    description: `Part de decote — cycle ${cycle.numeroCycle} de ${groupe.nom}`,
                    clientId: c.clientId,
                    groupeId: groupe.id,
                    cycleId: cycle.id,
                    reference: `TNT-DEC-${cycle.id}-${c.clientId}`
                }, t);
            }

            const versement = await this._ecrireOuRejeter({
                montant: net,
                type: 'versement',
                description: destinationChoisie
                    ? `Versement du pot vers « ${destinationChoisie.nom || destinationChoisie.typePortefeuille} » — cycle ${cycle.numeroCycle} de ${groupe.nom}`
                    : `Versement du pot — cycle ${cycle.numeroCycle} de ${groupe.nom}`,
                clientId: cycle.beneficiaireId,
                groupeId: groupe.id,
                cycleId: cycle.id,
                reference: `TNT-VRS-${cycle.id}`
            }, t);

            if (frais > 0 && portefeuillePlateforme) {
                await transferer(caisse, portefeuillePlateforme, frais, t);
                await this._ecrireOuRejeter({
                    montant: frais,
                    type: 'frais_plateforme',
                    description: `Frais de plateforme — cycle ${cycle.numeroCycle} de ${groupe.nom}`,
                    clientId: ENV.TONTINE_CLIENT_PLATEFORME_ID,
                    groupeId: groupe.id,
                    cycleId: cycle.id,
                    reference: `TNT-FRA-${cycle.id}`
                }, t);
            }

            await cycle.update({ statut: 'complete', dateFin: new Date() }, { transaction: t });

            const suite = await this.avancerRotation(cycle, groupe, t);

            return {
                versement,
                groupeId: groupe.id,
                cycleVerse: cycle,
                pot,
                potAttendu: attendu,
                force,
                manque,
                bonusAmendes,
                decote,
                partDecote,
                frais,
                net,
                beneficiaireId: cycle.beneficiaireId,
                destination: destinationChoisie
                    ? { id: destinationChoisie.id, nom: destinationChoisie.nom, type: destinationChoisie.typePortefeuille }
                    : null,
                cycleSuivant: suite.cycleSuivant,
                tontineTerminee: suite.terminee
            };
        });
    }

    // -----------------------------------------------------------------
    //  Rotation
    // -----------------------------------------------------------------
    /**
     * Marque le beneficiaire comme servi, puis ouvre le cycle suivant ou
     * cloture la tontine. Tourne dans la transaction de `verser`.
     */
    static async avancerRotation(cycle, groupe, t) {
        const servi = await TontineMembre.findOne({
            where: { groupeId: groupe.id, clientId: cycle.beneficiaireId },
            transaction: t, lock: t.LOCK.UPDATE
        });
        if (servi) await servi.update({ aBeneficie: true }, { transaction: t });

        // Le prochain beneficiaire est le plus petit tour PAS ENCORE SERVI,
        // sans comparaison au tour courant. Cette formulation resiste aux
        // trois choses qui reordonnent la file : une exclusion (phase 3),
        // un echange de tours et une enchere (phase 4). Comparer a
        // "tour > tour courant" sautait des membres des que l'ordre bougeait.
        const suivant = await TontineMembre.findOne({
            where: {
                groupeId: groupe.id,
                statut: 'actif',
                aBeneficie: false,
                ordreBeneficiaire: { [Op.ne]: null }
            },
            order: [['ordreBeneficiaire', 'ASC']],
            transaction: t, lock: t.LOCK.UPDATE
        });

        if (!suivant) {
            await groupe.update({ statut: 'termine' }, { transaction: t });
            return { cycleSuivant: null, terminee: true };
        }

        const membres = await TontineMembre.findAll({
            where: { groupeId: groupe.id, statut: 'actif' }, transaction: t
        });

        const debut = new Date();
        const cycleSuivant = await TontineCycle.create({
            groupeId: groupe.id,
            numeroCycle: cycle.numeroCycle + 1,
            beneficiaireId: suivant.clientId,
            montantAttendu: nombre(groupe.montantParPeriode) * (membres.length - 1),
            montantCollecte: 0,
            statut: 'actif',
            dateDebut: debut,
            dateFinPrevue: EcheancierService.finDePeriode(debut, groupe.frequence)
        }, { transaction: t });

        await this.genererCotisations(cycleSuivant, groupe, membres, t);
        await groupe.update({ numeroCycleActuel: cycleSuivant.numeroCycle }, { transaction: t });

        return { cycleSuivant, terminee: false };
    }

    // -----------------------------------------------------------------
    //  Echeances (appele par le cron)
    // -----------------------------------------------------------------
    /**
     * A l'echeance, le cron NE VERSE PAS. Il constate.
     *
     * NjanguiPay completait et payait tout cycle dont la date etait
     * depassee, quel que soit l'etat des cotisations. Dans une vraie
     * tontine, une echeance atteinte avec un pot incomplet ouvre la
     * procedure de discipline (phase 3), elle ne declenche pas un
     * versement silencieux.
     */
    static async traiterEcheances(maintenant = new Date()) {
        const { AmendeService } = require('./amende.service');

        const cycles = await TontineCycle.findAll({
            where: { statut: 'actif', dateFinPrevue: { [Op.lte]: maintenant } }
        });

        const rapport = {
            examines: cycles.length, enDefaut: 0, prets: 0,
            cotisationsEnRetard: 0, amendesLevees: 0
        };

        for (const cycle of cycles) {
            await db.transaction(async (t) => {
                const impayees = await TontineCotisation.findAll({
                    where: { cycleId: cycle.id, statut: { [Op.in]: ['attendue', 'partielle', 'en_retard'] } },
                    transaction: t, lock: t.LOCK.UPDATE
                });

                if (!impayees.length) {
                    rapport.prets++;   // pot complet : le versement reste explicite
                    return;
                }

                for (const c of impayees) {
                    if (c.statut !== 'en_retard') {
                        await c.update({ statut: 'en_retard' }, { transaction: t });
                        rapport.cotisationsEnRetard++;
                    }
                }

                // Caisse 4 : le retard coute une amende, une seule par cycle
                // et par membre. C'est la sanction, pas le versement, qui
                // suit l'echeance.
                const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t });
                rapport.amendesLevees += await AmendeService.leverPourRetard(cycle, groupe, impayees, t);

                await cycle.update({ statut: 'en_defaut' }, { transaction: t });
                rapport.enDefaut++;
            });
        }

        return rapport;
    }
}

module.exports = CycleService;

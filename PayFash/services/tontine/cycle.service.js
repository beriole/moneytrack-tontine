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
    portefeuilleClient, caisseGroupe, ecrireTransaction, transferer, exigerGroupeActif
} = require('./commun');
const { journaliser } = require('../audit.service');
const { exigerActe } = require('./permissions');

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
        return db.transaction(async (t) => this.cotiserDans(clientId, cycleId, montant, t));
    }

    /**
     * Corps de la cotisation, dans une transaction FOURNIE — pour que le
     * mandat de prelevement puisse regler amendes et cotisation d'un seul
     * bloc, et que rien ne soit paye si l'ensemble ne passe pas.
     */
    static async cotiserDans(clientId, cycleId, montant, t) {
        {
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
            await transferer(portefeuille, caisse, aVerser, t, {
                type: 'cotisation', clientId, groupeTontineId: groupe.id, cycleTontineId: cycle.id,
                description: `Cotisation cycle ${cycle.numeroCycle} — ${groupe.nom}`
            });

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

            // Imputation commune avec le recouvrement : statut (une
            // cotisation echue reglee en partie reste echue), incident de
            // defaut, sortie du defaut du cycle quand le pot se complete.
            await require('./defaut.service').imputer(cotisation, cycle, aVerser, 'membre', t,
                { transactionId: transaction.id });

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
        }
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
            // bonus. Si elle echoue, l'argent a quand meme bouge — encore
            // faut-il que l'erreur ne remonte pas jusqu'a l'appelant, qui
            // verrait un 500 sur un versement pourtant reussi.
            try {
                const NotificationService = require('./notification.service');
                const groupe = await TontineGroupe.findByPk(r.groupeId);
                if (groupe) {
                    await NotificationService.potVerse(
                        groupe, r.cycleVerse, r.beneficiaireId, r.net, r.destination);
                    if (r.cycleSuivant) {
                        await NotificationService.cycleDemarre(groupe, r.cycleSuivant, r.cycleSuivant.beneficiaireId);
                    }
                }
            } catch (e) {
                console.log('[tontine] notification de versement non envoyee :', e.message);
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
            exigerGroupeActif(groupe, 'le versement du pot');

            // --- Autorisation -------------------------------------------
            // Le controle etait ecrit ici a la main, avec sa propre liste de
            // roles : il repondait a la meme question que les dix autres
            // services sans passer par le meme endroit. Il la pose desormais
            // au meme endroit qu'eux.
            if (!acteur.systeme) {
                await exigerActe('verserPot', groupe.id, acteur.clientId, t);
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

            // --- Retenue sur le pot ---------------------------------------
            // Si le reglement la prevoit, les cotisations que le beneficiaire
            // doit encore dans CE groupe sont prelevees sur son pot et vont a
            // ceux qu'elles ont leses. Avant l'eligibilite, qui le refuserait
            // sinon pour ces memes dettes ; tout est annule si elle refuse.
            let retenue = { total: 0, lignes: [] };
            if (!force) {
                const caisseAvant = await caisseGroupe(groupe, t, true);
                if (arrondir(caisseAvant.solde) >= arrondir(cycle.montantAttendu)) {
                    retenue = await require('./defaut.service').retenirSurPot(cycle, groupe, caisseAvant, t);
                }
            }

            // --- Eligibilite du beneficiaire ------------------------------
            // Le moment critique : une fois le pot recu, le beneficiaire n'a
            // plus d'interet a cotiser. Tout est revu ICI, dans la transaction
            // du versement, sur des chiffres relus a l'instant et non sur une
            // analyse anterieure : compte, niveau KYC, restrictions, defauts
            // dans ses autres tontines, reglement signe, couverture.
            //
            // Le versement force (maker-checker, deux administrateurs) passe
            // outre : c'est la procedure exceptionnelle, auditee.
            if (!force) {
                const EligibiliteService = require('./eligibilite.service');
                await EligibiliteService.exiger(cycle.beneficiaireId, 'versement', { groupe, cycle, t });
            }

            const caisse = await caisseGroupe(groupe, t, true);
            const attendu = arrondir(cycle.montantAttendu);
            if (arrondir(caisse.solde) + retenue.total < attendu && !force) {
                throw new ErreurTontine(409, `Caisse insuffisante : ${arrondir(caisse.solde)} disponible, ${attendu} requis`);
            }
            if (force && arrondir(caisse.solde) <= 0) {
                throw new ErreurTontine(409, "La caisse est vide : il n'y a rien a verser");
            }

            // Le versement force constate les cotisations absentes comme
            // IMPAYEES — pas comme payees : les passer en "payee" ferait
            // tomber le controle sans que l'argent soit la. Ce constat se fait
            // ICI, dans la transaction du versement, et non chez l'appelant :
            // le maker-checker le faisait avant l'appel, si bien qu'un
            // versement refuse (caisse vide) laissait les cotisations
            // definitivement marquees impayees pour rien.
            if (force) {
                for (const c of impayees) {
                    if (c.statut !== 'impayee') {
                        await c.update({ statut: 'impayee' }, { transaction: t });
                    }
                }
            }

            // En versement force, le beneficiaire recoit ce qui a REELLEMENT
            // ete collecte, pas le pot theorique. Marquer les cotisations
            // manquantes comme payees pour faire tomber le controle serait
            // mentir au grand livre : l'argent n'est pas la. Le manque reste
            // une dette, recouvrable ensuite sur la caution.
            const manque = force ? arrondir(Math.max(0, attendu - arrondir(caisse.solde))) : 0;

            // Le beneficiaire prend TOUT le contenu de la caisse, pas
            // seulement le montant attendu. La caisse ne porte que le cycle
            // en cours (elle revient a zero a chaque versement), donc le
            // surplus ne peut venir que des amendes dirigees vers le pot :
            // c'est exactement l'indemnisation du beneficiaire lese par un
            // retard. Cautions et epargne vivent dans d'autres portefeuilles.
            const pot = arrondir(caisse.solde);
            const bonusAmendes = arrondir(Math.max(0, pot + retenue.total - attendu));

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
                // Seuls ceux qui ont REELLEMENT paye partagent la decote :
                // c'est le rendement de leur patience, pas une distribution a
                // la cantonade. La requete portait sur toutes les lignes du
                // cycle, si bien qu'un membre defaillant — ou toutes les
                // cotisations constatees impayees lors d'un versement force —
                // touchait sa part comme les autres.
                cotisants = await TontineCotisation.findAll({
                    where: { cycleId: cycle.id, statut: 'payee' }, transaction: t
                });
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
            await transferer(caisse, portefeuilleBeneficiaire, net, t, {
                type: 'versement', clientId: cycle.beneficiaireId, groupeTontineId: groupe.id,
                cycleTontineId: cycle.id, description: `Versement du pot — cycle ${cycle.numeroCycle} de ${groupe.nom}`
            });

            for (const c of cotisants) {
                if (partDecote <= 0) break;
                const pf = await portefeuilleClient(c.clientId, t, true);
                await transferer(caisse, pf, partDecote, t, {
                    type: 'decote_enchere', clientId: c.clientId, groupeTontineId: groupe.id,
                    cycleTontineId: cycle.id, description: `Part de decote — cycle ${cycle.numeroCycle}`
                });
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
                await transferer(caisse, portefeuillePlateforme, frais, t, {
                    type: 'frais_plateforme', groupeTontineId: groupe.id, cycleTontineId: cycle.id,
                    description: `Frais de plateforme — cycle ${cycle.numeroCycle} de ${groupe.nom}`
                });
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

            // Le mouvement le plus lourd du module ne laissait aucune trace
            // d'audit : AuditLog n'acceptait qu'un administrateur. L'ecriture
            // se fait DANS la transaction — un pot verse sans trace serait
            // exactement le trou que la piste doit interdire.
            await journaliser({
                acteur: acteur.systeme ? { systeme: true } : { clientId: acteur.clientId },
                action: force ? 'TONTINE_POT_VERSE_FORCE' : 'TONTINE_POT_VERSE',
                cible: `TontineCycle#${cycle.id}`,
                details: {
                    groupeId: groupe.id,
                    beneficiaireId: cycle.beneficiaireId,
                    pot, potAttendu: attendu, net, frais, decote, manque, retenue: retenue.total,
                    cotisationsImpayees: force ? impayees.length : 0,
                    destination: destinationChoisie ? destinationChoisie.id : null
                },
                transaction: t
            });

            const suite = await this.avancerRotation(cycle, groupe, t);

            return {
                versement,
                groupeId: groupe.id,
                cycleVerse: cycle,
                pot,
                potAttendu: attendu,
                force,
                manque,
                cotisationsImpayees: force ? impayees.length : 0,
                bonusAmendes,
                retenue: retenue.total,
                retenues: retenue.lignes,
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
            // Les adhesions restaient 'actif' indefiniment dans un groupe
            // clos : tout comptage de membres actifs s'en trouvait fausse,
            // et rien ne distinguait « va au bout de ses engagements » de
            // « participe encore ».
            await TontineMembre.update({ statut: 'termine' }, {
                where: { groupeId: groupe.id, statut: 'actif' }, transaction: t
            });

            // Plus rien a garantir : chaque garantie encore bloquee revient au
            // disponible de son membre — sauf s'il doit encore une amende, qui
            // n'est pas eteinte par la fin de la rotation.
            const GarantieService = require('./garantie.service');
            const { TontineAmende, TontineGarantie } = require('../../models');
            const concernes = await TontineGarantie.findAll({
                where: { groupeId: groupe.id, statut: { [Op.in]: ['active', 'partiellement_utilisee'] } },
                attributes: ['clientId'], group: ['clientId'], transaction: t
            });
            for (const { clientId } of concernes) {
                const dues = await TontineAmende.count({
                    where: { groupeId: groupe.id, clientId, statut: 'due' }, transaction: t
                });
                if (dues > 0) continue;
                // Une cotisation echue non soldee survit a la rotation : la
                // garantie reste mobilisable pour elle.
                if (await require('./defaut.service').doitEncore(clientId, groupe.id, t)) continue;
                await GarantieService.libererToutesDans({ systeme: true }, clientId, groupe.id,
                    'Fin de la rotation : plus aucune cotisation a garantir', t);
            }
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
    //  Defauts — voir defaut.service.js
    // -----------------------------------------------------------------
    /**
     * Complete une cotisation impayee par les seules garanties de son
     * debiteur. Conservee pour les appels existants ; le moteur de defaut
     * enchaine lui-meme les sources dans l'ordre du reglement.
     */
    static async couvrirParGaranties(cotisationId, acteur = { systeme: true }) {
        const r = await require('./defaut.service').recouvrer(cotisationId, { acteur, sources: ['garanties'] });
        return {
            mobilise: r.mobilise,
            cotisationSoldee: r.cotisationSoldee,
            resteACouvrir: r.resteACouvrir,
            clientId: r.clientId,
            groupe: r.groupe
        };
    }

    /**
     * Echeances, appele par le planificateur : constat, grace, recouvrement
     * selon la politique du groupe, incidents. Le versement reste explicite.
     */
    static async traiterEcheances(maintenant = new Date()) {
        return require('./defaut.service').traiterEcheances(maintenant);
    }
}

module.exports = CycleService;

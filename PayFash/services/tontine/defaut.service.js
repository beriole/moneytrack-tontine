'use strict';

const { Op } = require('sequelize');
const {
    db, TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineIncidentDefaut
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir, portefeuilleClient, caisseGroupe, ecrireTransaction, transferer
} = require('./commun');
const { journaliser } = require('../audit.service');
const { exigerActe } = require('./permissions');
const Politique = require('./politiqueRecouvrement');

// =====================================================================
//  Moteur de defaut.
//
//    echeance
//      -> constat : la cotisation passe en retard, l'amende tombe, le
//         membre est prevenu ;
//      -> delai de grace du reglement, pendant lequel il peut regler
//         lui-meme ;
//      -> recouvrement, source par source dans l'ordre du reglement, en
//         ne prenant que ce qui manque ;
//      -> ce qui reste devient un incident de defaut.
//
//  La couverture, l'exposition et l'eligibilite ne sont pas « recalculees »
//  a part : elles se lisent en direct sur les cotisations et les
//  garanties, donc elles sont a jour des que le recouvrement a commite.
//  Un incident ouvert ferme de lui-meme les portes (versement, enchere,
//  adhesion) par le controle « defauts » du moteur d'eligibilite, et les
//  rouvre des qu'il est regle — sans restriction a lever a la main.
//
//  A qui va l'argent recouvre ? A celui a qui la cotisation manque :
//    - cycle pas encore verse   -> la caisse, le pot se complete ;
//    - cycle deja verse (versement force, exclusion) -> le beneficiaire
//      de ce cycle, qui a recu moins que son du.
//  Jusqu'ici tout allait a la caisse, c'est-a-dire au beneficiaire du
//  cycle EN COURS : il touchait la dette d'un autre cycle, et le vrai lese
//  n'etait jamais rembourse.
// =====================================================================

const ECHUES = ['en_retard', 'impayee'];

class DefautService {

    // -----------------------------------------------------------------
    //  Imputation
    // -----------------------------------------------------------------
    /**
     * Statut d'une cotisation apres un reglement. Un reglement partiel
     * d'une cotisation echue la laisse echue : elle repassait a
     * 'partielle', statut que le controle d'eligibilite ne compte pas
     * comme un defaut — une caution qui couvrait la moitie d'un impaye
     * effacait donc le defaut aux yeux de toutes les portes.
     */
    static statutApres(cotisation, paye) {
        if (paye >= nombre(cotisation.montantDu)) return 'payee';
        if (ECHUES.includes(cotisation.statut)) return cotisation.statut;
        return 'partielle';
    }

    /**
     * Enregistre `montant` sur la cotisation, dans la transaction de
     * l'appelant. `mode` : 'membre' (il paie), 'recouvrement' (caution,
     * garantie), 'retenue_pot'. Tient a jour l'incident et le statut du
     * cycle.
     */
    static async imputer(cotisation, cycle, montant, mode, t, extra = {}) {
        const m = arrondir(montant);
        if (m <= 0) return;
        const paye = arrondir(nombre(cotisation.montantPaye) + m);
        const recouvre = mode === 'membre'
            ? arrondir(cotisation.montantRecouvre)
            : arrondir(nombre(cotisation.montantRecouvre) + m);
        const statut = this.statutApres(cotisation, paye);
        await cotisation.update({
            montantPaye: paye,
            montantRecouvre: recouvre,
            statut,
            datePaiement: statut === 'payee' ? new Date() : cotisation.datePaiement,
            ...extra
        }, { transaction: t });
        await cycle.update({
            montantCollecte: arrondir(nombre(cycle.montantCollecte) + m)
        }, { transaction: t });

        const incident = await TontineIncidentDefaut.findOne({
            where: { cotisationId: cotisation.id, statut: 'ouvert' }, transaction: t, lock: t.LOCK.UPDATE
        });
        if (incident) {
            const reste = arrondir(Math.max(0, nombre(cotisation.montantDu) - paye));
            await incident.update(reste > 0
                ? { resteDu: reste }
                : { resteDu: 0, statut: 'regle', regleLe: new Date(), modeReglement: mode },
            { transaction: t });
            if (reste === 0) {
                await journaliser({
                    acteur: { systeme: true },
                    action: 'TONTINE_INCIDENT_REGLE',
                    cible: `TontineIncidentDefaut#${incident.id}`,
                    details: { groupeId: incident.groupeId, clientVise: incident.clientId, mode },
                    transaction: t
                });
            }
        }

        // Un cycle en defaut dont toutes les cotisations sont soldees ne
        // l'est plus : le pot est complet et le versement peut avoir lieu.
        if (statut === 'payee' && cycle.statut === 'en_defaut') {
            const restantes = await TontineCotisation.count({
                where: { cycleId: cycle.id, statut: { [Op.ne]: 'payee' } }, transaction: t
            });
            if (restantes === 0) await cycle.update({ statut: 'actif' }, { transaction: t });
        }

        if (statut !== 'payee') return;
        if (mode === 'membre') {
            await this.apresReglement(cotisation.clientId, cycle.groupeId,
                `cotisation du cycle ${cycle.numeroCycle} payee`, t);
        } else {
            // Apres un recouvrement, c'est deja sa garantie qui a paye : pas
            // de liberation progressive, seulement celle de fin de dette.
            await this._libererSiPlusRienADevoir(cotisation.clientId, cycle.groupeId, t);
        }
    }

    /**
     * Apres un reglement du membre (cotisation, regularisation, amende) :
     * ce qu'il doit encore a baisse. Rend ses garanties s'il ne doit plus
     * rien et que son adhesion est finie ; sinon, la part qui depasse ce
     * qui doit rester couvert (liberation progressive).
     */
    static async apresReglement(clientId, groupeId, quoi, t) {
        await this._libererSiPlusRienADevoir(clientId, groupeId, t);
        const LiberationService = require('./liberation.service');
        const r = await LiberationService.libererExcedentDans({ systeme: true }, clientId, groupeId,
            `Liberation progressive : ${quoi}`, t);
        if (r.libere > 0 && typeof t.afterCommit === 'function') {
            t.afterCommit(async () => {
                const groupe = await TontineGroupe.findByPk(groupeId);
                await LiberationService._notifier(clientId, groupe, r.libere);
            });
        }
        return r;
    }

    /** Le client doit-il encore une cotisation echue dans ce groupe ? */
    static async doitEncore(clientId, groupeId, t = null) {
        return (await TontineCotisation.count({
            where: { clientId, statut: { [Op.in]: ECHUES } },
            include: [{ model: TontineCycle, as: 'cycle', attributes: [], where: { groupeId } }],
            transaction: t
        })) > 0;
    }

    /**
     * Garanties d'un membre qui n'a plus rien a couvrir dans le groupe :
     * rotation achevee, ou adhesion finie (exclu, sorti). Elles etaient
     * gardees tant qu'une dette restait ; la derniere dette eteinte, elles
     * reviennent a son disponible. Sans cela, celles d'un exclu — qu'il ne
     * peut pas reprendre lui-meme — restaient bloquees pour toujours.
     */
    static async _libererSiPlusRienADevoir(clientId, groupeId, t) {
        const { TontineGarantie, TontineAmende } = require('../../models');
        const actives = await TontineGarantie.count({
            where: { clientId, groupeId, statut: { [Op.in]: ['active', 'partiellement_utilisee'] } }, transaction: t
        });
        if (!actives) return;
        const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
        const membre = await TontineMembre.findOne({ where: { groupeId, clientId }, transaction: t });
        const fini = groupe.statut === 'termine' || (membre && ['exclu', 'sorti', 'termine'].includes(membre.statut));
        if (!fini) return;
        if (await this.doitEncore(clientId, groupeId, t)) return;
        const dues = await TontineAmende.count({ where: { groupeId, clientId, statut: 'due' }, transaction: t });
        if (dues > 0) return;
        await require('./garantie.service').libererToutesDans({ systeme: true }, clientId, groupeId,
            'Plus aucune dette dans ce groupe', t);
    }

    /**
     * Le portefeuille a qui la cotisation manque. Verrouille.
     */
    static async creancier(cycle, groupe, t) {
        if (cycle.statut === 'complete') {
            return {
                portefeuille: await portefeuilleClient(cycle.beneficiaireId, t, true),
                nature: 'beneficiaire', beneficiaireId: cycle.beneficiaireId
            };
        }
        return { portefeuille: await caisseGroupe(groupe, t, true), nature: 'caisse' };
    }

    // -----------------------------------------------------------------
    //  Recouvrement d'une cotisation
    // -----------------------------------------------------------------
    /**
     * Complete une cotisation en allant chercher l'argent source par source
     * — l'ordre du reglement, ou `options.sources` pour un geste manuel —
     * et en ne prenant a chaque source que ce qui manque encore.
     *
     *   options.acteur   { systeme: true } (defaut) ou { clientId }
     *   options.sources  liste imposee ; sinon la politique du groupe
     *   options.acte     acte a exiger de l'acteur (geste manuel)
     *   options.strict   geste manuel : refuser plutot que ne rien prendre
     *
     * Si la cotisation est echue et que les sources s'epuisent avant le
     * solde, un incident de defaut est ouvert (ou mis a jour).
     */
    static async recouvrer(cotisationId, options = {}) {
        const acteur = options.acteur || { systeme: true };
        const CautionService = require('./caution.service');
        const GarantieService = require('./garantie.service');

        return db.transaction(async (t) => {
            const cotisation = await TontineCotisation.findByPk(cotisationId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!cotisation) throw new ErreurTontine(404, 'Cotisation introuvable');
            if (cotisation.statut === 'payee') {
                if (options.strict) throw new ErreurTontine(409, 'Cette cotisation est deja soldee');
                return { cotisation, mobilise: 0, apports: [], cotisationSoldee: true, resteACouvrir: 0 };
            }

            const cycle = await TontineCycle.findByPk(cotisation.cycleId, { transaction: t, lock: t.LOCK.UPDATE });
            const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (groupe.statut === 'suspendu') {
                // Un groupe gele (litige, enquete) ne bouge plus d'argent.
                if (options.strict) throw new ErreurTontine(409, 'Groupe gele : aucun recouvrement possible');
                return { cotisation, mobilise: 0, apports: [], cotisationSoldee: false, gele: true,
                    resteACouvrir: arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye)) };
            }
            if (options.acte && !acteur.systeme) await exigerActe(options.acte, groupe.id, acteur.clientId, t);

            const sources = options.sources || Politique.de(groupe).ordre;
            const destination = await this.creancier(cycle, groupe, t);
            const motif = `cotisation du cycle ${cycle.numeroCycle} impayee`;

            const apports = [];
            let reste = arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye));
            for (const source of sources) {
                if (reste <= 0) break;
                let obtenu = 0;
                if (source === 'caution') {
                    obtenu = await CautionService.preleverDans(acteur, groupe, cotisation, cycle, reste,
                        destination.portefeuille, t, options.strict === true);
                } else if (source === 'garanties') {
                    obtenu = (await GarantieService.mobiliserDans(acteur, cotisation.clientId, groupe, reste,
                        motif, t, destination.portefeuille)).mobilise;
                } else if (source === 'retenue_pot') {
                    // Se prend au versement de son pot (voir retenirSurPot),
                    // pas ici : il n'y a pas encore de pot a retenir.
                    const dejaServi = await this._dejaServi(cotisation.clientId, groupe.id, t);
                    apports.push({ source, montant: 0, note: dejaServi ? 'aucun pot a venir' : 'au versement de son pot' });
                    continue;
                }
                obtenu = arrondir(obtenu);
                apports.push({ source, montant: obtenu });
                if (obtenu > 0) {
                    await this.imputer(cotisation, cycle, obtenu, 'recouvrement', t);
                    reste = arrondir(reste - obtenu);
                }
            }

            const mobilise = arrondir(apports.reduce((s, a) => s + a.montant, 0));
            let incident = null;
            if (reste > 0 && ECHUES.includes(cotisation.statut)) {
                incident = await this._ouvrirIncident(cotisation, cycle, reste, apports, t);
            }

            return {
                cotisation, apports, mobilise, incident,
                cotisationSoldee: reste <= 0,
                resteACouvrir: Math.max(0, reste),
                versBeneficiaire: destination.nature === 'beneficiaire' ? destination.beneficiaireId : null,
                clientId: cotisation.clientId,
                groupe
            };
        }).then(async (r) => {
            try {
                const NotificationService = require('./notification.service');
                for (const a of r.apports || []) {
                    if (!(a.montant > 0)) continue;
                    if (a.source === 'caution') await NotificationService.cautionSaisie(r.clientId, r.groupe, a.montant);
                    if (a.source === 'garanties') await NotificationService.garantieMobilisee(r.clientId, r.groupe, a.montant);
                }
                if (r.incident && r.incident.nouveau) {
                    await NotificationService.incidentOuvert(r.clientId, r.groupe, r.resteACouvrir);
                }
            } catch (e) {
                console.log('[tontine] notification de recouvrement non envoyee :', e.message);
            }
            return r;
        });
    }

    static async _dejaServi(clientId, groupeId, t) {
        const m = await TontineMembre.findOne({ where: { groupeId, clientId }, transaction: t });
        return !!(m && (m.aBeneficie || m.statut !== 'actif'));
    }

    static async _ouvrirIncident(cotisation, cycle, reste, apports, t) {
        const existant = await TontineIncidentDefaut.findOne({
            where: { cotisationId: cotisation.id }, transaction: t, lock: t.LOCK.UPDATE
        });
        if (existant) {
            if (existant.statut === 'ouvert' && arrondir(existant.resteDu) !== reste) {
                await existant.update({ resteDu: reste }, { transaction: t });
            }
            return existant;
        }
        const incident = await TontineIncidentDefaut.create({
            groupeId: cycle.groupeId, cycleId: cycle.id, cotisationId: cotisation.id,
            clientId: cotisation.clientId,
            montantInitial: reste, resteDu: reste, statut: 'ouvert',
            sourcesEssayees: apports, ouvertLe: new Date()
        }, { transaction: t });
        await journaliser({
            acteur: { systeme: true },
            action: 'TONTINE_INCIDENT_OUVERT',
            cible: `TontineIncidentDefaut#${incident.id}`,
            details: { groupeId: cycle.groupeId, cycleId: cycle.id, clientVise: cotisation.clientId, reste, apports },
            transaction: t
        });
        incident.nouveau = true;
        return incident;
    }

    // -----------------------------------------------------------------
    //  Regularisation par le membre
    // -----------------------------------------------------------------
    /**
     * Le membre paie lui-meme une cotisation echue, y compris sur un cycle
     * deja verse — ce que `cotiser` refuse. Sans cette voie, une dette
     * constatee lors d'un versement force ou d'une exclusion ne pouvait
     * plus etre eteinte par personne, et fermait pour toujours au membre
     * toutes les portes de toutes ses tontines.
     *
     * Ouvert aussi a un membre exclu ou sorti : il doit pouvoir solder ce
     * qu'il doit.
     */
    static async regulariser(clientId, cotisationId, montant) {
        return db.transaction(async (t) => {
            const cotisation = await TontineCotisation.findByPk(cotisationId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!cotisation || cotisation.clientId !== Number(clientId)) {
                throw new ErreurTontine(404, 'Cotisation introuvable');
            }
            if (cotisation.statut === 'payee') throw new ErreurTontine(409, 'Cette cotisation est deja soldee');
            if (!ECHUES.includes(cotisation.statut)) {
                throw new ErreurTontine(409, "Cette cotisation n'est pas echue : reglez-la par une cotisation ordinaire");
            }
            const cycle = await TontineCycle.findByPk(cotisation.cycleId, { transaction: t, lock: t.LOCK.UPDATE });
            const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (groupe.statut === 'suspendu') throw new ErreurTontine(409, 'Groupe gele : reglement suspendu');

            const reste = arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye));
            const aVerser = montant !== undefined && montant !== null ? Math.min(arrondir(montant), reste) : reste;
            if (!(aVerser > 0)) throw new ErreurTontine(400, 'Le montant doit etre strictement positif');

            const destination = await this.creancier(cycle, groupe, t);
            const portefeuille = await portefeuilleClient(clientId, t, true);
            await transferer(portefeuille, destination.portefeuille, aVerser, t);

            const ecriture = await ecrireTransaction({
                montant: aVerser,
                type: 'regularisation',
                description: `Regularisation — cotisation du cycle ${cycle.numeroCycle} de ${groupe.nom}`,
                clientId, groupeId: groupe.id, cycleId: cycle.id,
                reference: `TNT-REG-${cotisation.id}-${nombre(cotisation.montantPaye)}`
            }, t);
            await this.imputer(cotisation, cycle, aVerser, 'membre', t, { transactionId: ecriture.id });

            await journaliser({
                acteur: { clientId },
                action: 'TONTINE_COTISATION_REGULARISEE',
                cible: `TontineCotisation#${cotisation.id}`,
                details: {
                    groupeId: groupe.id, cycleId: cycle.id, montant: aVerser,
                    vers: destination.nature, beneficiaireId: destination.beneficiaireId || null
                },
                transaction: t
            });

            return {
                cotisation, montant: aVerser, soldee: cotisation.statut === 'payee',
                resteDu: arrondir(nombre(cotisation.montantDu) - nombre(cotisation.montantPaye)),
                vers: destination.nature
            };
        });
    }

    // -----------------------------------------------------------------
    //  Retenue sur le pot
    // -----------------------------------------------------------------
    /**
     * Au versement de son pot, eteint les cotisations echues du
     * beneficiaire dans CE groupe, en les prelevant sur la caisse avant
     * qu'elle lui soit versee. Tourne dans la transaction du versement,
     * avant le controle d'eligibilite — qui le refuserait sinon pour ces
     * memes dettes. Les dettes dans d'autres tontines ne se retiennent
     * pas ici : chaque groupe a sa caisse.
     *
     * L'argent va au beneficiaire du cycle ou la cotisation manque.
     */
    static async retenirSurPot(cycle, groupe, caisse, t) {
        if (!Politique.prevoit(groupe, 'retenue_pot')) return { total: 0, lignes: [] };

        const autres = await TontineCycle.findAll({
            where: { groupeId: groupe.id, id: { [Op.ne]: cycle.id }, statut: 'complete' },
            attributes: ['id'], transaction: t
        });
        if (!autres.length) return { total: 0, lignes: [] };

        const dettes = await TontineCotisation.findAll({
            where: {
                clientId: cycle.beneficiaireId,
                cycleId: { [Op.in]: autres.map(c => c.id) },
                statut: { [Op.in]: ECHUES }
            },
            order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE
        });

        const lignes = [];
        let total = 0;
        for (const c of dettes) {
            const dispo = arrondir(caisse.solde);
            if (dispo <= 0) break;
            const cycleDette = await TontineCycle.findByPk(c.cycleId, { transaction: t, lock: t.LOCK.UPDATE });
            const destination = await this.creancier(cycleDette, groupe, t);
            if (destination.portefeuille.id === caisse.id) continue;
            const m = Math.min(dispo, arrondir(nombre(c.montantDu) - nombre(c.montantPaye)));
            if (m <= 0) continue;

            await transferer(caisse, destination.portefeuille, m, t);
            await ecrireTransaction({
                montant: m,
                type: 'retenue_pot',
                description: `Retenue sur le pot du cycle ${cycle.numeroCycle} pour la cotisation du cycle ${cycleDette.numeroCycle} — ${groupe.nom}`,
                clientId: c.clientId, groupeId: groupe.id, cycleId: cycleDette.id,
                reference: `TNT-RET-${c.id}-${nombre(c.montantPaye)}`
            }, t);
            await this.imputer(c, cycleDette, m, 'retenue_pot', t);
            lignes.push({ cotisationId: c.id, cycle: cycleDette.numeroCycle, montant: m, versClientId: destination.beneficiaireId });
            total = arrondir(total + m);
        }

        if (total > 0) {
            await journaliser({
                acteur: { systeme: true },
                action: 'TONTINE_RETENUE_SUR_POT',
                cible: `TontineCycle#${cycle.id}`,
                details: { groupeId: groupe.id, beneficiaireId: cycle.beneficiaireId, total, lignes },
                transaction: t
            });
        }
        return { total, lignes };
    }

    // -----------------------------------------------------------------
    //  Echeances (planificateur)
    // -----------------------------------------------------------------
    /**
     * 1. Constat : chaque cycle actif echu dont le pot est incomplet passe
     *    en defaut ; ses cotisations ouvertes passent en retard, l'amende
     *    de retard tombe, le membre est prevenu.
     * 2. Recouvrement : chaque cotisation echue dont le delai de grace est
     *    ecoule est completee selon la politique du groupe. Toutes, pas
     *    seulement celles constatees a ce passage : un membre qui affecte
     *    une nouvelle garantie voit sa dette couverte au passage suivant.
     *
     * Le moteur ne verse jamais le pot : le versement reste explicite.
     */
    static async traiterEcheances(maintenant = new Date()) {
        const { AmendeService } = require('./amende.service');

        const rapport = {
            examines: 0, enDefaut: 0, prets: 0,
            cotisationsEnRetard: 0, amendesLevees: 0, enGrace: 0,
            cautionsSaisies: 0, montantRecouvre: 0, cotisationsSoldeesParCaution: 0,
            garantiesMobilisees: 0, montantGaranties: 0, cotisationsSoldeesParGarantie: 0,
            incidentsOuverts: 0
        };

        // --- 1. Constat -------------------------------------------------
        const cycles = await TontineCycle.findAll({
            where: { statut: 'actif', dateFinPrevue: { [Op.lte]: maintenant } }
        });
        rapport.examines = cycles.length;
        const constates = [];

        for (const cycle of cycles) {
            const r = await db.transaction(async (t) => {
                const ouvertes = await TontineCotisation.findAll({
                    where: { cycleId: cycle.id, statut: { [Op.in]: ['attendue', 'partielle', 'en_retard'] } },
                    transaction: t, lock: t.LOCK.UPDATE
                });
                if (!ouvertes.length) return null;   // pot complet : le versement reste explicite

                const nouveaux = [];
                for (const c of ouvertes) {
                    if (c.statut !== 'en_retard') {
                        await c.update({ statut: 'en_retard' }, { transaction: t });
                        rapport.cotisationsEnRetard++;
                        nouveaux.push(c.clientId);
                    }
                }
                // Le retard coute une amende, une seule par cycle et par
                // membre. C'est la sanction, pas le versement, qui suit
                // l'echeance.
                const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t });
                rapport.amendesLevees += await AmendeService.leverPourRetard(cycle, groupe, ouvertes, t);
                await cycle.update({ statut: 'en_defaut' }, { transaction: t });
                return { groupe, nouveaux };
            });
            if (!r) { rapport.prets++; continue; }
            constates.push(cycle.id);
            for (const clientId of r.nouveaux) {
                try {
                    const NotificationService = require('./notification.service');
                    await NotificationService.retardConstate(clientId, r.groupe, cycle,
                        Politique.recouvrableA(r.groupe, cycle.dateFinPrevue));
                } catch (e) {
                    console.log('[tontine] notification de retard non envoyee :', e.message);
                }
            }
        }

        // --- 2. Recouvrement --------------------------------------------
        // L'echeance qui fait foi est celle du cycle : la date recopiee sur
        // la cotisation a sa creation ne suit pas un report d'echeance.
        const echues = await TontineCotisation.findAll({
            where: { statut: { [Op.in]: ECHUES } },
            include: [{
                model: TontineCycle, as: 'cycle', attributes: ['id', 'groupeId', 'dateFinPrevue'],
                where: { dateFinPrevue: { [Op.lte]: maintenant } }
            }],
            order: [['id', 'ASC']]
        });
        const groupes = new Map();
        for (const c of echues) {
            const gid = c.cycle.groupeId;
            if (!groupes.has(gid)) groupes.set(gid, await TontineGroupe.findByPk(gid));
            const groupe = groupes.get(gid);
            if (!groupe || groupe.statut === 'suspendu') continue;
            if (Politique.recouvrableA(groupe, c.cycle.dateFinPrevue) > maintenant) { rapport.enGrace++; continue; }

            try {
                const r = await this.recouvrer(c.id);
                for (const a of r.apports) {
                    if (!(a.montant > 0)) continue;
                    rapport.montantRecouvre = arrondir(rapport.montantRecouvre + a.montant);
                    if (a.source === 'caution') rapport.cautionsSaisies++;
                    if (a.source === 'garanties') {
                        rapport.garantiesMobilisees++;
                        rapport.montantGaranties = arrondir(rapport.montantGaranties + a.montant);
                    }
                }
                if (r.cotisationSoldee && r.mobilise > 0) {
                    const derniere = [...r.apports].reverse().find(a => a.montant > 0);
                    if (derniere.source === 'caution') rapport.cotisationsSoldeesParCaution++;
                    if (derniere.source === 'garanties') rapport.cotisationsSoldeesParGarantie++;
                }
                if (r.incident && r.incident.nouveau) rapport.incidentsOuverts++;
            } catch (e) {
                // L'echec d'une cotisation ne doit pas empecher les autres.
                console.log('[tontine] recouvrement en echec (cotisation ' + c.id + ') :', e.message);
            }
        }

        // Compte par cycle, apres recouvrement : un cycle constate ce
        // passage-ci et integralement couvert n'est plus en defaut.
        for (const id of constates) {
            const cycle = await TontineCycle.findByPk(id);
            if (cycle.statut === 'en_defaut') rapport.enDefaut++;
            else rapport.prets++;
        }
        return rapport;
    }

    // -----------------------------------------------------------------
    //  Lecture
    // -----------------------------------------------------------------
    static vue(incident, nomGroupe) {
        return {
            id: incident.id,
            groupeId: incident.groupeId,
            groupe: nomGroupe || undefined,
            cycleId: incident.cycleId,
            cotisationId: incident.cotisationId,
            clientId: incident.clientId,
            montantInitial: arrondir(incident.montantInitial),
            resteDu: arrondir(incident.resteDu),
            statut: incident.statut,
            modeReglement: incident.modeReglement,
            sourcesEssayees: incident.sourcesEssayees || [],
            ouvertLe: incident.ouvertLe,
            regleLe: incident.regleLe
        };
    }

    /** Les incidents d'un client, toutes tontines confondues. */
    static async mesIncidents(clientId) {
        const incidents = await TontineIncidentDefaut.findAll({
            where: { clientId }, order: [['statut', 'ASC'], ['ouvertLe', 'DESC']]
        });
        const noms = new Map();
        for (const i of incidents) {
            if (!noms.has(i.groupeId)) {
                const g = await TontineGroupe.findByPk(i.groupeId, { attributes: ['nom'] });
                noms.set(i.groupeId, g ? g.nom : null);
            }
        }
        const vues = incidents.map(i => this.vue(i, noms.get(i.groupeId)));
        return {
            ouverts: vues.filter(v => v.statut === 'ouvert'),
            regles: vues.filter(v => v.statut === 'regle'),
            totalDu: arrondir(vues.filter(v => v.statut === 'ouvert').reduce((s, v) => s + v.resteDu, 0))
        };
    }

    /**
     * Les incidents d'un groupe — pour le bureau, qui doit savoir qui doit
     * quoi au groupe. Rien de ce qui vit hors du groupe : ni les sources
     * des garanties, ni les incidents du membre dans ses autres tontines.
     */
    static async incidentsGroupe(clientId, groupeId) {
        await exigerActe('consulterIncidents', groupeId, clientId, null);
        const { Client } = require('../../models');
        const incidents = await TontineIncidentDefaut.findAll({
            where: { groupeId }, order: [['statut', 'ASC'], ['ouvertLe', 'DESC']]
        });
        const clients = await Client.findAll({
            where: { id: [...new Set(incidents.map(i => i.clientId))] }, attributes: ['id', 'nom']
        });
        const nom = new Map(clients.map(c => [c.id, c.nom]));
        const groupe = await TontineGroupe.findByPk(groupeId);
        return {
            politique: { ...Politique.de(groupe), description: Politique.decrire(groupe) },
            incidents: incidents.map(i => ({ ...this.vue(i), membre: nom.get(i.clientId) || null }))
        };
    }
}

module.exports = DefautService;

'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const {
    db, Client, Portefeuille,
    TontineGroupe, TontineMembre, TontineContrat,
    TontineGarantie, TontineGarantieMouvement, TontineConsentementGarantie,
    TontineCaution
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    caisseGroupe, exigerGroupeNonGele, ecrireTransaction
} = require('./commun');
const { exigerActe } = require('./permissions');
const Fonds = require('../fonds.service');
const ExpositionService = require('./exposition.service');
const { journaliser } = require('../audit.service');

// =====================================================================
//  Garanties — l'argent du membre qui repond de ses cotisations futures.
//
//  Le principe : plus un membre recoit le pot tot, plus il lui reste a
//  payer, et plus le groupe doit exiger de lui. Sa caution — un
//  pourcentage d'UNE cotisation — ne couvre pas cet engagement. Il peut
//  y ajouter une part de son epargne, de l'argent d'un projet, ou une
//  reserve sur son portefeuille courant.
//
//  Trois regles, qui ne se negocient pas :
//
//    1. L'argent ne bouge pas. Il reste sur le portefeuille du membre —
//       il le voit, il lui appartient — mais sa part disponible baisse
//       d'autant (Fonds.reserver). Il n'est deplace vers la caisse du
//       groupe que si une cotisation reste impayee, et pour le seul
//       montant manquant (mobiliser).
//
//    2. Rien sans consentement. Le membre lit un texte qui dit combien,
//       d'ou, pour quelle tontine, et a quelles conditions. Il renvoie
//       l'empreinte de ce qu'il a lu ; le serveur regenere le texte et
//       compare. Le texte accepte est conserve tel quel.
//
//    3. Le blocage et sa trace sont atomiques. Reserve sur le
//       portefeuille, consentement, garantie, mouvement et audit sont
//       commits ensemble, ou pas du tout.
// =====================================================================

const TYPE_PAR_PORTEFEUILLE = {
    epargne: 'EPARGNE',
    projet: 'PROJET',
    courant: 'PORTEFEUILLE',
    personnel: 'PORTEFEUILLE',
    affaires: 'PORTEFEUILLE',
    autre: 'PORTEFEUILLE'
};

const LIBELLE_TYPE = { EPARGNE: 'epargne', PROJET: 'projet', PORTEFEUILLE: 'portefeuille' };

class GarantieService {

    /** Ce qui reste bloque sur une garantie. */
    static restant(g) {
        return arrondir(nombre(g.montantInitial) - nombre(g.montantUtilise) - nombre(g.montantLibere));
    }

    static _statut(g) {
        const restant = this.restant(g);
        // Close : 'utilisee' si tout a servi a couvrir des impayes,
        // 'liberee' des qu'une part a ete rendue au membre.
        if (restant <= 0) return nombre(g.montantLibere) > 0 ? 'liberee' : 'utilisee';
        if (nombre(g.montantUtilise) > 0) return 'partiellement_utilisee';
        return 'active';
    }

    // -----------------------------------------------------------------
    //  Ce qu'on peut affecter
    // -----------------------------------------------------------------
    /**
     * Les portefeuilles du client qui peuvent porter une garantie, avec
     * leur disponible. Les caisses de tontine en sont exclues : ce n'est
     * pas son argent.
     */
    static async sourcesPossibles(clientId, groupeId) {
        await exigerActe('consulter', groupeId, clientId);
        const portefeuilles = await Portefeuille.findAll({
            where: {
                ClientPortefeuilleId: clientId, estActif: true,
                typePortefeuille: { [Op.ne]: 'tontine' }
            },
            order: [['typePortefeuille', 'ASC'], ['id', 'ASC']]
        });
        return portefeuilles.map(p => ({
            portefeuilleId: p.id,
            nom: p.nom || p.typePortefeuille,
            type: TYPE_PAR_PORTEFEUILLE[p.typePortefeuille] || 'PORTEFEUILLE',
            ...Fonds.etat(p),
            affectable: Fonds.disponible(p) > 0
        }));
    }

    // -----------------------------------------------------------------
    //  Le consentement
    // -----------------------------------------------------------------
    static hacher(texte) {
        return crypto.createHash('sha256').update(String(texte), 'utf8').digest('hex');
    }

    /**
     * Le texte exact que le membre accepte. Deterministe pour des
     * parametres donnes : c'est ce qui permet de verifier l'empreinte.
     */
    static texteConsentement({ groupe, portefeuille, montant, versionReglement }) {
        const m = arrondir(montant);
        const type = TYPE_PAR_PORTEFEUILLE[portefeuille.typePortefeuille] || 'PORTEFEUILLE';
        const source = `${LIBELLE_TYPE[type]} « ${portefeuille.nom || portefeuille.typePortefeuille} »`;
        return [
            `AFFECTATION D'UNE GARANTIE — ${groupe.nom}`,
            '',
            `Je bloque ${m} FCFA de mon ${source} en garantie de mes cotisations dans la tontine « ${groupe.nom} ».`,
            '',
            `1. Cette somme reste sur mon portefeuille et m'appartient. Je ne pourrai ni la retirer, ni la transferer, `
            + `ni la depenser tant qu'elle garantit mes engagements dans cette tontine.`,
            `2. Si une de mes cotisations reste impayee a l'echeance, MoneyTrack pourra prelever sur cette somme `
            + `le montant manquant — et seulement lui — pour completer le pot, conformement au reglement de la tontine.`,
            `3. Ce qui n'aura pas servi me sera rendu a la fin de la rotation, ou plus tot si le reglement le prevoit, `
            + `une fois mes cotisations et amendes soldees.`,
            `4. Chaque mouvement sur cette garantie est enregistre et consultable, et peut faire l'objet d'un litige.`,
            '',
            `Reglement interieur en vigueur : ${versionReglement ? `version ${versionReglement}` : 'aucun texte signe a ce jour'}.`,
            `Cotisation de la tontine : ${arrondir(groupe.montantParPeriode)} FCFA par periode (${groupe.frequence}).`
        ].join('\n');
    }

    static async _versionReglement(groupeId, t) {
        const contrat = await TontineContrat.findOne({
            where: { groupeId, statut: { [Op.in]: ['signe', 'en_attente_signatures'] } },
            order: [['version', 'DESC']], transaction: t
        });
        return contrat ? contrat.version : null;
    }

    /**
     * Ce que verra le membre avant d'accepter : le texte, son empreinte, et
     * l'effet de l'affectation sur son exposition. Rien n'est ecrit.
     */
    static async simuler(clientId, groupeId, portefeuilleId, montant) {
        await exigerActe('affecterGarantie', groupeId, clientId);
        const groupe = await TontineGroupe.findByPk(groupeId);
        if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

        const portefeuille = await this._portefeuilleDuClient(clientId, portefeuilleId);
        const m = this._montantValide(montant);
        const disponible = Fonds.disponible(portefeuille);

        const versionReglement = await this._versionReglement(groupeId);
        const texte = this.texteConsentement({ groupe, portefeuille, montant: m, versionReglement });

        const exposition = await ExpositionService.pourMembre(clientId, groupeId, { groupe });
        const dejaBloque = await this.totalBloque(clientId, groupeId);
        const caution = await this._cautionDisponible(clientId, groupeId);
        const couverture = await require('./couverture.service').pourMembre(clientId, groupeId, { groupe });

        return {
            tauxExige: couverture.tauxExige,
            montantExige: couverture.montantExige,
            manqueAvant: couverture.manque,
            manqueApres: arrondir(Math.max(0, couverture.montantExige - (dejaBloque + caution + m))),
            texte,
            hashTexte: this.hacher(texte),
            versionReglement,
            portefeuille: { id: portefeuille.id, nom: portefeuille.nom || portefeuille.typePortefeuille, ...Fonds.etat(portefeuille) },
            montant: m,
            possible: disponible >= m,
            raison: disponible >= m ? null
                : `Ce portefeuille n'a que ${disponible} FCFA disponibles${Fonds.reserve(portefeuille) > 0
                    ? ` (${Fonds.reserve(portefeuille)} FCFA deja bloques)` : ''}`,
            exposition: exposition.exposition,
            garantiesAvant: arrondir(dejaBloque + caution),
            garantiesApres: arrondir(dejaBloque + caution + m),
            couvertureAvant: this._ratio(dejaBloque + caution, exposition.exposition),
            couvertureApres: this._ratio(dejaBloque + caution + m, exposition.exposition)
        };
    }

    static _ratio(garanties, exposition) {
        // Sans engagement, la couverture est entiere : rien a couvrir.
        if (!(exposition > 0)) return 100;
        return Math.round((garanties / exposition) * 10000) / 100;
    }

    static _montantValide(montant) {
        const m = arrondir(montant);
        if (!(m > 0)) throw new ErreurTontine(400, 'Le montant de la garantie doit etre strictement positif');
        return m;
    }

    static async _portefeuilleDuClient(clientId, portefeuilleId, t = null, verrouiller = false) {
        const options = { transaction: t };
        if (verrouiller && t) options.lock = t.LOCK.UPDATE;
        const pf = await Portefeuille.findOne({
            where: { id: parseInt(portefeuilleId, 10), ClientPortefeuilleId: clientId, estActif: true }, ...options
        });
        if (!pf) throw new ErreurTontine(404, 'Portefeuille introuvable');
        if (pf.typePortefeuille === 'tontine') {
            throw new ErreurTontine(409, "Une caisse de tontine ne peut pas servir de garantie : ce n'est pas votre argent");
        }
        return pf;
    }

    static async _cautionDisponible(clientId, groupeId, t = null) {
        const caution = await TontineCaution.findOne({
            where: { clientId, groupeId, statut: { [Op.ne]: 'liberee' } }, transaction: t
        });
        return caution ? arrondir(nombre(caution.montantBloque) - nombre(caution.montantUtilise)) : 0;
    }

    /** Somme encore bloquee des garanties d'un membre dans un groupe. */
    static async totalBloque(clientId, groupeId, t = null) {
        const garanties = await TontineGarantie.findAll({
            where: { clientId, groupeId, statut: { [Op.in]: ['active', 'partiellement_utilisee'] } },
            transaction: t
        });
        return arrondir(garanties.reduce((s, g) => s + this.restant(g), 0));
    }

    // -----------------------------------------------------------------
    //  Affectation
    // -----------------------------------------------------------------
    /**
     * Bloque une garantie, sur consentement.
     *
     * `hashTexte` est l'empreinte du texte que le client a lu. Si elle ne
     * correspond pas au texte regenere pour les memes parametres, rien n'est
     * bloque : le client n'a pas accepte ce qui serait applique.
     */
    static async affecter(clientId, groupeId, { portefeuilleId, montant, hashTexte }, contexte = {}) {
        const m = this._montantValide(montant);
        if (!hashTexte) throw new ErreurTontine(400, "Le consentement est obligatoire : renvoyez l'empreinte du texte accepte");

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
            exigerGroupeNonGele(groupe, "l'affectation d'une garantie");
            if (groupe.statut === 'termine') {
                throw new ErreurTontine(409, 'Cette tontine est achevee : il n y a plus rien a garantir');
            }

            const membre = await exigerActe('affecterGarantie', groupeId, clientId, t);

            const portefeuille = await this._portefeuilleDuClient(clientId, portefeuilleId, t, true);
            const versionReglement = await this._versionReglement(groupeId, t);
            const texte = this.texteConsentement({ groupe, portefeuille, montant: m, versionReglement });
            if (this.hacher(texte) !== String(hashTexte).toLowerCase()) {
                throw new ErreurTontine(409,
                    "Le texte accepte ne correspond pas a l'affectation demandee : relisez et acceptez a nouveau");
            }

            // Une garantie qui depasserait l'engagement ne protege rien de
            // plus et prive le membre de son argent pour rien.
            const exposition = await ExpositionService.pourMembre(clientId, groupeId, { t, groupe, membre });
            const dejaCouvert = arrondir(await this.totalBloque(clientId, groupeId, t)
                + await this._cautionDisponible(clientId, groupeId, t));
            const manque = arrondir(Math.max(0, exposition.exposition - dejaCouvert));
            if (manque <= 0) {
                throw new ErreurTontine(409,
                    `Votre engagement de ${exposition.exposition} FCFA est deja entierement couvert : aucune garantie supplementaire n'est necessaire`);
            }
            if (m > manque) {
                throw new ErreurTontine(409,
                    `Il ne manque que ${manque} FCFA de garantie pour couvrir votre engagement de ${exposition.exposition} FCFA : `
                    + `bloquer ${m} FCFA immobiliserait ${arrondir(m - manque)} FCFA pour rien`);
            }

            // L'argent ne bouge pas : seule la part disponible baisse.
            try {
                await Fonds.reserver(portefeuille, m, t);
            } catch (e) {
                if (e instanceof Fonds.ErreurFonds) throw new ErreurTontine(e.code, e.message);
                throw e;
            }

            const consentement = await TontineConsentementGarantie.create({
                clientId, groupeId, portefeuilleId: portefeuille.id, montant: m,
                texte, hashTexte: this.hacher(texte), versionReglement,
                accepteLe: new Date(), adresseIp: contexte.ip || null
            }, { transaction: t });

            const garantie = await TontineGarantie.create({
                groupeId, membreId: membre.id, clientId,
                portefeuilleId: portefeuille.id,
                type: TYPE_PAR_PORTEFEUILLE[portefeuille.typePortefeuille] || 'PORTEFEUILLE',
                montantInitial: m, montantUtilise: 0, montantLibere: 0,
                statut: 'active', consentementId: consentement.id
            }, { transaction: t });

            await TontineGarantieMouvement.create({
                garantieId: garantie.id, sens: 'blocage', montant: m,
                motif: `Affectation consentie — ${groupe.nom}`,
                acteurType: 'CLIENT', acteurId: clientId
            }, { transaction: t });

            await journaliser({
                acteur: { clientId },
                action: 'TONTINE_GARANTIE_AFFECTEE',
                cible: `TontineGarantie#${garantie.id}`,
                details: {
                    groupeId, portefeuilleId: portefeuille.id, type: garantie.type, montant: m,
                    consentementId: consentement.id, hashTexte: consentement.hashTexte,
                    exposition: exposition.exposition, couvertApres: arrondir(dejaCouvert + m)
                },
                req: contexte.req, transaction: t
            });

            return {
                garantie, consentement,
                portefeuille: Fonds.etat(portefeuille),
                exposition: exposition.exposition,
                couverture: this._ratio(dejaCouvert + m, exposition.exposition)
            };
        });
    }

    // -----------------------------------------------------------------
    //  Mobilisation — l'argent bouge, enfin
    // -----------------------------------------------------------------
    /**
     * Preleve `montant` sur les garanties actives d'un membre pour
     * completer la caisse du groupe — ou `destination`, le portefeuille du
     * beneficiaire lese quand le cycle est deja verse. Ne prend que le necessaire, garantie
     * par garantie, dans l'ordre d'affectation. Appele par le recouvrement
     * ({ systeme: true }) ; tourne dans la transaction de l'appelant.
     *
     * Renvoie le montant reellement mobilise, qui peut etre inferieur au
     * besoin si les garanties ne suffisent pas.
     */
    static async mobiliserDans(acteur, clientId, groupe, besoin, motif, t, destination = null) {
        let reste = arrondir(besoin);
        if (reste <= 0) return { mobilise: 0, mouvements: [] };
        exigerGroupeNonGele(groupe, "la mobilisation d'une garantie");

        const garanties = await TontineGarantie.findAll({
            where: { clientId, groupeId: groupe.id, statut: { [Op.in]: ['active', 'partiellement_utilisee'] } },
            order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE
        });
        if (!garanties.length) return { mobilise: 0, mouvements: [] };

        const caisse = destination || await caisseGroupe(groupe, t, true);
        const mouvements = [];
        let mobilise = 0;

        for (const g of garanties) {
            if (reste <= 0) break;
            const dispo = this.restant(g);
            if (dispo <= 0) continue;
            const part = Math.min(dispo, reste);

            const pf = await Portefeuille.findByPk(g.portefeuilleId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!pf) continue;
            // Le portefeuille peut avoir ete vide par un autre chemin (un
            // ajustement admin, une incoherence) : on ne prend que ce qui est
            // reellement la.
            const prenable = Math.min(part, Fonds.reserve(pf), arrondir(pf.solde));
            if (prenable <= 0) continue;

            await Fonds.debiterReserve(pf, prenable, t);
            await Fonds.crediter(caisse, prenable, t);

            const transaction = await ecrireTransaction({
                montant: prenable,
                type: 'garantie_mobilisation',
                description: `Garantie mobilisee — ${motif} — ${groupe.nom}`,
                clientId, groupeId: groupe.id,
                reference: `TNT-GAR-M-${g.id}-${arrondir(nombre(g.montantUtilise))}`
            }, t);

            const utilise = arrondir(nombre(g.montantUtilise) + prenable);
            await g.update({ montantUtilise: utilise, statut: this._statut({ ...g.toJSON(), montantUtilise: utilise }) }, { transaction: t });

            mouvements.push(await TontineGarantieMouvement.create({
                garantieId: g.id, sens: 'mobilisation', montant: prenable, motif,
                acteurType: acteur.systeme ? 'SYSTEME' : 'CLIENT',
                acteurId: acteur.systeme ? null : acteur.clientId,
                transactionId: transaction.id
            }, { transaction: t }));

            await journaliser({
                acteur: acteur.systeme ? { systeme: true } : { clientId: acteur.clientId },
                action: 'TONTINE_GARANTIE_MOBILISEE',
                cible: `TontineGarantie#${g.id}`,
                details: { groupeId: groupe.id, clientVise: clientId, montant: prenable, motif, restant: this.restant(g) - prenable },
                transaction: t
            });

            mobilise = arrondir(mobilise + prenable);
            reste = arrondir(reste - prenable);
        }

        return { mobilise, reste, mouvements };
    }

    // -----------------------------------------------------------------
    //  Liberation
    // -----------------------------------------------------------------
    /**
     * Rend au membre ce qui reste d'une garantie.
     *
     * Une garantie ne se libere pas au-dessus d'un engagement en cours : il
     * faut que la tontine soit achevee, ou que l'adhesion soit finie sans
     * dette. La liberation de l'excedent en cours de route — quand
     * l'exposition a baisse — viendra avec les regles de couverture du
     * reglement.
     */
    static async liberer(acteur, garantieId, motif = null) {
        return db.transaction(async (t) => {
            const g = await TontineGarantie.findByPk(garantieId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!g) throw new ErreurTontine(404, 'Garantie introuvable');
            if (!acteur.systeme && g.clientId !== acteur.clientId) {
                throw new ErreurTontine(403, "Cette garantie n'est pas la votre");
            }
            const restant = this.restant(g);
            if (restant <= 0) throw new ErreurTontine(409, 'Cette garantie ne porte plus rien a liberer');

            const groupe = await TontineGroupe.findByPk(g.groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            exigerGroupeNonGele(groupe, "la liberation d'une garantie");

            if (!acteur.systeme) {
                const { RestrictionService } = require('../restriction.service');
                const r = await RestrictionService.active(g.clientId, 'WITHDRAW_GUARANTEE_DISABLED', t);
                if (r) throw new ErreurTontine(403, `Reprise de garantie suspendue : ${r.motif}`);
                const membre = await TontineMembre.findByPk(g.membreId, { transaction: t });
                // L'exclusion n'en fait PAS partie. Un membre exclu sort de la
                // rotation : son exposition calculee tombe a zero. S'il avait
                // deja mange le pot, il pourrait alors reprendre sa garantie et
                // partir — exactement le scenario que les garanties existent
                // pour empecher. Sa garantie ne se libere que par une decision
                // du systeme, apres recouvrement.
                const adhesionFinie = membre && ['sorti', 'termine'].includes(membre.statut);
                if (groupe.statut !== 'termine' && !adhesionFinie) {
                    throw new ErreurTontine(409,
                        'Cette garantie couvre encore vos cotisations a venir : elle sera liberee a la fin de la rotation');
                }
                const exposition = await ExpositionService.pourMembre(g.clientId, g.groupeId, { t, groupe, membre });
                if (exposition.exposition > 0) {
                    throw new ErreurTontine(409,
                        `Il vous reste ${exposition.exposition} FCFA a regler dans ce groupe : la garantie ne se libere pas avant`);
                }
            }

            return this._libererDans(acteur, g, restant, motif || 'Liberation', t);
        });
    }

    /** Corps de la liberation, dans une transaction fournie. */
    static async _libererDans(acteur, g, montant, motif, t) {
        const m = Math.min(arrondir(montant), this.restant(g));
        if (m <= 0) return { garantie: g, libere: 0 };

        const pf = await Portefeuille.findByPk(g.portefeuilleId, { transaction: t, lock: t.LOCK.UPDATE });
        // Ne jamais liberer plus que la reserve reelle du portefeuille : les
        // deux doivent rester d'accord.
        const rendable = pf ? Math.min(m, Fonds.reserve(pf)) : 0;
        if (pf && rendable > 0) await Fonds.liberer(pf, rendable, t);

        const libere = arrondir(nombre(g.montantLibere) + m);
        await g.update({ montantLibere: libere, statut: this._statut({ ...g.toJSON(), montantLibere: libere }) }, { transaction: t });

        await TontineGarantieMouvement.create({
            garantieId: g.id, sens: 'liberation', montant: m, motif,
            acteurType: acteur.systeme ? 'SYSTEME' : 'CLIENT',
            acteurId: acteur.systeme ? null : acteur.clientId
        }, { transaction: t });

        await journaliser({
            acteur: acteur.systeme ? { systeme: true } : { clientId: acteur.clientId },
            action: 'TONTINE_GARANTIE_LIBEREE',
            cible: `TontineGarantie#${g.id}`,
            details: { groupeId: g.groupeId, clientId: g.clientId, montant: m, motif },
            transaction: t
        });

        return { garantie: g, libere: m, portefeuille: pf ? Fonds.etat(pf) : null };
    }

    /**
     * Libere toutes les garanties encore actives d'un membre dans un
     * groupe. Appele quand la rotation s'acheve ou quand le membre quitte
     * un groupe non demarre : il n'y a plus rien a garantir.
     */
    static async libererToutesDans(acteur, clientId, groupeId, motif, t) {
        const garanties = await TontineGarantie.findAll({
            where: { clientId, groupeId, statut: { [Op.in]: ['active', 'partiellement_utilisee'] } },
            transaction: t, lock: t.LOCK.UPDATE
        });
        let total = 0;
        for (const g of garanties) {
            const r = await this._libererDans(acteur, g, this.restant(g), motif, t);
            total = arrondir(total + r.libere);
        }
        return { liberees: garanties.length, total };
    }

    // -----------------------------------------------------------------
    //  Consultation
    // -----------------------------------------------------------------
    static _vue(g) {
        return {
            id: g.id,
            groupeId: g.groupeId,
            groupe: g.groupe ? { id: g.groupe.id, nom: g.groupe.nom, statut: g.groupe.statut } : undefined,
            type: g.type,
            source: g.portefeuille ? (g.portefeuille.nom || g.portefeuille.typePortefeuille) : null,
            portefeuilleId: g.portefeuilleId,
            montantInitial: arrondir(g.montantInitial),
            montantUtilise: arrondir(g.montantUtilise),
            montantLibere: arrondir(g.montantLibere),
            restant: this.restant(g),
            statut: g.statut,
            affecteeLe: g.createdAt,
            mouvements: g.mouvements ? g.mouvements.map(m => ({
                sens: m.sens, montant: arrondir(m.montant), motif: m.motif,
                acteur: m.acteurType, date: m.createdAt
            })) : undefined
        };
    }

    /**
     * Les garanties d'un client, groupe par groupe, avec l'exposition
     * qu'elles couvrent : « pourquoi mon argent est bloque », en un ecran.
     */
    static async mesGaranties(clientId) {
        const garanties = await TontineGarantie.findAll({
            where: { clientId },
            include: [
                { model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom', 'statut'] },
                { model: Portefeuille, as: 'portefeuille', attributes: ['id', 'nom', 'typePortefeuille'] }
            ],
            order: [['createdAt', 'DESC']]
        });

        const parGroupe = {};
        for (const g of garanties) {
            const cle = g.groupeId;
            if (!parGroupe[cle]) {
                parGroupe[cle] = {
                    groupeId: cle, nom: g.groupe ? g.groupe.nom : `Groupe ${cle}`,
                    statutGroupe: g.groupe ? g.groupe.statut : null,
                    garanties: [], bloque: 0
                };
            }
            parGroupe[cle].garanties.push(this._vue(g));
            parGroupe[cle].bloque = arrondir(parGroupe[cle].bloque + this.restant(g));
        }

        for (const bloc of Object.values(parGroupe)) {
            try {
                const c = await require('./couverture.service').pourMembre(clientId, bloc.groupeId);
                bloc.exposition = c.exposition;
                bloc.caution = c.caution;
                bloc.couvert = c.couvert;
                bloc.couverture = c.couverture;
                // Deux manques distincts : ce que la regle exige encore, et
                // ce qu'il faudrait pour couvrir tout l'engagement.
                bloc.tauxExige = c.tauxExige;
                bloc.montantExige = c.montantExige;
                bloc.manqueExige = c.manque;
                bloc.suffisant = c.suffisant;
                bloc.manque = arrondir(Math.max(0, c.exposition - c.couvert));
                bloc.regle = c.regle;
            } catch (e) {
                bloc.exposition = null;
            }
        }

        const totalBloque = arrondir(garanties.reduce((s, g) => s + this.restant(g), 0));
        return { totalBloque, groupes: Object.values(parGroupe) };
    }

    static async detail(clientId, garantieId) {
        const g = await TontineGarantie.findByPk(garantieId, {
            include: [
                { model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom', 'statut'] },
                { model: Portefeuille, as: 'portefeuille', attributes: ['id', 'nom', 'typePortefeuille'] },
                { model: TontineGarantieMouvement, as: 'mouvements' },
                { model: TontineConsentementGarantie, as: 'consentement' }
            ],
            order: [[{ model: TontineGarantieMouvement, as: 'mouvements' }, 'id', 'ASC']]
        });
        if (!g) throw new ErreurTontine(404, 'Garantie introuvable');
        if (g.clientId !== clientId) throw new ErreurTontine(403, "Cette garantie n'est pas la votre");
        return {
            ...this._vue(g),
            consentement: g.consentement ? {
                texte: g.consentement.texte, hashTexte: g.consentement.hashTexte,
                versionReglement: g.consentement.versionReglement, accepteLe: g.consentement.accepteLe
            } : null
        };
    }

    /**
     * Vue du president : qui a garanti quoi, en montants. Ni la source ni
     * le portefeuille — la maniere dont un membre finance sa garantie est
     * son affaire, pas celle du groupe.
     */
    static async garantiesGroupe(clientId, groupeId) {
        await exigerActe('consulterGaranties', groupeId, clientId);
        const membres = await TontineMembre.findAll({
            where: { groupeId, statut: { [Op.in]: ['actif', 'suspendu'] } },
            include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }],
            order: [['ordreBeneficiaire', 'ASC'], ['id', 'ASC']]
        });
        const lignes = [];
        for (const m of membres) {
            const bloque = await this.totalBloque(m.clientId, groupeId);
            const caution = await this._cautionDisponible(m.clientId, groupeId);
            const e = await ExpositionService.pourMembre(m.clientId, groupeId, { membre: m });
            const c = await require('./couverture.service').pourMembre(m.clientId, groupeId, { membre: m });
            lignes.push({
                clientId: m.clientId, nom: m.client ? m.client.nom : null,
                tour: m.ordreBeneficiaire, dejaServi: m.aBeneficie,
                exposition: e.exposition, caution, garanties: bloque,
                couvert: arrondir(bloque + caution),
                couverture: this._ratio(bloque + caution, e.exposition),
                // Ce que voit le president : suffisant ou non, pas pourquoi.
                tauxExige: c.tauxExige,
                suffisant: c.suffisant,
                manque: c.manque
            });
        }
        return { groupeId, membres: lignes };
    }
}

module.exports = GarantieService;

'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineAmende, TontineCycle, TontineCotisation
} = require('../../models');
const {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, caisseGroupe,
    exigerRole, exigerGroupeNonGele, ecrireTransaction, transferer
} = require('./commun');
const { exigerActe } = require('./permissions');

// =====================================================================
//  Les amendes.
//
//  Entierement neuve : NjanguiPay n'avait qu'un compteur warningCount,
//  sans consequence financiere. Ici une amende est une DETTE : tant
//  qu'elle n'est pas reglee, le membre ne peut plus cotiser.
//
//  OU VA L'ARGENT. Une amende indemnise celui que le manquement a lese :
//  le beneficiaire du cycle concerne, qui attendait un pot complet.
//
//    - le cycle n'est pas encore verse  -> l'amende entre dans sa caisse
//      et grossit le pot : le beneficiaire la recoit au versement ;
//    - le cycle a deja ete verse        -> elle part directement au
//      beneficiaire de ce cycle. Elle tombait jusqu'ici dans la caisse du
//      cycle SUIVANT, et indemnisait quelqu'un qui n'avait rien subi.
//
//  Deux cas limites :
//    - le sanctionne est lui-meme le beneficiaire du cycle : il se paierait
//      sa propre amende. Elle est reportee sur le cycle en cours, s'il n'est
//      pas le sien ;
//    - plus aucun cycle a abonder (rotation achevee) : elle est partagee a
//      parts egales entre les autres membres, que le manquement a leses
//      collectivement.
//
//  L'autre destination historique — la caisse d'epargne du groupe — a
//  disparu avec elle. Jamais la plateforme : elle gagnerait de l'argent
//  sur les retards.
// =====================================================================

const MOTIFS = ['retard', 'absence', 'indiscipline', 'autre'];
const BAREME_DEFAUT = { retard: 1000, absence: 2000, indiscipline: 5000, autre: 1000 };

class AmendeService {

    static bareme(groupe) {
        const perso = groupe.bareme && typeof groupe.bareme === 'object' ? groupe.bareme : {};
        return { ...BAREME_DEFAUT, ...perso };
    }

    static montantBareme(groupe, motif) {
        return arrondir(nombre(this.bareme(groupe)[motif] || BAREME_DEFAUT.autre));
    }

    /** Le cycle en cours d'un groupe : le dernier qui n'est pas verse. */
    static async cycleEnCours(groupeId, t, verrouiller = false) {
        const options = { transaction: t };
        if (verrouiller && t) options.lock = t.LOCK.UPDATE;
        return TontineCycle.findOne({
            where: { groupeId, statut: { [Op.ne]: 'complete' } },
            order: [['numeroCycle', 'DESC']],
            ...options
        });
    }

    /**
     * Qui recoit le produit d'une amende. Voir l'en-tete du fichier.
     *
     * Renvoie { mode, cycle } :
     *   'pot'          -> la caisse du groupe ; `cycle` est celui qu'elle
     *                     abonde, ou null si le groupe n'a pas demarre ;
     *   'beneficiaire' -> le beneficiaire de `cycle`, deja verse ;
     *   'membres'      -> partage entre les autres membres.
     */
    static async destinataire(amende, groupe, payeurId, t) {
        const enCours = await this.cycleEnCours(groupe.id, t, true);
        const concerne = amende.cycleId
            ? await TontineCycle.findByPk(amende.cycleId, { transaction: t, lock: t.LOCK.UPDATE })
            : enCours;

        if (concerne && concerne.beneficiaireId !== payeurId) {
            return concerne.statut === 'complete'
                ? { mode: 'beneficiaire', cycle: concerne }
                : { mode: 'pot', cycle: concerne };
        }
        if (enCours && enCours.beneficiaireId !== payeurId) return { mode: 'pot', cycle: enCours };
        // Avant le demarrage : l'amende attend dans la caisse et grossira le
        // premier pot verse.
        if (groupe.statut === 'en_attente') return { mode: 'pot', cycle: null };
        return { mode: 'membres', cycle: null };
    }

    // -----------------------------------------------------------------
    //  Infliction
    // -----------------------------------------------------------------
    static async infliger(acteur, groupeId, donnees) {
        const { clientId, motif, montant, cycleId, commentaire } = donnees;
        if (!MOTIFS.includes(motif)) throw new ErreurTontine(400, `Motif invalide (attendu : ${MOTIFS.join(', ')})`);
        if (!clientId) throw new ErreurTontine(400, 'Le membre sanctionne est obligatoire');

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            if (!acteur.systeme) {
                await exigerActe('infligerAmende', groupeId, acteur.clientId, t);
            }

            const membre = await TontineMembre.findOne({
                where: { groupeId, clientId: parseInt(clientId, 10) }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!membre) throw new ErreurTontine(404, "Ce client n'est pas membre du groupe");
            if (membre.statut === 'exclu') throw new ErreurTontine(409, 'Ce membre est deja exclu');

            // Sans cycle designe, l'amende se rattache au cycle en cours :
            // une absence pendant le tour 3 indemnise le beneficiaire du
            // tour 3, meme reglee au tour 5.
            const cycleRattache = cycleId
                || (await this.cycleEnCours(groupeId, t) || {}).id
                || null;

            const amende = await TontineAmende.create({
                groupeId,
                membreId: membre.id,
                clientId: membre.clientId,
                cycleId: cycleRattache,
                motif,
                montant: montant !== undefined && montant !== null
                    ? arrondir(montant) : this.montantBareme(groupe, motif),
                statut: 'due',
                infligeePar: acteur.systeme ? null : acteur.clientId,
                commentaire: commentaire || null
            }, { transaction: t });

            await membre.update({
                nbAvertissements: membre.nbAvertissements + 1
            }, { transaction: t });

            return { amende, groupe };
        }).then(async ({ amende, groupe }) => {
            try {
                const NotificationService = require('./notification.service');
                await NotificationService.amendeInfligee(amende, groupe);
            } catch (e) {
                console.log("[tontine] notification d'amende non envoyee :", e.message);
            }
            return amende;
        });
    }

    /**
     * Amendes de retard levees par le cron a l'echeance d'un cycle.
     * Idempotent : une seule amende de retard par membre et par cycle.
     */
    static async leverPourRetard(cycle, groupe, cotisationsImpayees, t) {
        let levees = 0;
        for (const cotisation of cotisationsImpayees) {
            const deja = await TontineAmende.findOne({
                where: { groupeId: groupe.id, clientId: cotisation.clientId, cycleId: cycle.id, motif: 'retard' },
                transaction: t
            });
            if (deja) continue;

            await TontineAmende.create({
                groupeId: groupe.id,
                membreId: cotisation.membreId,
                clientId: cotisation.clientId,
                cycleId: cycle.id,
                motif: 'retard',
                montant: this.montantBareme(groupe, 'retard'),
                statut: 'due',
                infligeePar: null,   // levee par la regle, pas par une personne
                commentaire: `Cotisation du cycle ${cycle.numeroCycle} non soldee a l'echeance`
            }, { transaction: t });

            await TontineMembre.increment('nbAvertissements', {
                by: 1, where: { id: cotisation.membreId }, transaction: t
            });
            levees++;
        }
        return levees;
    }

    // -----------------------------------------------------------------
    //  Reglement
    // -----------------------------------------------------------------
    static async payer(clientId, amendeId) {
        return db.transaction(async (t) => this.payerDans(clientId, amendeId, t));
    }

    /**
     * Corps du reglement, dans une transaction FOURNIE.
     *
     * Le mandat de prelevement doit regler amendes et cotisation d'un seul
     * bloc : tant que chaque etape ouvrait sa propre transaction, un echec en
     * cours de route laissait les amendes payees et la cotisation ouverte —
     * exactement le reglement partiel que la regle 1 du mandat interdit.
     */
    static async payerDans(clientId, amendeId, t) {
        {
            const amende = await TontineAmende.findByPk(amendeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!amende) throw new ErreurTontine(404, 'Amende introuvable');
            if (amende.clientId !== clientId) throw new ErreurTontine(403, "Cette amende n'est pas la votre");
            if (amende.statut === 'payee') throw new ErreurTontine(409, 'Cette amende est deja reglee');
            if (amende.statut === 'annulee') throw new ErreurTontine(409, 'Cette amende a ete annulee');

            const groupe = await TontineGroupe.findByPk(amende.groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            exigerGroupeNonGele(groupe, "le reglement d'une amende");
            const montant = arrondir(amende.montant);
            const portefeuille = await portefeuilleClient(clientId, t, true);
            const cible = await this.destinataire(amende, groupe, clientId, t);

            let libelle;
            if (cible.mode === 'pot') {
                const caisse = await caisseGroupe(groupe, t, true);
                await transferer(portefeuille, caisse, montant, t, {
                    type: 'amende', clientId, groupeTontineId: groupe.id,
                    description: `Amende (${amende.motif}) — au pot du cycle`
                });
                libelle = cible.cycle ? `pot du cycle ${cible.cycle.numeroCycle}` : 'pot du premier cycle';
                if (cible.cycle) {
                    // Le pot grossit : le beneficiaire lese est indemnise au versement.
                    await cible.cycle.update({
                        montantCollecte: arrondir(nombre(cible.cycle.montantCollecte) + montant)
                    }, { transaction: t });
                }
            } else if (cible.mode === 'beneficiaire') {
                const recoit = await portefeuilleClient(cible.cycle.beneficiaireId, t, true);
                await transferer(portefeuille, recoit, montant, t, {
                    type: 'amende_indemnite', clientId, groupeTontineId: groupe.id,
                    description: `Amende (${amende.motif}) — au beneficiaire lese`
                });
                await ecrireTransaction({
                    montant,
                    type: 'amende_indemnite',
                    description: `Indemnite d'amende (${amende.motif}) — cycle ${cible.cycle.numeroCycle} de ${groupe.nom}`,
                    clientId: cible.cycle.beneficiaireId,
                    groupeId: groupe.id,
                    cycleId: cible.cycle.id,
                    reference: `TNT-AMD-I-${amende.id}`
                }, t);
                libelle = `beneficiaire du cycle ${cible.cycle.numeroCycle}`;
            } else {
                const autres = await TontineMembre.findAll({
                    where: { groupeId: groupe.id, clientId: { [Op.ne]: clientId }, statut: ['actif', 'termine'] },
                    order: [['id', 'ASC']], transaction: t
                });
                if (!autres.length) throw new ErreurTontine(409, 'Aucun membre a indemniser dans ce groupe');
                // Parts entieres ; le reliquat de division va au premier, pour
                // que la somme versee tombe juste au franc pres.
                const part = Math.floor(montant / autres.length);
                const reste = arrondir(montant - part * autres.length);
                for (const [i, m] of autres.entries()) {
                    const somme = arrondir(part + (i === 0 ? reste : 0));
                    if (somme <= 0) continue;
                    const recoit = await portefeuilleClient(m.clientId, t, true);
                    await transferer(portefeuille, recoit, somme, t, {
                        type: 'amende_indemnite', clientId, groupeTontineId: groupe.id,
                        description: `Part d'amende (${amende.motif}) — ${groupe.nom}`
                    });
                    await ecrireTransaction({
                        montant: somme,
                        type: 'amende_indemnite',
                        description: `Part d'amende (${amende.motif}) — ${groupe.nom}`,
                        clientId: m.clientId,
                        groupeId: groupe.id,
                        reference: `TNT-AMD-I-${amende.id}-${m.clientId}`
                    }, t);
                }
                libelle = `${autres.length} membre(s) du groupe`;
            }

            const transaction = await ecrireTransaction({
                montant,
                type: 'amende',
                description: `Amende (${amende.motif}) reglee — au ${libelle} — ${groupe.nom}`,
                clientId,
                groupeId: groupe.id,
                cycleId: cible.cycle ? cible.cycle.id : amende.cycleId,
                reference: `TNT-AMD-${amende.id}`
            }, t);

            await amende.update({
                statut: 'payee',
                datePaiement: new Date(),
                transactionId: transaction.id
            }, { transaction: t });

            // Une amende reglee fait baisser ce que le membre doit encore.
            await require('./defaut.service').apresReglement(clientId, groupe.id,
                `amende (${amende.motif}) reglee`, t);

            return { amende, transaction, soldeRestant: arrondir(portefeuille.solde) };
        }
    }

    static async annuler(acteur, amendeId, commentaire) {
        return db.transaction(async (t) => {
            const amende = await TontineAmende.findByPk(amendeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!amende) throw new ErreurTontine(404, 'Amende introuvable');
            if (amende.statut === 'payee') throw new ErreurTontine(409, 'Une amende reglee ne peut pas etre annulee');
            if (amende.statut === 'annulee') throw new ErreurTontine(409, 'Cette amende est deja annulee');

            await exigerActe('annulerAmende', amende.groupeId, acteur.clientId, t);

            await amende.update({
                statut: 'annulee',
                commentaire: commentaire || amende.commentaire
            }, { transaction: t });
            return amende;
        });
    }

    // -----------------------------------------------------------------
    //  Consultation et regle de blocage
    // -----------------------------------------------------------------
    static async mesAmendes(clientId, groupeId) {
        const where = { clientId };
        if (groupeId) where.groupeId = groupeId;

        const amendes = await TontineAmende.findAll({
            where,
            include: [
                { model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom'] },
                { model: Client, as: 'auteur', attributes: ['id', 'nom'] },
                // Le cycle dit qui l'amende indemnise : son beneficiaire.
                { model: TontineCycle, as: 'cycle', attributes: ['id', 'numeroCycle'], required: false }
            ],
            order: [['createdAt', 'DESC']]
        });
        const dues = amendes.filter(a => a.statut === 'due');
        return {
            amendes,
            totalDu: arrondir(dues.reduce((s, a) => s + nombre(a.montant), 0)),
            nombreDues: dues.length
        };
    }

    static async amendesGroupe(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        const amendes = await TontineAmende.findAll({
            where: { groupeId },
            include: [
                { model: Client, as: 'client', attributes: ['id', 'nom'] },
                { model: Client, as: 'auteur', attributes: ['id', 'nom'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        return {
            amendes,
            totalDu: arrondir(amendes.filter(a => a.statut === 'due')
                .reduce((s, a) => s + nombre(a.montant), 0))
        };
    }

    /**
     * Une amende impayee bloque la cotisation suivante. C'est la regle du
     * reglement interieur : on solde ses dettes avant de remettre au pot.
     */
    static async exigerAucuneAmendeDue(clientId, groupeId, t) {
        const dues = await TontineAmende.findAll({
            where: { clientId, groupeId, statut: 'due' }, transaction: t
        });
        if (!dues.length) return;

        const total = arrondir(dues.reduce((s, a) => s + nombre(a.montant), 0));
        throw new ErreurTontine(409,
            `Reglez d'abord vos ${dues.length} amende(s) en cours (${total} FCFA) avant de cotiser`);
    }
}

module.exports = { AmendeService, MOTIFS, BAREME_DEFAUT };

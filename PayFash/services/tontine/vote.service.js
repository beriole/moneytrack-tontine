'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineVote, TontineVoteReponse, TontineCaution
} = require('../../models');
const { ErreurTontine, nombre, arrondir, exigerRole } = require('./commun');

// =====================================================================
//  Gouvernance.
//
//  NjanguiPay savait creer un vote, collecter les reponses et calculer un
//  resultat — mais rien n'etait jamais applique. Un vote d'exclusion
//  adopte laissait le membre en place, un vote d'ordre ne touchait pas
//  benefitOrder. Ici le depouillement EXECUTE la decision, dans la meme
//  transaction que le calcul du resultat.
// =====================================================================

const SUJETS = ['admettre', 'exclure', 'modifier_regles', 'dissoudre', 'elire_ordre', 'approuver_credit'];
const MODES = ['majorite', 'qualifiee', 'unanimite'];
const CHOIX = ['pour', 'contre', 'abstention'];

// Seuls ces champs du groupe sont modifiables par vote. Le reste (caisse,
// code d'invitation, createur) n'a rien a faire dans une deliberation.
const REGLES_MODIFIABLES = ['montantParPeriode', 'frequence', 'pourcentageCaution', 'bareme', 'destinationAmendes', 'membresMax'];

class VoteService {

    // -----------------------------------------------------------------
    //  Proposition
    // -----------------------------------------------------------------
    static async creer(clientId, groupeId, donnees) {
        const { sujet, cibleId, description, mode = 'majorite', dateLimite, payload } = donnees;
        if (!SUJETS.includes(sujet)) throw new ErreurTontine(400, `Sujet invalide (attendu : ${SUJETS.join(', ')})`);
        if (!MODES.includes(mode)) throw new ErreurTontine(400, `Mode invalide (attendu : ${MODES.join(', ')})`);

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            const moi = await exigerRole(groupeId, clientId, [], t);
            if (moi.statut !== 'actif') throw new ErreurTontine(403, 'Seul un membre actif peut ouvrir un vote');

            if (sujet === 'exclure' || sujet === 'admettre') {
                if (!cibleId) throw new ErreurTontine(400, 'Ce vote doit designer un membre');
                const cible = await TontineMembre.findOne({
                    where: { groupeId, clientId: parseInt(cibleId, 10) }, transaction: t
                });
                if (!cible) throw new ErreurTontine(404, "La cible n'est pas membre du groupe");
                if (sujet === 'exclure' && cible.clientId === groupe.createurId) {
                    throw new ErreurTontine(409, 'Le createur du groupe ne peut pas etre exclu');
                }
            }
            if (sujet === 'elire_ordre' && (!payload || !Array.isArray(payload.ordre))) {
                throw new ErreurTontine(400, "Un vote d'ordre doit porter payload.ordre = [clientId, ...]");
            }
            if (sujet === 'modifier_regles') {
                const champs = Object.keys(payload || {});
                if (!champs.length) throw new ErreurTontine(400, 'Aucune regle proposee');
                const interdits = champs.filter(c => !REGLES_MODIFIABLES.includes(c));
                if (interdits.length) {
                    throw new ErreurTontine(400, `Regles non modifiables par vote : ${interdits.join(', ')}`);
                }
            }

            // Un seul vote ouvert par sujet et par cible a la fois
            const ouvert = await TontineVote.findOne({
                where: { groupeId, sujet, cibleId: cibleId || null, resultat: 'en_attente' }, transaction: t
            });
            if (ouvert) throw new ErreurTontine(409, 'Un vote identique est deja en cours');

            return TontineVote.create({
                groupeId,
                sujet,
                cibleId: cibleId ? parseInt(cibleId, 10) : null,
                description: description || null,
                payload: payload || null,
                mode,
                dateLimite: dateLimite ? new Date(dateLimite) : new Date(Date.now() + 48 * 3600 * 1000),
                resultat: 'en_attente',
                creePar: clientId
            }, { transaction: t });
        }).then(async (vote) => {
            const NotificationService = require('./notification.service');
            const groupe = await TontineGroupe.findByPk(vote.groupeId);
            if (groupe) await NotificationService.voteOuvert(vote, groupe);
            return vote;
        });
    }

    // -----------------------------------------------------------------
    //  Scrutin
    // -----------------------------------------------------------------
    static async repondre(clientId, voteId, choix, commentaire) {
        if (!CHOIX.includes(choix)) throw new ErreurTontine(400, `Choix invalide (attendu : ${CHOIX.join(', ')})`);

        return db.transaction(async (t) => {
            const vote = await TontineVote.findByPk(voteId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!vote) throw new ErreurTontine(404, 'Vote introuvable');
            if (vote.resultat !== 'en_attente') throw new ErreurTontine(409, 'Ce scrutin est clos');
            if (new Date(vote.dateLimite) < new Date()) throw new ErreurTontine(409, 'La date limite du vote est depassee');

            const moi = await exigerRole(vote.groupeId, clientId, [], t);
            if (moi.statut !== 'actif') throw new ErreurTontine(403, 'Seul un membre actif peut voter');
            if (vote.sujet === 'exclure' && vote.cibleId === clientId) {
                throw new ErreurTontine(403, 'On ne vote pas sur sa propre exclusion');
            }

            const deja = await TontineVoteReponse.findOne({
                where: { voteId, clientId }, transaction: t
            });
            if (deja) throw new ErreurTontine(409, 'Vous avez deja vote sur ce scrutin');

            const reponse = await TontineVoteReponse.create({
                voteId, clientId, choix, commentaire: commentaire || null, dateReponse: new Date()
            }, { transaction: t });

            return { reponse, depouillementPossible: await this._toutLeMondeAVote(vote, t) };
        });
    }

    static async _electeurs(vote, t) {
        const where = { groupeId: vote.groupeId, statut: 'actif' };
        if (vote.sujet === 'exclure' && vote.cibleId) where.clientId = { [Op.ne]: vote.cibleId };
        return TontineMembre.count({ where, transaction: t });
    }

    static async _toutLeMondeAVote(vote, t) {
        const electeurs = await this._electeurs(vote, t);
        const exprimes = await TontineVoteReponse.count({ where: { voteId: vote.id }, transaction: t });
        return exprimes >= electeurs;
    }

    /** Depouillement pur, sans effet de bord. */
    static async _compter(vote, t) {
        const reponses = await TontineVoteReponse.findAll({ where: { voteId: vote.id }, transaction: t });
        const electeurs = await this._electeurs(vote, t);

        const pour = reponses.filter(r => r.choix === 'pour').length;
        const contre = reponses.filter(r => r.choix === 'contre').length;
        const abstentions = reponses.filter(r => r.choix === 'abstention').length;

        let resultat;
        if (vote.mode === 'unanimite') {
            resultat = pour === electeurs && electeurs > 0 ? 'approuve' : 'rejete';
        } else if (vote.mode === 'qualifiee') {
            resultat = pour >= Math.ceil((2 * electeurs) / 3) && electeurs > 0 ? 'approuve' : 'rejete';
        } else {
            if (pour === contre) resultat = pour === 0 ? 'rejete' : 'egalite';
            else resultat = pour > contre ? 'approuve' : 'rejete';
        }

        return { electeurs, pour, contre, abstentions, exprimes: reponses.length, resultat };
    }

    // -----------------------------------------------------------------
    //  Depouillement ET application
    // -----------------------------------------------------------------
    static async depouiller(acteur, voteId) {
        return db.transaction(async (t) => {
            const vote = await TontineVote.findByPk(voteId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!vote) throw new ErreurTontine(404, 'Vote introuvable');
            if (vote.resultat !== 'en_attente') throw new ErreurTontine(409, 'Ce scrutin est deja depouille');

            if (!acteur.systeme) {
                await exigerRole(vote.groupeId, acteur.clientId, ['president', 'secretaire'], t,
                    'depouiller un scrutin');
                const clos = new Date(vote.dateLimite) <= new Date();
                if (!clos && !(await this._toutLeMondeAVote(vote, t))) {
                    throw new ErreurTontine(409,
                        'Scrutin encore ouvert : attendez la date limite ou que tous les electeurs se soient exprimes');
                }
            }

            const compte = await this._compter(vote, t);
            await vote.update({
                resultat: compte.resultat,
                dateResolution: new Date()
            }, { transaction: t });

            // C'est ici que le vote devient un acte, et non un sondage.
            let effet;
            if (compte.resultat === 'approuve') {
                effet = await this._appliquer(vote, t);
            } else if (vote.sujet === 'approuver_credit') {
                // Un credit non approuve doit etre clos, sinon la demande
                // reste eternellement "en attente" et bloque l'emprunteur.
                const CreditService = require('./credit.service');
                await CreditService.rejeter(vote.cibleId, t);
                effet = { applique: true, detail: 'Demande de credit rejetee par le groupe' };
            } else {
                effet = { applique: false, detail: 'Vote non adopte : aucun effet' };
            }

            return { vote, ...compte, effet };
        });
    }

    static async _appliquer(vote, t) {
        const groupe = await TontineGroupe.findByPk(vote.groupeId, { transaction: t, lock: t.LOCK.UPDATE });

        switch (vote.sujet) {
            case 'exclure': {
                const RecouvrementService = require('./recouvrement.service');
                // Le vote court-circuite le pouvoir du president : c'est le
                // groupe qui tranche, l'appel se fait donc en tant que systeme.
                const r = await RecouvrementService.exclureDansTransaction(
                    { systeme: true }, groupe, vote.cibleId,
                    `Exclusion votee (scrutin #${vote.id})`, t);
                const renumerotes = await this.renumeroterTours(groupe.id, t);
                return {
                    applique: true,
                    detail: `Membre exclu, ${renumerotes} tour(s) renumerote(s) sans trou`,
                    membresRestants: r.membresRestants
                };
            }

            case 'admettre': {
                const membre = await TontineMembre.findOne({
                    where: { groupeId: groupe.id, clientId: vote.cibleId }, transaction: t, lock: t.LOCK.UPDATE
                });
                if (!membre) return { applique: false, detail: 'Cible introuvable' };
                await membre.update({ statut: 'actif', dateAdhesion: membre.dateAdhesion || new Date() }, { transaction: t });
                const actifs = await TontineMembre.count({ where: { groupeId: groupe.id, statut: 'actif' }, transaction: t });
                await groupe.update({ membresActuels: actifs }, { transaction: t });
                return { applique: true, detail: 'Membre admis' };
            }

            case 'elire_ordre': {
                const ordre = (vote.payload || {}).ordre || [];
                let rang = 0;
                for (const clientId of ordre) {
                    const membre = await TontineMembre.findOne({
                        where: { groupeId: groupe.id, clientId: parseInt(clientId, 10), statut: 'actif' },
                        transaction: t, lock: t.LOCK.UPDATE
                    });
                    if (membre) await membre.update({ ordreBeneficiaire: ++rang }, { transaction: t });
                }
                return { applique: true, detail: `Ordre de passage reecrit sur ${rang} membre(s)` };
            }

            case 'modifier_regles': {
                const modifs = {};
                for (const champ of REGLES_MODIFIABLES) {
                    if (vote.payload && vote.payload[champ] !== undefined) modifs[champ] = vote.payload[champ];
                }
                await groupe.update(modifs, { transaction: t });
                return {
                    applique: true,
                    detail: `Regles modifiees : ${Object.keys(modifs).join(', ')}`,
                    note: 'Les cotisations deja ouvertes gardent leur montant ; le changement prend effet au cycle suivant.'
                };
            }

            case 'dissoudre': {
                await groupe.update({ statut: 'termine' }, { transaction: t });
                // La dissolution rend les cautions : le groupe n'a plus rien a garantir.
                const cautions = await TontineCaution.findAll({
                    where: { groupeId: groupe.id, statut: { [Op.ne]: 'liberee' } }, transaction: t
                });
                return {
                    applique: true,
                    detail: `Groupe dissous. ${cautions.length} caution(s) a restituer.`,
                    cautionsARestituer: cautions.map(c => c.id)
                };
            }

            case 'approuver_credit': {
                const CreditService = require('./credit.service');
                const demande = await CreditService.marquerApprouvee(vote.cibleId, t);
                if (!demande) return { applique: false, detail: 'Demande de credit introuvable' };
                return {
                    applique: true,
                    detail: `Credit de ${demande.montant} FCFA approuve, en attente de decaissement par le tresorier`,
                    demandeId: demande.id
                };
            }

            default:
                return { applique: false, detail: 'Sujet sans effet automatique' };
        }
    }

    /**
     * Referme les trous de la file d'attente apres une exclusion.
     *
     * Les membres deja servis gardent leur rang : sinon la rotation
     * perdrait sa memoire. Les non-servis sont renumerotes de facon
     * contigue juste au-dessus, dans leur ordre relatif actuel.
     */
    static async renumeroterTours(groupeId, t) {
        const membres = await TontineMembre.findAll({
            where: { groupeId, statut: 'actif' },
            order: [['ordreBeneficiaire', 'ASC']],
            transaction: t, lock: t.LOCK.UPDATE
        });

        const servis = membres.filter(m => m.aBeneficie && m.ordreBeneficiaire != null);
        const restants = membres.filter(m => !m.aBeneficie && m.ordreBeneficiaire != null);
        let rang = servis.reduce((max, m) => Math.max(max, m.ordreBeneficiaire), 0);

        let modifies = 0;
        for (const m of restants) {
            const nouveau = ++rang;
            if (m.ordreBeneficiaire !== nouveau) {
                await m.update({ ordreBeneficiaire: nouveau }, { transaction: t });
                modifies++;
            }
        }
        return modifies;
    }

    // -----------------------------------------------------------------
    //  Consultation et cron
    // -----------------------------------------------------------------
    static async detail(clientId, voteId) {
        const vote = await TontineVote.findByPk(voteId, {
            include: [
                { model: Client, as: 'auteur', attributes: ['id', 'nom'] },
                {
                    model: TontineVoteReponse, as: 'reponses',
                    include: [{ model: Client, as: 'votant', attributes: ['id', 'nom'] }]
                }
            ]
        });
        if (!vote) throw new ErreurTontine(404, 'Vote introuvable');
        await exigerRole(vote.groupeId, clientId, [], null);

        const compte = await this._compter(vote, null);
        return {
            vote,
            depouillement: vote.resultat === 'en_attente'
                ? { ...compte, resultat: 'provisoire : ' + compte.resultat }
                : compte
        };
    }

    static async votesGroupe(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        const votes = await TontineVote.findAll({
            where: { groupeId },
            include: [{ model: Client, as: 'auteur', attributes: ['id', 'nom'] }],
            order: [['createdAt', 'DESC']]
        });
        return {
            votes,
            enCours: votes.filter(v => v.resultat === 'en_attente').length
        };
    }

    /** Cron : depouille les scrutins dont la date limite est passee. */
    static async traiterVotesEchus(maintenant = new Date()) {
        const echus = await TontineVote.findAll({
            where: { resultat: 'en_attente', dateLimite: { [Op.lte]: maintenant } }
        });

        const rapport = { examines: echus.length, approuves: 0, rejetes: 0, egalites: 0, erreurs: [] };
        for (const vote of echus) {
            try {
                const r = await this.depouiller({ systeme: true }, vote.id);
                if (r.resultat === 'approuve') rapport.approuves++;
                else if (r.resultat === 'egalite') rapport.egalites++;
                else rapport.rejetes++;
            } catch (e) {
                rapport.erreurs.push({ voteId: vote.id, message: e.message });
            }
        }
        return rapport;
    }
}

module.exports = { VoteService, SUJETS, MODES, CHOIX, REGLES_MODIFIABLES };

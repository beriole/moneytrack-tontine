'use strict';

const { Op } = require('sequelize');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineEnchere
} = require('../../models');
const { ErreurTontine, nombre, arrondir, exigerRole } = require('./commun');

// =====================================================================
//  L'enchere sur le pot.
//
//  Entierement neuve : NjanguiPay declarait orderMode 'bid' dans son ENUM
//  sans aucun service derriere.
//
//  Mecanique reelle des tontines d'affaires : celui qui a besoin d'argent
//  tout de suite accepte de renoncer a une part du pot pour le prendre en
//  avance. Cette decote est redistribuee aux autres membres — c'est le
//  rendement de leur epargne, et l'interet qu'ils ont a attendre.
//
//  La redistribution elle-meme se fait au versement (cycle.service).
// =====================================================================

class EnchereService {

    /**
     * Une enchere ne peut se tenir que sur un pot encore vierge : changer
     * de beneficiaire apres des cotisations obligerait a rembourser puis
     * regenerer les lignes. On l'interdit plutot que de le rattraper.
     */
    static async _cycleOuvrable(cycleId, t) {
        const cycle = await TontineCycle.findByPk(cycleId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!cycle) throw new ErreurTontine(404, 'Cycle introuvable');
        if (cycle.statut === 'complete') throw new ErreurTontine(409, 'Ce cycle est deja verse');

        const dejaPaye = await TontineCotisation.count({
            where: { cycleId, statut: { [Op.in]: ['payee', 'partielle'] } }, transaction: t
        });
        if (dejaPaye > 0) {
            throw new ErreurTontine(409,
                `L'enchere doit se tenir avant la premiere cotisation (${dejaPaye} deja versee(s))`);
        }
        return cycle;
    }

    static async ouvrir(acteur, cycleId, dateLimite) {
        return db.transaction(async (t) => {
            const cycle = await this._cycleOuvrable(cycleId, t);
            const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t });

            if (groupe.modeOrdre !== 'enchere') {
                throw new ErreurTontine(409, `Ce groupe attribue les tours par "${groupe.modeOrdre}", pas par enchere`);
            }
            await exigerRole(groupe.id, acteur.clientId, ['president'], t, 'ouvrir une enchere');

            const ouvertes = await TontineEnchere.count({
                where: { cycleId, statut: 'active' }, transaction: t
            });
            return {
                cycle,
                offresActives: ouvertes,
                dateLimite: dateLimite ? new Date(dateLimite) : new Date(Date.now() + 24 * 3600 * 1000),
                message: 'Enchere ouverte : les membres non encore servis peuvent proposer une decote.'
            };
        });
    }

    /**
     * Une offre = la somme que l'encherisseur accepte de perdre sur le pot
     * pour l'emporter maintenant. Une seule offre active par membre :
     * reoffrir remplace la precedente.
     */
    static async offrir(clientId, cycleId, montantDecote) {
        const decote = arrondir(montantDecote);
        if (!(decote > 0)) throw new ErreurTontine(400, 'La decote doit etre strictement positive');

        return db.transaction(async (t) => {
            const cycle = await this._cycleOuvrable(cycleId, t);
            const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t });
            if (groupe.modeOrdre !== 'enchere') {
                throw new ErreurTontine(409, 'Ce groupe ne fonctionne pas aux encheres');
            }

            const membre = await TontineMembre.findOne({
                where: { groupeId: groupe.id, clientId, statut: 'actif' }, transaction: t
            });
            if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre actif de ce groupe");
            if (membre.aBeneficie) throw new ErreurTontine(409, 'Vous avez deja mange : vous ne pouvez plus encherir');

            const attendu = arrondir(cycle.montantAttendu);
            if (decote >= attendu) {
                throw new ErreurTontine(400, `La decote doit rester inferieure au pot (${attendu} FCFA)`);
            }

            const existante = await TontineEnchere.findOne({
                where: { cycleId, clientId, statut: 'active' }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (existante) {
                await existante.update({ montantDecote: decote, dateOffre: new Date() }, { transaction: t });
                return { enchere: existante, remplacee: true };
            }

            const enchere = await TontineEnchere.create({
                cycleId, membreId: membre.id, clientId,
                montantDecote: decote, statut: 'active', dateOffre: new Date()
            }, { transaction: t });
            return { enchere, remplacee: false };
        });
    }

    static async retirer(clientId, enchereId) {
        const enchere = await TontineEnchere.findByPk(enchereId);
        if (!enchere) throw new ErreurTontine(404, 'Offre introuvable');
        if (enchere.clientId !== clientId) throw new ErreurTontine(403, "Cette offre n'est pas la votre");
        if (enchere.statut !== 'active') throw new ErreurTontine(409, 'Cette offre n est plus active');
        await enchere.update({ statut: 'retiree' });
        return enchere;
    }

    static async offres(clientId, cycleId) {
        const cycle = await TontineCycle.findByPk(cycleId);
        if (!cycle) throw new ErreurTontine(404, 'Cycle introuvable');
        await exigerRole(cycle.groupeId, clientId, [], null);

        const encheres = await TontineEnchere.findAll({
            where: { cycleId },
            include: [{ model: Client, as: 'encherisseur', attributes: ['id', 'nom'] }],
            order: [['montantDecote', 'DESC'], ['dateOffre', 'ASC']]
        });
        const actives = encheres.filter(e => e.statut === 'active');
        return {
            cycle,
            encheres,
            meilleure: actives.length ? actives[0] : null,
            potApresDecote: actives.length
                ? arrondir(nombre(cycle.montantAttendu) - nombre(actives[0].montantDecote))
                : arrondir(cycle.montantAttendu)
        };
    }

    /**
     * Adjuge le pot. La plus forte decote l'emporte ; a egalite, la
     * premiere offre deposee gagne — l'anteriorite departage, pas le hasard.
     *
     * Le beneficiaire du cycle change, donc les cotisations attendues sont
     * regenerees : le nouveau gagnant ne cotise plus pour son propre tour,
     * et l'ancien beneficiaire pressenti redevient cotisant.
     */
    static async adjuger(acteur, cycleId) {
        const CycleService = require('./cycle.service');

        return db.transaction(async (t) => {
            const cycle = await this._cycleOuvrable(cycleId, t);
            const groupe = await TontineGroupe.findByPk(cycle.groupeId, { transaction: t, lock: t.LOCK.UPDATE });

            if (!acteur.systeme) {
                await exigerRole(groupe.id, acteur.clientId, ['president'], t, 'adjuger une enchere');
            }

            const actives = await TontineEnchere.findAll({
                where: { cycleId, statut: 'active' },
                order: [['montantDecote', 'DESC'], ['dateOffre', 'ASC']],
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (!actives.length) throw new ErreurTontine(409, 'Aucune offre active sur ce cycle');

            const gagnante = actives[0];
            await gagnante.update({ statut: 'gagnante' }, { transaction: t });
            for (const perdante of actives.slice(1)) {
                await perdante.update({ statut: 'perdante' }, { transaction: t });
            }

            const ancienBeneficiaire = cycle.beneficiaireId;
            await cycle.update({ beneficiaireId: gagnante.clientId }, { transaction: t });

            // Le beneficiaire ayant change, la liste des cotisants change aussi.
            await TontineCotisation.destroy({ where: { cycleId }, transaction: t });
            const membres = await TontineMembre.findAll({
                where: { groupeId: groupe.id, statut: 'actif' }, transaction: t
            });
            const lignes = await CycleService.genererCotisations(cycle, groupe, membres, t);

            return {
                gagnant: gagnante.clientId,
                decote: arrondir(gagnante.montantDecote),
                ancienBeneficiaire,
                cotisationsRegenerees: lignes,
                potNet: arrondir(nombre(cycle.montantAttendu) - nombre(gagnante.montantDecote)),
                offresPerdantes: actives.length - 1
            };
        });
    }

    /** L'offre gagnante d'un cycle, si elle existe. Lue au versement. */
    static async gagnante(cycleId, t) {
        return TontineEnchere.findOne({
            where: { cycleId, statut: 'gagnante' }, transaction: t
        });
    }
}

module.exports = EnchereService;

'use strict';

const { Op } = require('sequelize');
const { db, TontineGroupe, TontineMembre, TontineGarantie } = require('../../models');
const { ErreurTontine, arrondir } = require('./commun');

// =====================================================================
//  Liberation progressive des garanties.
//
//  Une garantie couvre ce qu'un membre doit encore. A chaque cotisation
//  payee, ce reste baisse ; la part de garantie qui le depasse ne protege
//  plus rien et n'a pas a rester bloquee.
//
//  Ce qu'il faut garder couvert, caution comprise :
//    - si le reglement fixe un taux de couverture : ce taux applique a ce
//      qui reste a payer (exemple de la section 24 : 50 % de 400 000, puis
//      50 % de 200 000) ;
//    - sinon : tout ce qui reste a payer. La garantie a ete donnee pour le
//      couvrir ; on ne rend que ce qui depasse.
//
//  Rien n'est rendu a un membre qui a une echeance en souffrance dans le
//  groupe, qui est exclu, dont le groupe est gele, ou a qui la reprise de
//  garantie est interdite. Les garanties les plus recentes sont rendues
//  d'abord : les plus anciennes portent le consentement initial.
//
//  Chaque liberation passe par GarantieService._libererDans : mouvement,
//  reserve du portefeuille et journal d'audit dans la meme transaction.
// =====================================================================

class LiberationService {

    /**
     * Ce qui peut etre rendu, et pourquoi — ou pourquoi rien.
     * Lecture seule ; `t` quand le calcul fonde une decision.
     */
    static async excedent(clientId, groupeId, t = null) {
        const CouvertureService = require('./couverture.service');
        const DefautService = require('./defaut.service');

        const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
        if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
        const membre = await TontineMembre.findOne({ where: { groupeId, clientId }, transaction: t });
        if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");

        const rien = (raison) => ({ liberable: 0, raison });
        if (groupe.statut === 'suspendu') return rien('Groupe gele par l\'administration');
        if (groupe.statut !== 'actif') return rien('La tontine n\'a pas demarre ou est achevee');
        if (membre.statut !== 'actif') return rien('Votre adhesion n\'est pas active');
        if (await DefautService.doitEncore(clientId, groupeId, t)) return rien('Une echeance reste a regler dans ce groupe');
        const { RestrictionService } = require('../restriction.service');
        const r = await RestrictionService.active(clientId, 'WITHDRAW_GUARANTEE_DISABLED', t);
        if (r) return rien(`Reprise de garantie suspendue : ${r.motif}`);

        const c = await CouvertureService.pourMembre(clientId, groupeId, { t, groupe, membre });
        const aGarder = c.tauxExige > 0 ? c.montantExige : c.exposition;
        const liberable = arrondir(Math.min(c.garanties, Math.max(0, c.couvert - aGarder)));
        return {
            liberable,
            aGarder,
            exposition: c.exposition,
            tauxExige: c.tauxExige,
            caution: c.caution,
            garanties: c.garanties,
            raison: liberable > 0
                ? `Il vous reste ${c.exposition} FCFA a payer ; ${aGarder} FCFA doivent rester couverts`
                : 'Vos garanties ne depassent pas ce qui doit rester couvert'
        };
    }

    /**
     * Rend l'excedent, dans la transaction de l'appelant. Renvoie le
     * montant rendu (0 si rien).
     */
    static async libererExcedentDans(acteur, clientId, groupeId, motif, t) {
        const GarantieService = require('./garantie.service');
        const e = await this.excedent(clientId, groupeId, t);
        let reste = e.liberable;
        if (!(reste > 0)) return { libere: 0, raison: e.raison };

        const garanties = await TontineGarantie.findAll({
            where: { clientId, groupeId, statut: { [Op.in]: ['active', 'partiellement_utilisee'] } },
            order: [['id', 'DESC']], transaction: t, lock: t.LOCK.UPDATE
        });
        let libere = 0;
        for (const g of garanties) {
            if (reste <= 0) break;
            const part = Math.min(reste, GarantieService.restant(g));
            if (part <= 0) continue;
            const r = await GarantieService._libererDans(acteur, g, part, motif, t);
            libere = arrondir(libere + r.libere);
            reste = arrondir(reste - r.libere);
        }
        return { libere, raison: e.raison };
    }

    /** Demande du membre : « rendez-moi ce qui ne sert plus ». */
    static async reprendreExcedent(clientId, groupeId) {
        const r = await db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
            const res = await this.libererExcedentDans({ clientId }, clientId, groupeId,
                'Liberation progressive a la demande du membre', t);
            if (!(res.libere > 0)) throw new ErreurTontine(409, `Rien a liberer : ${res.raison}`);
            return { ...res, groupe };
        });
        await this._notifier(clientId, r.groupe, r.libere);
        return { libere: r.libere, raison: r.raison };
    }

    static async _notifier(clientId, groupe, montant) {
        try {
            const NotificationService = require('./notification.service');
            await NotificationService.garantieLiberee(clientId, groupe, montant);
        } catch (e) {
            console.log('[tontine] notification de liberation non envoyee :', e.message);
        }
    }
}

module.exports = LiberationService;

'use strict';

const { Op } = require('sequelize');
const { Restriction, Client } = require('../models');
const { journaliser } = require('./audit.service');

// =====================================================================
//  Restrictions — fermer une porte sans fermer le compte.
//
//  Voir models/model.restriction.js. Ce service les pose, les leve, et
//  repond a la seule question que les autres services lui posent :
//  « ce client a-t-il le droit de faire CECI ? ».
// =====================================================================

const TYPES = {
    JOIN_TONTINE_DISABLED: 'rejoindre une tontine',
    RECEIVE_POT_DISABLED: 'recevoir un pot',
    AUCTION_DISABLED: 'encherir sur un pot',
    WITHDRAW_GUARANTEE_DISABLED: 'reprendre une garantie',
    CREATE_TONTINE_DISABLED: 'creer une tontine'
};

class ErreurRestriction extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ErreurRestriction';
    }
}

/** Condition SQL d'une restriction en vigueur. */
function enVigueur(maintenant = new Date()) {
    return {
        leveeLe: null,
        [Op.or]: [{ actifJusqu: null }, { actifJusqu: { [Op.gt]: maintenant } }]
    };
}

class RestrictionService {

    static types() {
        return Object.entries(TYPES).map(([type, libelle]) => ({ type, libelle }));
    }

    static libelle(type) { return TYPES[type] || type; }

    /** Les restrictions en vigueur d'un client. */
    static async actives(clientId, t = null) {
        return Restriction.findAll({
            where: { clientId, ...enVigueur() },
            order: [['createdAt', 'DESC']],
            transaction: t
        });
    }

    /** La restriction en vigueur d'un type donne, ou null. */
    static async active(clientId, type, t = null) {
        return Restriction.findOne({ where: { clientId, type, ...enVigueur() }, transaction: t });
    }

    /**
     * Pose une restriction. `acteur` : { admin } depuis le back-office,
     * { systeme: true } depuis une regle automatique.
     */
    static async poser(acteur, { clientId, type, motif, actifJusqu }, req = null) {
        if (!TYPES[type]) {
            throw new ErreurRestriction(400, `Type de restriction inconnu (attendu : ${Object.keys(TYPES).join(', ')})`);
        }
        if (!motif || !String(motif).trim()) {
            throw new ErreurRestriction(400, 'Une restriction se motive : le membre doit pouvoir savoir pourquoi');
        }
        const client = await Client.findByPk(clientId);
        if (!client) throw new ErreurRestriction(404, 'Client introuvable');
        if (await this.active(clientId, type)) {
            throw new ErreurRestriction(409, `Ce client ne peut deja plus ${TYPES[type]}`);
        }

        const r = await Restriction.create({
            clientId, type,
            motif: String(motif).trim(),
            origine: acteur.systeme ? 'SYSTEME' : 'ADMIN',
            adminId: acteur.admin ? acteur.admin.id : null,
            actifJusqu: actifJusqu || null
        });
        await journaliser({
            acteur: acteur.systeme ? { systeme: true } : { admin: acteur.admin },
            action: 'RESTRICTION_POSEE',
            cible: `Client#${clientId}`,
            details: { restrictionId: r.id, type, motif: r.motif, actifJusqu: r.actifJusqu },
            req
        });
        return r;
    }

    static async lever(acteur, restrictionId, motifLevee, req = null) {
        const r = await Restriction.findByPk(restrictionId);
        if (!r) throw new ErreurRestriction(404, 'Restriction introuvable');
        if (r.leveeLe) throw new ErreurRestriction(409, 'Cette restriction est deja levee');
        await r.update({
            leveeLe: new Date(),
            leveePar: acteur.admin ? acteur.admin.id : null,
            motifLevee: motifLevee || null
        });
        await journaliser({
            acteur: acteur.systeme ? { systeme: true } : { admin: acteur.admin },
            action: 'RESTRICTION_LEVEE',
            cible: `Client#${r.clientId}`,
            details: { restrictionId: r.id, type: r.type, motifLevee: motifLevee || null },
            req
        });
        return r;
    }

    static vue(r) {
        return {
            id: r.id, type: r.type, libelle: `Ne peut plus ${TYPES[r.type] || r.type}`,
            motif: r.motif, origine: r.origine,
            depuis: r.createdAt, jusqua: r.actifJusqu, leveeLe: r.leveeLe
        };
    }
}

module.exports = { RestrictionService, ErreurRestriction };

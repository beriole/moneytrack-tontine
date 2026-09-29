'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const {
    Litige, Client, Transaction, AuditLog, Restriction, EvaluationRisque,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineAmende, TontineCaution,
    TontineGarantie, TontineGarantieMouvement, TontineEnchere, TontineIncidentDefaut,
    TontineEvaluationEligibilite
} = require('../models');
const { ErreurTontine } = require('./tontine/commun');
const { journaliser } = require('./audit.service');

// =====================================================================
//  Litiges (section 28).
//
//  Toute operation sensible peut etre contestee par le client qu'elle
//  concerne — et seulement par lui. A l'ouverture, le serveur prend un
//  instantane des preuves : l'operation elle-meme, les ecritures du grand
//  livre qui s'y rattachent, les traces d'audit, la decision et son
//  evaluation de risque le cas echeant. Ce que le client ecrit n'est
//  jamais une preuve ; ce que la base contenait ce jour-la en est une.
//  L'empreinte SHA-256 de l'instantane permet de montrer qu'il n'a pas
//  ete retouche depuis.
//
//  Ouvrir un litige ne suspend rien : il documente, l'administration
//  tranche. Suspendre un recouvrement pendant l'instruction serait une
//  decision a part entiere, qui releverait du reglement.
// =====================================================================

const OUVERTS = ['en attente', 'en cours'];
const STATUTS_FINAUX = ['résolu', 'rejeté'];

const plat = (x) => (x && typeof x.toJSON === 'function' ? x.toJSON() : x);
const plats = (l) => (l || []).map(plat);

async function ecritures(where) {
    return plats(await Transaction.findAll({
        where, order: [['id', 'ASC']], limit: 50,
        attributes: ['id', 'montant', 'type', 'statut', 'description', 'date', 'reference', 'groupeTontineId', 'cycleTontineId']
    }));
}

async function audit(cibles) {
    return plats(await AuditLog.findAll({
        where: { cible: { [Op.in]: cibles } }, order: [['id', 'ASC']], limit: 50,
        attributes: ['id', 'action', 'cible', 'details', 'acteurType', 'acteurId', 'acteurLibelle', 'adminEmail', 'createdAt']
    }));
}

// Chaque type : charge l'objet, verifie qu'il concerne le client, et
// rassemble ses preuves. Renvoie null si introuvable ou etranger.
const OBJETS = {
    cotisation: {
        libelle: 'une cotisation',
        async charger(clientId, id) {
            const c = await TontineCotisation.findByPk(id);
            if (!c || c.clientId !== clientId) return null;
            const cycle = await TontineCycle.findByPk(c.cycleId);
            return {
                groupeId: cycle.groupeId,
                resume: `Cotisation du cycle ${cycle.numeroCycle} (${c.statut})`,
                preuves: {
                    cotisation: plat(c), cycle: plat(cycle),
                    incident: plat(await TontineIncidentDefaut.findOne({ where: { cotisationId: c.id } })),
                    ecritures: await ecritures({ ClientTransactionId: clientId, cycleTontineId: cycle.id }),
                    audit: await audit([`TontineCotisation#${c.id}`, `TontineCycle#${cycle.id}`])
                }
            };
        }
    },
    incident: {
        libelle: 'une echeance non couverte',
        async charger(clientId, id) {
            const i = await TontineIncidentDefaut.findByPk(id);
            if (!i || i.clientId !== clientId) return null;
            const c = await TontineCotisation.findByPk(i.cotisationId);
            return {
                groupeId: i.groupeId,
                resume: `Echeance non couverte : ${i.resteDu} FCFA restants sur ${i.montantInitial}`,
                preuves: {
                    incident: plat(i), cotisation: plat(c),
                    ecritures: await ecritures({ ClientTransactionId: clientId, cycleTontineId: i.cycleId }),
                    audit: await audit([`TontineIncidentDefaut#${i.id}`, `TontineCotisation#${i.cotisationId}`])
                }
            };
        }
    },
    amende: {
        libelle: 'une amende',
        async charger(clientId, id) {
            const a = await TontineAmende.findByPk(id);
            if (!a || a.clientId !== clientId) return null;
            return {
                groupeId: a.groupeId,
                resume: `Amende de ${a.montant} FCFA (${a.motif}, ${a.statut})`,
                preuves: {
                    amende: plat(a),
                    ecritures: await ecritures({ ClientTransactionId: clientId, reference: { [Op.like]: `TNT-AMD-${a.id}%` } }),
                    audit: await audit([`TontineAmende#${a.id}`])
                }
            };
        }
    },
    garantie: {
        libelle: 'une garantie (blocage ou prelevement)',
        async charger(clientId, id) {
            const g = await TontineGarantie.findByPk(id);
            if (!g || g.clientId !== clientId) return null;
            return {
                groupeId: g.groupeId,
                resume: `Garantie de ${g.montantInitial} FCFA : ${g.montantUtilise} preleves, ${g.montantLibere} rendus`,
                preuves: {
                    garantie: plat(g),
                    mouvements: plats(await TontineGarantieMouvement.findAll({ where: { garantieId: g.id }, order: [['id', 'ASC']] })),
                    ecritures: await ecritures({ ClientTransactionId: clientId, reference: { [Op.like]: `TNT-GAR-%-${g.id}-%` } }),
                    audit: await audit([`TontineGarantie#${g.id}`])
                }
            };
        }
    },
    caution: {
        libelle: 'une caution (saisie ou restitution)',
        async charger(clientId, id) {
            const c = await TontineCaution.findByPk(id);
            if (!c || c.clientId !== clientId) return null;
            return {
                groupeId: c.groupeId,
                resume: `Caution de ${c.montantBloque} FCFA : ${c.montantUtilise} saisis (${c.statut})`,
                preuves: {
                    caution: plat(c),
                    ecritures: await ecritures({
                        ClientTransactionId: clientId, groupeTontineId: c.groupeId,
                        type: { [Op.in]: ['caution_blocage', 'caution_saisie', 'caution_liberation'] }
                    }),
                    audit: await audit([`TontineCaution#${c.id}`])
                }
            };
        }
    },
    versement: {
        libelle: 'le versement d\'un pot',
        async charger(clientId, id) {
            const cycle = await TontineCycle.findByPk(id);
            if (!cycle || cycle.beneficiaireId !== clientId) return null;
            return {
                groupeId: cycle.groupeId,
                resume: `Pot du cycle ${cycle.numeroCycle} (${cycle.statut})`,
                preuves: {
                    cycle: plat(cycle),
                    ecritures: await ecritures({ cycleTontineId: cycle.id }),
                    decisions: plats(await TontineEvaluationEligibilite.findAll({
                        where: { clientId, cycleId: cycle.id, operation: 'versement' }, order: [['id', 'ASC']]
                    })),
                    audit: await audit([`TontineCycle#${cycle.id}`])
                }
            };
        }
    },
    enchere: {
        libelle: 'une enchere',
        async charger(clientId, id) {
            const e = await TontineEnchere.findByPk(id);
            if (!e || e.clientId !== clientId) return null;
            const cycle = await TontineCycle.findByPk(e.cycleId);
            return {
                groupeId: cycle ? cycle.groupeId : null,
                resume: `Enchere : decote de ${e.montantDecote} FCFA (${e.statut})`,
                preuves: {
                    enchere: plat(e), cycle: plat(cycle),
                    concurrentes: plats(await TontineEnchere.findAll({
                        where: { cycleId: e.cycleId }, attributes: ['id', 'montantDecote', 'statut', 'dateOffre']
                    })),
                    audit: await audit([`TontineEnchere#${e.id}`, `TontineCycle#${e.cycleId}`])
                }
            };
        }
    },
    eligibilite: {
        libelle: 'un refus d\'eligibilite',
        async charger(clientId, id) {
            const d = await TontineEvaluationEligibilite.findByPk(id);
            if (!d || d.clientId !== clientId) return null;
            // L'evaluation de risque conservee a cote de la decision.
            const risque = await EvaluationRisque.findOne({
                where: {
                    clientId, contexte: d.operation,
                    createdAt: { [Op.between]: [new Date(new Date(d.createdAt).getTime() - 60000), new Date(new Date(d.createdAt).getTime() + 60000)] }
                },
                order: [['id', 'DESC']]
            });
            return {
                groupeId: d.groupeId,
                resume: `Decision « ${d.operation} » : ${d.resultat}`,
                preuves: { decision: plat(d), risque: plat(risque) }
            };
        }
    },
    transaction: {
        libelle: 'une operation de portefeuille',
        async charger(clientId, id) {
            const t = await Transaction.findByPk(id);
            if (!t || t.ClientTransactionId !== clientId) return null;
            return {
                groupeId: t.groupeTontineId || null,
                resume: `${t.type} de ${t.montant} FCFA (${t.statut})`,
                preuves: { transaction: plat(t), audit: await audit([`Transaction#${t.id}`]) }
            };
        }
    },
    restriction: {
        libelle: 'une restriction de compte',
        async charger(clientId, id) {
            const r = await Restriction.findByPk(id);
            if (!r || r.clientId !== clientId) return null;
            const traces = (await AuditLog.findAll({
                where: { cible: `Client#${clientId}`, action: { [Op.like]: 'RESTRICTION_%' } }, order: [['id', 'ASC']]
            })).map(plat).filter(a => {
                const d = typeof a.details === 'string' ? JSON.parse(a.details) : a.details;
                return d && d.restrictionId === r.id;
            });
            return { groupeId: null, resume: `Restriction : ${r.type}`, preuves: { restriction: plat(r), audit: traces } };
        }
    }
};

function empreinte(preuves) {
    return crypto.createHash('sha256').update(JSON.stringify(preuves), 'utf8').digest('hex');
}

class LitigeService {

    static objets() {
        return [...Object.entries(OBJETS).map(([type, o]) => ({ type, libelle: o.libelle })),
            { type: 'autre', libelle: 'autre chose' }];
    }

    /**
     * Ouvre un litige. `objetType` absent ou 'autre' : litige libre, sans
     * objet rattache (le comportement historique).
     */
    static async ouvrir(clientId, { description, objetType, objetId }) {
        clientId = Number(clientId);
        const texte = description && String(description).trim();
        if (!texte) throw new ErreurTontine(400, 'Decrivez ce que vous contestez');
        if (texte.length > 2000) throw new ErreurTontine(400, 'Description trop longue (2000 caracteres au plus)');

        let rattache = { groupeId: null, resume: null, preuves: null };
        const type = objetType && objetType !== 'autre' ? String(objetType) : null;
        if (type) {
            const def = OBJETS[type];
            if (!def) throw new ErreurTontine(400, `Objet de litige inconnu (attendu : ${Object.keys(OBJETS).join(', ')}, autre)`);
            const id = parseInt(objetId, 10);
            if (!id) throw new ErreurTontine(400, "Indiquez l'operation contestee");
            rattache = await def.charger(clientId, id);
            // Introuvable ou etranger : meme reponse, pour ne rien reveler
            // de l'existence des operations des autres.
            if (!rattache) throw new ErreurTontine(404, 'Operation introuvable');
            const deja = await Litige.findOne({
                where: { clientId, objetType: type, objetId: id, statut: { [Op.in]: OUVERTS } }
            });
            if (deja) throw new ErreurTontine(409, `Un litige est deja ouvert sur cette operation (n°${deja.id})`);
        }

        const preuves = type ? {
            captureLe: new Date().toISOString(),
            objet: { type, id: parseInt(objetId, 10), resume: rattache.resume },
            ...rattache.preuves
        } : null;
        const litige = await Litige.create({
            description: texte.slice(0, 255) === texte ? texte : texte.slice(0, 252) + '...',
            statut: 'en attente',
            dateSoummission: new Date(),
            clientId,
            objetType: type,
            objetId: type ? parseInt(objetId, 10) : null,
            groupeId: rattache.groupeId,
            preuves: preuves ? { ...preuves, descriptionComplete: texte } : (texte.length > 255 ? { descriptionComplete: texte } : null),
            empreintePreuves: preuves ? empreinte(preuves) : null
        });

        await journaliser({
            acteur: { clientId },
            action: 'LITIGE_OUVERT',
            cible: `Litige#${litige.id}`,
            details: { objetType: type, objetId: litige.objetId, groupeId: litige.groupeId, empreinte: litige.empreintePreuves }
        });
        return litige;
    }

    static vue(l) {
        return {
            id: l.id,
            statut: l.statut,
            description: (l.preuves && l.preuves.descriptionComplete) || l.description,
            objetType: l.objetType,
            objetId: l.objetId,
            objet: l.preuves && l.preuves.objet ? l.preuves.objet.resume : null,
            groupeId: l.groupeId,
            ouvertLe: l.dateSoummission || l.createdAt,
            reponse: l.reponse,
            traiteLe: l.dateResolution
        };
    }

    static async mesLitiges(clientId) {
        const liste = await Litige.findAll({ where: { clientId }, order: [['createdAt', 'DESC']], limit: 100 });
        return liste.map(l => this.vue(l));
    }

    /** L'instantane est-il intact ? */
    static verifierPreuves(l) {
        if (!l.preuves || !l.empreintePreuves) return null;
        const { descriptionComplete, ...instantane } = l.preuves;
        return empreinte(instantane) === l.empreintePreuves;
    }

    /**
     * Tranche un litige. La reponse est obligatoire : le client doit savoir
     * pourquoi on lui donne raison ou tort.
     */
    static async trancher(admin, litigeId, { statut, reponse }, req = null) {
        const l = await Litige.findByPk(litigeId);
        if (!l) throw new ErreurTontine(404, 'Litige introuvable');
        if (STATUTS_FINAUX.includes(l.statut)) throw new ErreurTontine(409, 'Ce litige est deja tranche');
        const s = statut === 'rejeté' || statut === 'rejete' ? 'rejeté' : statut === 'en cours' ? 'en cours' : 'résolu';
        const r = reponse && String(reponse).trim();
        if (s !== 'en cours' && !r) throw new ErreurTontine(400, 'Expliquez la decision au client');
        await l.update({
            statut: s,
            reponse: r || l.reponse,
            dateResolution: s === 'en cours' ? null : new Date(),
            traitePar: admin && admin.id ? admin.id : null
        });
        await journaliser({
            acteur: { admin },
            action: s === 'en cours' ? 'LITIGE_PRIS_EN_CHARGE' : 'LITIGE_TRANCHE',
            cible: `Litige#${l.id}`,
            details: { statut: s, reponse: r || null },
            req
        });
        try {
            const NotificationService = require('./tontine/notification.service');
            const message = s === 'en cours'
                ? `Votre litige n°${l.id} est en cours d'examen.`
                : `Votre litige n°${l.id} est ${s === 'rejeté' ? 'rejete' : 'resolu'} : ${r}`;
            await NotificationService.envoyer(l.clientId, message, {
                type: 'system', lien: { ecran: 'MesLitiges', params: {} }, cle: `litige-${l.id}-${s}`
            });
        } catch (e) {
            console.log('[litige] notification non envoyee :', e.message);
        }
        return l;
    }
}

module.exports = { LitigeService, OUVERTS };

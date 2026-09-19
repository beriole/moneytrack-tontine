'use strict';

const { Op } = require('sequelize');
const {
    Client, TontineMembre, TontineCotisation, TontineContrat, TontineSignature,
    TontineEvaluationEligibilite
} = require('../../models');
const { ErreurTontine } = require('./commun');
const KycService = require('../kyc.service');
const { RestrictionService } = require('../restriction.service');
const CouvertureService = require('./couverture.service');

// =====================================================================
//  Eligibilite — peut-on laisser ce membre franchir cette porte ?
//
//  L'argent d'une tontine arrive a un membre par trois portes, et une
//  quatrieme les ouvre toutes :
//
//    creation   creer une tontine ;
//    adhesion   rejoindre une tontine ;
//    enchere    encherir pour recevoir un pot avant son tour ;
//    versement  recevoir le pot.
//
//  Chaque porte avait ses propres controles, ecrits a la main, et aucune
//  ne regardait tout : la cotisation verifiait le statut du membre, le
//  versement la completude du pot, l'enchere seulement « a-t-il deja
//  mange ». Ici, une seule liste de controles, dont chaque porte retient
//  ceux qui la concernent :
//
//                           creation adhesion enchere versement
//    compte actif              x        x        x        x
//    niveau KYC exige          x        x        x        x
//    aucune restriction        x        x        x        x
//    groupe non gele                    x        x        x
//    adhesion active                             x        x
//    aucun defaut en cours              x        x        x
//    reglement accepte                           x        x
//    couverture suffisante                       x        x
//
//  Le moteur est DETERMINISTE : des regles, pas une prediction. Une IA
//  peut aider a expliquer une decision ; elle ne la prend pas.
//
//  Toute decision qui autorise ou refuse un acte est conservee (controles,
//  resultat, version du moteur) : un refus doit pouvoir s'expliquer des
//  mois plus tard, y compris dans un litige.
// =====================================================================

const VERSION = 'eligibilite-1.0';

const PORTES = {
    creation: ['compte', 'kyc', 'restriction'],
    adhesion: ['compte', 'kyc', 'restriction', 'groupe', 'defauts'],
    enchere: ['compte', 'kyc', 'restriction', 'groupe', 'membre', 'defauts', 'reglement', 'couverture'],
    versement: ['compte', 'kyc', 'restriction', 'groupe', 'membre', 'defauts', 'reglement', 'couverture']
};

const RESTRICTION_PAR_PORTE = {
    creation: 'CREATE_TONTINE_DISABLED',
    adhesion: 'JOIN_TONTINE_DISABLED',
    enchere: 'AUCTION_DISABLED',
    versement: 'RECEIVE_POT_DISABLED'
};

const NIVEAUX = { 0: 'aucun', 1: 'email confirme', 2: 'identite verifiee' };

// Le vocabulaire est celui de la section 42 : jamais « fraudeur » ni
// « risque de vol » — ce qui est mesure, c'est une situation, pas une
// moralite.
class EligibiliteService {

    static async _controles(clientId, operation, ctx) {
        const { groupe, cycle, t } = ctx;
        const noms = PORTES[operation];
        if (!noms) throw new Error(`Operation d'eligibilite inconnue : ${operation}`);
        const res = [];
        const ajouter = (code, ok, motif, codeHttp = 409) => res.push({ code, ok, motif: ok ? null : motif, codeHttp });

        const client = await Client.findByPk(clientId, { transaction: t });
        if (!client) throw new ErreurTontine(404, 'Client introuvable');

        let membre = ctx.membre || null;
        if (!membre && groupe && (noms.includes('membre') || noms.includes('couverture'))) {
            membre = await TontineMembre.findOne({ where: { groupeId: groupe.id, clientId }, transaction: t });
        }

        for (const nom of noms) {
            switch (nom) {
                case 'compte':
                    ajouter('compte', client.isActive !== false, 'Compte desactive', 403);
                    break;

                case 'kyc': {
                    const exige = await KycService.niveauExige(operation, t);
                    const effectif = KycService.niveauEffectif(client);
                    const compte = operation === 'versement' && ctx.lecteur !== 'membre'
                        ? 'le compte du beneficiaire est' : 'votre compte est';
                    ajouter('kyc', effectif >= exige,
                        `Verification requise : niveau « ${NIVEAUX[exige]} » exige, ${compte} au niveau « ${NIVEAUX[effectif]} »`,
                        403);
                    break;
                }

                case 'restriction': {
                    const r = await RestrictionService.active(clientId, RESTRICTION_PAR_PORTE[operation], t);
                    ajouter('restriction', !r,
                        r ? `Eligibilite temporairement limitee : vous ne pouvez pas ${RestrictionService.libelle(r.type)} (${r.motif})` : null,
                        403);
                    break;
                }

                case 'groupe':
                    ajouter('groupe', groupe && groupe.statut !== 'suspendu',
                        'Tontine gelee par l\'administration : operation suspendue jusqu\'au degel');
                    break;

                case 'membre':
                    ajouter('membre', !!membre && membre.statut === 'actif',
                        membre ? `Votre adhesion est « ${membre.statut} »` : "Vous n'etes pas membre de ce groupe", 403);
                    break;

                case 'defauts': {
                    // Toutes les tontines du client, pas seulement celle-ci :
                    // une echeance en souffrance ailleurs pese sur la capacite
                    // a honorer celle-ci.
                    const retards = await TontineCotisation.count({
                        where: { clientId, statut: { [Op.in]: ['en_retard', 'impayee'] } }, transaction: t
                    });
                    ajouter('defauts', retards === 0,
                        `Echeance en retard : ${retards} cotisation(s) non soldee(s) dans vos tontines`);
                    break;
                }

                case 'reglement': {
                    // Recevoir le pot, c'est l'avoir obtenu selon des regles
                    // qu'on a acceptees. S'il existe un reglement en vigueur,
                    // il faut l'avoir signe.
                    const contrat = await TontineContrat.findOne({
                        where: { groupeId: groupe.id, statut: { [Op.in]: ['en_attente_signatures', 'signe'] } },
                        order: [['version', 'DESC']], transaction: t
                    });
                    let signe = true;
                    if (contrat) {
                        signe = !!(await TontineSignature.findOne({
                            where: { contratId: contrat.id, clientId }, transaction: t
                        }));
                    }
                    ajouter('reglement', signe,
                        contrat ? `Reglement interieur (version ${contrat.version}) a signer` : null);
                    break;
                }

                case 'couverture': {
                    if (!membre) { ajouter('couverture', false, "Vous n'etes pas membre de ce groupe"); break; }
                    // Pour une enchere, le tour vise est celui du cycle mis aux
                    // encheres : c'est la precocite du pot qui fait l'exigence.
                    const tour = operation === 'enchere' && cycle ? cycle.numeroCycle : undefined;
                    const c = await CouvertureService.pourMembre(clientId, groupe.id, { t, groupe, membre, tour });
                    // Au versement, c'est le president qui lit le motif ; ailleurs,
                    // le membre lui-meme.
                    const qui = operation === 'versement' && ctx.lecteur !== 'membre'
                        ? { reste: 'il restera au beneficiaire', couvre: 'il en couvre' }
                        : { reste: 'il vous restera', couvre: 'vous en couvrez' };
                    ajouter('couverture', c.suffisant,
                        `Couverture insuffisante : ${qui.reste} ${c.exposition} FCFA a payer ; le reglement exige `
                        + `d'en garantir ${c.tauxExige} % (${c.montantExige} FCFA), ${qui.couvre} ${c.couvert} FCFA — `
                        + `il manque ${c.manque} FCFA de garantie`);
                    res[res.length - 1].detail = {
                        exposition: c.exposition, couvert: c.couvert, tauxExige: c.tauxExige,
                        montantExige: c.montantExige, manque: c.manque
                    };
                    break;
                }
            }
        }
        return res;
    }

    /**
     * Evalue sans rien decider ni conserver : ce que l'ecran montre avant
     * que le membre tente l'operation.
     */
    static async evaluer(clientId, operation, ctx = {}) {
        const controles = await this._controles(clientId, operation, ctx);
        const refus = controles.filter(c => !c.ok);
        return {
            operation,
            resultat: refus.length ? 'NON_ELIGIBLE' : 'ELIGIBLE',
            controles: controles.map(({ code, ok, motif, detail }) => ({ code, ok, motif, ...(detail ? { detail } : {}) })),
            raisons: refus.map(c => c.motif),
            versionMoteur: VERSION
        };
    }

    /**
     * Autorise ou refuse, et conserve la decision.
     *
     * La trace s'ecrit HORS de la transaction de l'appelant : un refus fait
     * annuler cette transaction, et la trace du refus partirait avec elle.
     */
    static async exiger(clientId, operation, ctx = {}) {
        const controles = await this._controles(clientId, operation, ctx);
        const refus = controles.filter(c => !c.ok);
        const resultat = refus.length ? 'NON_ELIGIBLE' : 'ELIGIBLE';

        try {
            await TontineEvaluationEligibilite.create({
                clientId,
                groupeId: ctx.groupe ? ctx.groupe.id : null,
                cycleId: ctx.cycle ? ctx.cycle.id : null,
                operation, resultat,
                controles: controles.map(({ code, ok, motif, detail }) => ({ code, ok, motif, ...(detail ? { detail } : {}) })),
                versionMoteur: VERSION
            });
        } catch (e) {
            console.log("[eligibilite] trace de decision non enregistree :", e.message);
        }

        if (!refus.length) return { resultat, controles };

        const premier = refus[0];
        const sujet = operation === 'versement' ? 'Versement suspendu' : 'Operation refusee';
        throw new ErreurTontine(premier.codeHttp,
            `${sujet} — ${refus.map(c => c.motif).join(' ; ')}.`);
    }

    /** Les dernieres decisions prises pour un client, pour l'administration. */
    static async historique(clientId, limite = 20) {
        return TontineEvaluationEligibilite.findAll({
            where: { clientId }, order: [['createdAt', 'DESC']], limit: limite
        });
    }
}

module.exports = EligibiliteService;

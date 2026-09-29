'use strict';

const { Portefeuille, Transaction } = require('../../models');
const Fonds = require('../fonds.service');
const { STATUTS } = require('../statutTransaction');

// =====================================================================
//  Briques partagees par les services tontine.
// =====================================================================

/**
 * Erreur portant un code HTTP, pour que les controllers restent minces.
 */
class ErreurTontine extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ErreurTontine';
    }
}

/**
 * Sequelize renvoie les colonnes DECIMAL sous forme de chaines
 * ("25000.00"). Les additionner sans conversion produit "025000.00".
 */
function nombre(valeur) {
    const n = parseFloat(valeur);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Portefeuille.solde est un FLOAT : on arrondit au centime a chaque
 * ecriture pour que les erreurs binaires ne s'accumulent pas.
 */
function arrondir(valeur) {
    return Math.round(nombre(valeur) * 100) / 100;
}

/**
 * Portefeuille de reglement d'un client : le courant, sinon le principal,
 * sinon n'importe quel portefeuille actif qui n'est pas une caisse.
 */
async function portefeuilleClient(clientId, t, verrouiller = false) {
    const base = { ClientPortefeuilleId: clientId, estActif: true };
    const options = { transaction: t };
    if (verrouiller && t) options.lock = t.LOCK.UPDATE;

    let pf = await Portefeuille.findOne({ where: { ...base, typePortefeuille: 'courant' }, ...options });
    if (!pf) pf = await Portefeuille.findOne({ where: { ...base, estPrincipal: true }, ...options });
    if (!pf) pf = await Portefeuille.findOne({ where: base, ...options });

    if (!pf) throw new ErreurTontine(404, "Ce membre n'a aucun portefeuille actif pour regler sa cotisation");
    if (pf.typePortefeuille === 'tontine') {
        throw new ErreurTontine(409, "Le portefeuille de reglement ne peut pas etre une caisse de tontine");
    }
    return pf;
}

/**
 * Caisse d'un groupe. Verrouillee pendant les mouvements d'argent.
 */
async function caisseGroupe(groupe, t, verrouiller = false) {
    const options = { transaction: t };
    if (verrouiller && t) options.lock = t.LOCK.UPDATE;

    const caisse = await Portefeuille.findOne({
        where: { id: groupe.portefeuilleId, typePortefeuille: 'tontine' },
        ...options
    });
    if (!caisse) throw new ErreurTontine(500, `La caisse du groupe ${groupe.id} est introuvable`);
    return caisse;
}

/**
 * Portefeuille auxiliaire d'un groupe (le sequestre des cautions), cree a
 * la demande. La creation paresseuse evite d'imposer
 * une migration de donnees aux groupes deja existants.
 */
async function portefeuilleAuxiliaire(groupe, champ, libelle, t, verrouiller = false) {
    const { TontineGroupe } = require('../../models');
    const options = { transaction: t };
    if (verrouiller && t) options.lock = t.LOCK.UPDATE;

    if (groupe[champ]) {
        const existant = await Portefeuille.findByPk(groupe[champ], options);
        if (existant) return existant;
    }

    const cree = await Portefeuille.create({
        nom: `${libelle} ${groupe.nom}`,
        solde: 0,
        devise: groupe.devise || 'XAF',
        typePortefeuille: 'tontine',
        estPrincipal: false,
        estActif: true,
        ClientPortefeuilleId: null,
        groupeTontineId: groupe.id,
        description: `${libelle} du groupe. Ni retrait ni transfert par les routes client.`
    }, { transaction: t });

    await TontineGroupe.update({ [champ]: cree.id }, { where: { id: groupe.id }, transaction: t });
    groupe[champ] = cree.id;

    // Relu avec le verrou demande, maintenant qu'il existe
    return verrouiller && t ? Portefeuille.findByPk(cree.id, options) : cree;
}

/** Sequestre des cautions du groupe. */
function portefeuilleCaution(groupe, t, verrouiller = false) {
    return portefeuilleAuxiliaire(groupe, 'portefeuilleCautionId', 'Cautions', t, verrouiller);
}


/**
 * Charge l'adhesion du client et controle qu'elle porte un des roles
 * attendus. La charge n'est pas decorative : le president demarre un cycle,
 * sanctionne, arbitre et prononce une exclusion.
 *
 * La question est toujours posee POUR UN GROUPE : le meme client preside
 * l'un et n'est que membre de l'autre. C'est l'adhesion qui porte le role,
 * jamais le compte.
 *
 * La liste des roles n'est plus ecrite sur les sites d'appel : ils declarent
 * un acte, et permissions.js dit qui peut le poser.
 *
 * Le createur du groupe beneficiait ici d'une exception permanente — il
 * gardait les prerogatives du president « meme si le role a ete
 * reattribue ». Elle rendait toute passation fictive : l'ancien president
 * conservait ses pouvoirs sans qu'aucune colonne ne le dise, et deux
 * personnes presidaient sans que l'une des deux soit visible. La
 * presidence se lit maintenant a un seul endroit, TontineMembre.role, et
 * se transmet par PresidenceService.
 */
async function exigerRole(groupeId, clientId, roles, t, action = 'cette action') {
    const { TontineMembre } = require('../../models');
    const membre = await TontineMembre.findOne({ where: { groupeId, clientId }, transaction: t });
    if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");

    if (!roles || !roles.length) return membre;
    if (roles.includes(membre.role)) return membre;

    throw new ErreurTontine(403, `Reserve a : ${roles.join(', ')} — ${action}`);
}

/**
 * Un groupe gele ne bouge plus d'argent.
 *
 * Le back-office presente le gel comme une mesure conservatoire qui
 * « suspend l'argent de plusieurs personnes ». En pratique, seule la
 * cotisation testait le statut : le versement du pot — le plus gros
 * mouvement — passait, comme l'apport, le decaissement de credit, le
 * reglement d'amende, la liberation de caution et la casse annuelle.
 */
function exigerGroupeActif(groupe, action = 'cette operation') {
    exigerGroupeNonGele(groupe, action);
    if (groupe.statut === 'termine') {
        throw new ErreurTontine(409, `« ${groupe.nom} » est termine : ${action} n'est plus possible`);
    }
}

/**
 * Variante pour les operations qui SOLDENT une dette envers le groupe :
 * regler une amende, rembourser un credit, saisir une caution, clore
 * l'exercice, restituer une caution.
 *
 * Un groupe termine doit pouvoir se liquider — sinon un credit encore
 * dehors quand la rotation s'acheve serait irremboursable, et l'argent
 * reste bloque des deux cotes. Seul le gel administratif les suspend.
 */
function exigerGroupeNonGele(groupe, action = 'cette operation') {
    if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
    if (groupe.statut === 'suspendu') {
        throw new ErreurTontine(409,
            `« ${groupe.nom} » est gele par l'administration : ${action} est suspendue jusqu'au degel`);
    }
}

/**
 * Ecrit une transaction du module tontine.
 *
 * Deux precautions par rapport au reste du projet :
 *  - frais force a 0 : le modele transaction a un defaut de 100,3 FCFA qui
 *    n'a aucun sens sur un mouvement interne de tontine ;
 *  - reference unique : un rejeu (double clic, retry client) heurte la
 *    contrainte d'unicite au lieu de creer une seconde ecriture.
 */
async function ecrireTransaction(donnees, t) {
    return Transaction.create({
        montant: arrondir(donnees.montant),
        date: new Date(),
        type: donnees.type,
        statut: STATUTS.SUCCESS,
        description: donnees.description,
        frais: 0,
        ClientTransactionId: donnees.clientId,
        groupeTontineId: donnees.groupeId || null,
        cycleTontineId: donnees.cycleId || null,
        reference: donnees.reference || null
    }, { transaction: t });
}

/**
 * Deplace de l'argent d'un portefeuille vers un autre, dans la
 * transaction SQL du caller. Les deux portefeuilles doivent avoir ete
 * charges avec un verrou.
 */
async function transferer(source, destination, montant, t, contexte = {}) {
    // La regle du disponible vit dans services/fonds.service.js, commune a
    // toutes les sorties d'argent du projet. Ce transfert comparait le
    // montant au solde brut : une fois des fonds bloques en garantie, une
    // cotisation aurait pu les consommer.
    //
    // L'erreur est retraduite en ErreurTontine pour que les controleurs du
    // module, qui ne connaissent qu'elle, gardent le bon code HTTP.
    try {
        return await Fonds.transferer(source, destination, montant, t, contexte);
    } catch (e) {
        if (e instanceof Fonds.ErreurFonds) throw new ErreurTontine(e.code, e.message);
        throw e;
    }
}

module.exports = {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, caisseGroupe, portefeuilleCaution,
    exigerRole, exigerGroupeActif, exigerGroupeNonGele, ecrireTransaction, transferer
};

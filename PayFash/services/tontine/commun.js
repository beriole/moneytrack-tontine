'use strict';

const { Portefeuille, Transaction } = require('../../models');

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
 * Portefeuille auxiliaire d'un groupe (sequestre de caution, caisse
 * d'epargne), cree a la demande. La creation paresseuse evite d'imposer
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

/** Caisse d'epargne du groupe (caisse 2). */
function portefeuilleEpargne(groupe, t, verrouiller = false) {
    return portefeuilleAuxiliaire(groupe, 'portefeuilleEpargneId', 'Epargne', t, verrouiller);
}

/**
 * Charge l'adhesion du client et controle qu'elle porte un des roles
 * attendus. Le bureau d'une tontine n'est pas decoratif : seul le censeur
 * inflige une amende, seul le tresorier encaisse, seul le president
 * demarre un cycle.
 */
async function exigerRole(groupeId, clientId, roles, t, action = 'cette action') {
    const { TontineMembre, TontineGroupe } = require('../../models');
    const membre = await TontineMembre.findOne({ where: { groupeId, clientId }, transaction: t });
    if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");

    if (!roles || !roles.length) return membre;
    if (roles.includes(membre.role)) return membre;

    // Le createur garde les prerogatives du president meme si le role a
    // ete reattribue : il reste responsable du groupe.
    const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
    if (groupe && groupe.createurId === clientId && roles.includes('president')) return membre;

    throw new ErreurTontine(403, `Reserve a : ${roles.join(', ')} — ${action}`);
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
        statut: 'Succès',
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
async function transferer(source, destination, montant, t) {
    const m = arrondir(montant);
    if (m <= 0) throw new ErreurTontine(400, 'Le montant doit etre strictement positif');
    if (arrondir(source.solde) < m) {
        throw new ErreurTontine(402, `Solde insuffisant : ${arrondir(source.solde)} disponible, ${m} requis`);
    }
    await source.update({ solde: arrondir(nombre(source.solde) - m) }, { transaction: t });
    await destination.update({ solde: arrondir(nombre(destination.solde) + m) }, { transaction: t });
    return m;
}

module.exports = {
    ErreurTontine, nombre, arrondir,
    portefeuilleClient, caisseGroupe, portefeuilleCaution, portefeuilleEpargne,
    exigerRole, ecrireTransaction, transferer
};

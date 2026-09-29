'use strict';

// =====================================================================
//  Fonds disponibles et fonds bloques — le noyau commun.
//
//  Un portefeuille porte deux montants :
//
//    solde           ce qu'il contient ;
//    montantReserve  la part immobilisee en garantie.
//
//  Seul le DISPONIBLE — solde moins reserve — peut en sortir. La regle
//  vaut pour toutes les sorties : cotisation, retrait Mobile Money,
//  transfert entre portefeuilles, depot sur un objectif d'epargne,
//  ajustement administrateur. Elle etait jusqu'ici ecrite nulle part,
//  puisque rien ne pouvait etre bloque : chaque sortie comparait le
//  montant au solde brut, chacune a sa facon.
//
//  Ce module ne connait ni la tontine ni le paiement. Il manipule des
//  portefeuilles DEJA CHARGES ET VERROUILLES par l'appelant, dans la
//  transaction de l'appelant : c'est ce qui rend une reserve et un retrait
//  simultanes du meme argent impossibles — le second attend le verrou,
//  relit le solde, et voit la reserve posee par le premier.
// =====================================================================

class ErreurFonds extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'ErreurFonds';
    }
}

function nombre(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

/** Au centime : le solde est encore un FLOAT. */
function arrondir(v) {
    return Math.round(nombre(v) * 100) / 100;
}

function montantPositif(m) {
    const x = arrondir(m);
    if (!(x > 0)) throw new ErreurFonds(400, 'Le montant doit etre strictement positif');
    return x;
}

/** La part du solde immobilisee. */
function reserve(pf) {
    return arrondir(pf.montantReserve);
}

/** Ce qui peut sortir du portefeuille. Jamais negatif. */
function disponible(pf) {
    return arrondir(Math.max(0, nombre(pf.solde) - nombre(pf.montantReserve)));
}

/** Vue lisible d'un portefeuille : total, disponible, bloque. */
function etat(pf) {
    return { solde: arrondir(pf.solde), disponible: disponible(pf), bloque: reserve(pf) };
}

/**
 * Leve une erreur si `montant` depasse le disponible.
 *
 * Le message distingue « vous n'avez pas l'argent » de « vous l'avez, mais
 * il garantit une obligation » : ce sont deux situations differentes pour
 * celui qui les lit, et la seconde a une issue.
 */
function exigerDisponible(pf, montant) {
    const m = arrondir(montant);
    const dispo = disponible(pf);
    if (dispo >= m) return m;

    const bloque = reserve(pf);
    const message = bloque > 0
        ? `Solde disponible insuffisant : ${dispo} FCFA disponibles, ${m} requis. `
          + `${bloque} FCFA de ce portefeuille sont bloques en garantie.`
        : `Solde insuffisant : ${dispo} FCFA disponibles, ${m} requis`;
    throw new ErreurFonds(402, message, { disponible: dispo, bloque, requis: m });
}

/** Retire `montant` du disponible. Le portefeuille doit etre verrouille. */
async function debiter(pf, montant, t) {
    const m = exigerDisponible(pf, montantPositif(montant));
    await pf.update({ solde: arrondir(nombre(pf.solde) - m) }, { transaction: t });
    return m;
}

/** Ajoute `montant` au solde. */
async function crediter(pf, montant, t) {
    const m = montantPositif(montant);
    await pf.update({ solde: arrondir(nombre(pf.solde) + m) }, { transaction: t });
    return m;
}

/**
 * Immobilise `montant` du disponible. L'argent ne bouge pas : il cesse
 * seulement de pouvoir sortir.
 */
async function reserver(pf, montant, t) {
    const m = exigerDisponible(pf, montantPositif(montant));
    await pf.update({ montantReserve: arrondir(reserve(pf) + m) }, { transaction: t });
    return m;
}

/** Rend `montant` de la reserve au disponible. */
async function liberer(pf, montant, t) {
    const m = montantPositif(montant);
    if (m > reserve(pf)) {
        throw new ErreurFonds(409,
            `Liberation impossible : ${reserve(pf)} FCFA bloques, ${m} demandes`);
    }
    await pf.update({ montantReserve: arrondir(reserve(pf) - m) }, { transaction: t });
    return m;
}

/**
 * Preleve `montant` DANS la reserve : c'est la mobilisation d'une garantie.
 * Le solde et la reserve baissent ensemble ; le disponible ne bouge pas —
 * ce que le client pouvait depenser, il le peut toujours.
 */
async function debiterReserve(pf, montant, t) {
    const m = montantPositif(montant);
    if (m > reserve(pf)) {
        throw new ErreurFonds(409,
            `Mobilisation impossible : ${reserve(pf)} FCFA bloques, ${m} demandes`);
    }
    await pf.update({
        solde: arrondir(nombre(pf.solde) - m),
        montantReserve: arrondir(reserve(pf) - m)
    }, { transaction: t });
    return m;
}

/**
 * Ecrit le mouvement au grand livre, dans la transaction de l'appelant
 * (section 30). Charge ici et non en tete : le grand livre passe par les
 * modeles, qui n'ont pas a etre charges pour un simple calcul de solde.
 */
function livre() {
    return require('./ledger.service').LedgerService;
}

/**
 * Deplace de l'argent d'un portefeuille a un autre. Les deux doivent etre
 * charges avec un verrou, dans `t`. Un meme portefeuille des deux cotes
 * est refuse : les deux mises a jour s'ecraseraient, et le montant serait
 * cree a partir de rien.
 *
 * `contexte` nomme le mouvement au grand livre : { type, reference,
 * description, clientId, groupeTontineId, cycleTontineId }.
 */
async function transferer(source, destination, montant, t, contexte = {}) {
    if (source.id === destination.id) {
        throw new ErreurFonds(409, 'Un transfert vers le meme portefeuille est sans objet');
    }
    const m = await debiter(source, montant, t);
    await crediter(destination, m, t);
    await livre().transfert(source, destination, m, { type: 'transfert', ...contexte }, t);
    return m;
}

/**
 * Mobilise une garantie : l'argent sort de la PART BLOQUEE d'un
 * portefeuille vers un autre. Les deux gestes tenaient en deux appels
 * separes ; au grand livre, chacun aurait alors semble venir de nulle
 * part ou aller nulle part.
 */
async function transfererDepuisReserve(source, destination, montant, t, contexte = {}) {
    if (source.id === destination.id) {
        throw new ErreurFonds(409, 'Un transfert vers le meme portefeuille est sans objet');
    }
    const m = await debiterReserve(source, montant, t);
    await crediter(destination, m, t);
    await livre().transfert(source, destination, m, { type: 'garantie_mobilisation', ...contexte }, t);
    return m;
}

/**
 * De l'argent qui ENTRE dans MoneyTrack (recharge, restitution par
 * l'operateur). La contrepartie est le compte du monde exterieur : la
 * frontiere est ecrite, elle aussi.
 */
async function entree(pf, montant, t, contexte = {}) {
    const m = await crediter(pf, montant, t);
    await livre().mouvementExterne(pf, 'credit', m, { type: 'recharge', ...contexte }, t);
    return m;
}

/** De l'argent qui SORT de MoneyTrack (retrait). */
async function sortie(pf, montant, t, contexte = {}) {
    const m = await debiter(pf, montant, t);
    await livre().mouvementExterne(pf, 'debit', m, { type: 'retrait', ...contexte }, t);
    return m;
}

/**
 * Ajustement decide par l'administration (maker-checker). La contrepartie
 * est un compte de systeme : un ajustement reste une ecriture, jamais une
 * modification silencieuse d'un solde.
 */
async function ajuster(pf, sens, montant, t, contexte = {}) {
    const m = sens === 'credit' ? await crediter(pf, montant, t) : await debiter(pf, montant, t);
    const L = livre();
    await L.mouvementExterne(pf, sens, m, { type: 'ajustement', ...contexte }, t, L.COMPTES.SYS_AJUSTEMENT);
    return m;
}

module.exports = {
    ErreurFonds,
    arrondir,
    reserve,
    disponible,
    etat,
    exigerDisponible,
    debiter,
    crediter,
    reserver,
    liberer,
    debiterReserve,
    transferer,
    transfererDepuisReserve,
    entree,
    sortie,
    ajuster
};

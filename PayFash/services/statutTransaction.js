'use strict';

// =====================================================================
//  Statuts d'une ecriture du grand livre (section 31).
//
//  La colonne etait du texte libre, et chaque endroit ecrivait le sien :
//  « Succes », « En confirmation », « Annulee », « remboursee » — avec
//  leurs accents, donc impossibles a comparer sans se tromper, et sans
//  qu'aucun etat d'echec n'existe. Les six etats sont fixes :
//
//    PENDING     ecrite, l'argent n'est pas encore confirme
//    PROCESSING  prise en charge par le fournisseur, en cours
//    SUCCESS     confirmee : l'argent a bouge
//    FAILED      echouee : l'argent n'a pas bouge
//    REVERSED    annulee APRES coup : un mouvement inverse l'a compensee
//    CANCELLED   abandonnee AVANT d'aboutir
//
//  La difference entre REVERSED et CANCELLED est comptable : la premiere
//  laisse deux ecritures (l'originale et son contraire), la seconde n'en
//  laisse qu'une, sans effet.
// =====================================================================

const STATUTS = Object.freeze({
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    REVERSED: 'REVERSED',
    CANCELLED: 'CANCELLED'
});

const TOUS = Object.values(STATUTS);

// Ce que les anciennes ecritures portent. Sert a la migration, et aux
// donnees qui arriveraient encore d'un client non mis a jour.
const ANCIENS = Object.freeze({
    'Succès': STATUTS.SUCCESS,
    'Succes': STATUTS.SUCCESS,
    'succès': STATUTS.SUCCESS,
    'succes': STATUTS.SUCCESS,
    'En confirmation': STATUTS.PENDING,
    'en confirmation': STATUTS.PENDING,
    'En attente': STATUTS.PENDING,
    'en attente': STATUTS.PENDING,
    'Annulée': STATUTS.CANCELLED,
    'Annulee': STATUTS.CANCELLED,
    'annulée': STATUTS.CANCELLED,
    'annulee': STATUTS.CANCELLED,
    'remboursée': STATUTS.REVERSED,
    'remboursee': STATUTS.REVERSED,
    'Remboursée': STATUTS.REVERSED,
    'A verifier': STATUTS.PROCESSING,
    'A_VERIFIER': STATUTS.PROCESSING,
    'Échec': STATUTS.FAILED,
    'Echec': STATUTS.FAILED,
    'échec': STATUTS.FAILED,
    'echec': STATUTS.FAILED
});

// Statuts du fournisseur de paiement -> statut de l'ecriture interne.
// C'est la table de reconciliation : un paiement externe et son ecriture
// ne doivent jamais raconter deux histoires differentes.
const DEPUIS_FOURNISSEUR = Object.freeze({
    CREATED: STATUTS.PENDING,
    PENDING: STATUTS.PENDING,
    PROCESSING: STATUTS.PROCESSING,
    INPROGRESS: STATUTS.PROCESSING,
    SUCCESSFUL: STATUTS.SUCCESS,
    FAILED: STATUTS.FAILED,
    EXPIRED: STATUTS.FAILED,
    REFUNDED: STATUTS.REVERSED
});

// Ce qui peut suivre quoi. Une ecriture confirmee ne redevient pas « en
// attente » : elle ne peut etre que compensee.
const TRANSITIONS = Object.freeze({
    [STATUTS.PENDING]: [STATUTS.PROCESSING, STATUTS.SUCCESS, STATUTS.FAILED, STATUTS.CANCELLED],
    [STATUTS.PROCESSING]: [STATUTS.SUCCESS, STATUTS.FAILED, STATUTS.CANCELLED],
    [STATUTS.SUCCESS]: [STATUTS.REVERSED],
    [STATUTS.FAILED]: [],
    [STATUTS.REVERSED]: [],
    [STATUTS.CANCELLED]: []
});

const LIBELLES = Object.freeze({
    [STATUTS.PENDING]: 'En attente',
    [STATUTS.PROCESSING]: 'En cours',
    [STATUTS.SUCCESS]: 'Reussie',
    [STATUTS.FAILED]: 'Echouee',
    [STATUTS.REVERSED]: 'Remboursee',
    [STATUTS.CANCELLED]: 'Annulee'
});

/** Forme canonique d'un statut, ancien ou nouveau. null si inconnu. */
function normaliser(valeur) {
    if (valeur === null || valeur === undefined) return null;
    const v = String(valeur).trim();
    if (TOUS.includes(v)) return v;
    if (TOUS.includes(v.toUpperCase())) return v.toUpperCase();
    return ANCIENS[v] || ANCIENS[v.toLowerCase()] || null;
}

/** Statut interne correspondant a celui du fournisseur de paiement. */
function depuisFournisseur(statut) {
    if (!statut) return null;
    return DEPUIS_FOURNISSEUR[String(statut).trim().toUpperCase()] || null;
}

const estFinal = (statut) => (TRANSITIONS[normaliser(statut)] || []).length === 0;

const peutPasser = (avant, apres) => {
    const a = normaliser(avant);
    const b = normaliser(apres);
    return !!a && !!b && (TRANSITIONS[a] || []).includes(b);
};

/**
 * Change le statut d'une ecriture, en refusant les passages impossibles.
 * `champs` permet d'ecrire la description ou la date au meme moment.
 */
async function changer(ecriture, nouveau, { transaction, ...champs } = {}) {
    // Chargee ici et non en tete : commun.js ecrit des statuts, il
    // importe donc ce module — les deux s'attendraient l'un l'autre.
    const { ErreurTontine } = require('./tontine/commun');
    const avant = normaliser(ecriture.statut);
    const apres = normaliser(nouveau);
    if (!apres) throw new ErreurTontine(400, `Statut d'ecriture inconnu : ${nouveau}`);
    if (avant === apres) return ecriture;
    if (!peutPasser(avant, apres)) {
        throw new ErreurTontine(409,
            `Une ecriture ${LIBELLES[avant] || avant} ne peut pas devenir ${LIBELLES[apres] || apres}`);
    }
    await ecriture.update({ statut: apres, ...champs }, transaction ? { transaction } : undefined);
    return ecriture;
}

module.exports = {
    STATUTS, TOUS, TRANSITIONS, LIBELLES, ANCIENS, DEPUIS_FOURNISSEUR,
    normaliser, depuisFournisseur, estFinal, peutPasser, changer
};

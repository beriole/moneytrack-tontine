'use strict';

const { ErreurTontine, exigerRole } = require('./commun');

// =====================================================================
//  Qui peut quoi, dans une tontine donnee.
//
//  Les regles d'autorisation existaient deja — exigerRole les applique
//  correctement, et toujours relativement a UN groupe. Mais elles etaient
//  ecrites en toutes lettres sur chaque site d'appel, sous forme de
//  tableaux litteraux : ['president', 'tresorier'] repete huit fois dans
//  six services. Pour savoir qui peut saisir une caution il fallait ouvrir
//  caution.service.js ; pour changer la reponse, retrouver les huit.
//
//  Ce fichier ne change aucune regle. Il les rassemble, leur donne un nom,
//  et devient l'endroit unique ou les faire evoluer :
//
//    - le retrait du tresorier se fera ici, une fois ;
//    - une regle qui deviendrait dependante du reglement du groupe
//      (« seul le president peut infliger une amende, sauf si le reglement
//      l'ouvre au groupe ») trouvera ici sa place naturelle.
//
//  C'est aussi ce qui permet de repondre a la question « que puis-je faire
//  dans cette tontine ? » sans que l'application mobile ait a connaitre le
//  nom des roles — voir resume() plus bas.
// =====================================================================

/** Tout membre actif, quel que soit son role. */
const MEMBRE = [];
/**
 * Le bureau.
 *
 * Il valait ['president', 'tresorier'] : le tresorier encaissait,
 * sanctionnait et decaissait aux cotes du president. Il a ete retire de la
 * conception, et ses attributions reparties en deux :
 *
 *   - ce qui demandait une decision — infliger ou annuler une amende,
 *     rediger le reglement, consulter les cautions —
 *     revient au president, seul ici ;
 *   - ce qui n'etait qu'une execution — encaisser une cotisation confirmee,
 *     saisir une caution sur un impaye, decaisser un credit deja approuve
 *     par un vote, depouiller un scrutin echu — revient a MoneyTrack, qui
 *     le fait sans attendre qu'une personne clique. (Le credit et la
 *     cloture d'exercice ont disparu depuis, avec la caisse d'epargne.)
 *
 * Aucun acte n'etait RESERVE au tresorier : il figurait toujours a cote du
 * president. Son retrait n'enleve donc aucune capacite au groupe.
 *
 * BUREAU reste une constante distincte de PRESIDENT : les deux listes sont
 * aujourd'hui identiques, mais elles ne disent pas la meme chose. Un
 * reglement qui ouvrirait la saisie de caution a un second signataire
 * n'aurait qu'a etoffer celle-ci.
 */
const BUREAU = ['president'];
/** Le president seul. */
const PRESIDENT = ['president'];

/**
 * Statuts d'adhesion qui autorisent a AGIR dans le groupe.
 *
 * L'appartenance seule ne suffit pas : exigerRole se contentait de trouver
 * une ligne d'adhesion, si bien qu'un membre exclu ou sorti continuait de
 * passer. Les services le rattrapaient au coup par coup — trois d'entre eux
 * testaient le statut, les autres non.
 */
const ACTIF = ['actif'];

/**
 * Statuts qui autorisent a CONSULTER.
 *
 * Un membre parti garde acces a son historique : ce qui s'est passe pendant
 * qu'il etait la le concerne encore, et c'est de la que part un litige.
 */
const TOUS = ['invite', 'actif', 'suspendu', 'exclu', 'sorti', 'termine'];

/**
 * Statuts qui autorisent a SOLDER UNE DETTE.
 *
 * Payer ce qu'on doit ne se refuse jamais. Fermer cette porte a un membre
 * suspendu ou exclu le maintiendrait debiteur sans moyen de s'acquitter,
 * et bloquerait du meme coup la restitution de sa caution.
 */
const DEBITEUR = ['invite', 'actif', 'suspendu', 'exclu', 'sorti', 'termine'];

/**
 * Les actes du module tontine.
 *
 * `roles`   : les roles qui l'autorisent. Un tableau vide signifie « tout
 *             membre » — pas « tout le monde » : exigerRole refuse d'abord
 *             quiconque n'appartient pas au groupe.
 * `statuts` : les statuts d'adhesion qui l'autorisent.
 * `libelle` : la formulation qui apparait dans le 403, a la premiere
 *             personne du groupe interesse.
 * `expose`  : l'acte figure dans la reponse de GET .../permissions. Les
 *             actes de simple consultation en sont exclus : ils n'ouvrent
 *             ni ne ferment aucun bouton.
 */
const ACTES = {
    // --- Ce que fait tout membre ---------------------------------------
    cotiser:            { roles: MEMBRE, statuts: ACTIF,    libelle: 'cotiser',                          expose: true },
    bloquerCaution:     { roles: MEMBRE, statuts: ACTIF,    libelle: 'bloquer une caution',              expose: true },
    payerAmende:        { roles: MEMBRE, statuts: DEBITEUR,    libelle: 'payer une amende',                 expose: true },
    encherir:           { roles: MEMBRE, statuts: ACTIF,    libelle: 'encherir sur le pot',              expose: true },
    proposerEchange:    { roles: MEMBRE, statuts: ACTIF,    libelle: 'proposer un echange de tour',      expose: true },
    creerVote:          { roles: MEMBRE, statuts: ACTIF,    libelle: 'ouvrir un scrutin',                expose: true },
    repondreVote:       { roles: MEMBRE, statuts: ACTIF,    libelle: 'prendre part a un scrutin',        expose: true },
    signerReglement:    { roles: MEMBRE, statuts: ACTIF,    libelle: 'signer le reglement',              expose: true },
    affecterGarantie:   { roles: MEMBRE, statuts: ACTIF,    libelle: 'affecter une garantie',            expose: true },
    consulter:          { roles: MEMBRE, statuts: TOUS,    libelle: 'consulter ce groupe',              expose: false },

    // --- Ce que fait le bureau -----------------------------------------
    infligerAmende:     { roles: BUREAU, statuts: ACTIF,    libelle: 'infliger une amende',              expose: true },
    annulerAmende:      { roles: BUREAU, statuts: ACTIF,    libelle: 'annuler une amende',               expose: true },
    saisirCaution:      { roles: BUREAU, statuts: ACTIF,    libelle: 'saisir une caution',               expose: true },
    consulterCautions:  { roles: BUREAU, statuts: ACTIF,    libelle: 'consulter les cautions du groupe', expose: true },
    consulterGaranties: { roles: BUREAU, statuts: ACTIF,    libelle: 'consulter les garanties du groupe', expose: true },
    genererReglement:   { roles: BUREAU, statuts: ACTIF,    libelle: 'rediger le reglement interieur',   expose: true },
    verserPot:          { roles: BUREAU, statuts: ACTIF,    libelle: 'declencher le versement du pot',   expose: true },
    depouillerVote:     { roles: BUREAU, statuts: ACTIF,    libelle: 'depouiller un scrutin',            expose: true },

    // --- Ce que fait le president seul ---------------------------------
    demarrerTontine:    { roles: PRESIDENT, statuts: ACTIF, libelle: 'demarrer la tontine',              expose: true },
    exclureMembre:      { roles: PRESIDENT, statuts: ACTIF, libelle: 'exclure un membre',                expose: true },
    ouvrirEnchere:      { roles: PRESIDENT, statuts: ACTIF, libelle: 'ouvrir une enchere',               expose: true },
    adjugerEnchere:     { roles: PRESIDENT, statuts: ACTIF, libelle: 'adjuger une enchere',              expose: true },
    libererCaution:     { roles: PRESIDENT, statuts: ACTIF, libelle: 'liberer une caution',              expose: true },
    transmettrePresidence: { roles: PRESIDENT, statuts: ACTIF, libelle: 'transmettre la presidence',     expose: true }
};

/**
 * L'acte de reference pour « etre president ».
 *
 * Il en faut un, et un seul : poser la question via demarrerTontine
 * repondait juste mais expliquait mal — un refus de passation annoncait
 * « Reserve a : president — demarrer la tontine ».
 */
const ACTE_PRESIDENCE = 'transmettrePresidence';

/** Ce qu'on repond a qui n'est plus en mesure d'agir. */
const LIBELLE_STATUT = {
    invite: "Votre adhesion n'est pas encore confirmee",
    suspendu: 'Votre adhesion a ce groupe est suspendue',
    exclu: 'Vous avez ete exclu de ce groupe',
    sorti: 'Vous avez quitte ce groupe',
    termine: 'Cette tontine est achevee'
};

/** Definition d'un acte, ou erreur de programmation si le nom est inconnu. */
function definition(acte) {
    const def = ACTES[acte];
    if (!def) throw new Error(`Acte de tontine inconnu : « ${acte} »`);
    return def;
}

/**
 * Autorise un acte, ou leve un 403 nomme.
 *
 * Remplace l'appel direct a exigerRole sur les sites d'autorisation : le
 * site declare CE QU'IL FAIT, plus qui a le droit de le faire.
 *
 *   await exigerActe('saisirCaution', groupeId, clientId, t);
 *
 * Renvoie l'adhesion, comme exigerRole : plusieurs appelants s'en servent
 * ensuite (membre.id, membre.ordreBeneficiaire).
 */
async function exigerActe(acte, groupeId, clientId, t = null) {
    const def = definition(acte);
    const membre = await exigerRole(groupeId, clientId, def.roles, t, def.libelle);

    // Le role dit ce qu'on a le droit de faire, le statut si on est encore
    // en mesure de le faire. Un membre exclu gardait sa ligne d'adhesion et
    // passait donc tous les controles de role : trois services le
    // rattrapaient a la main, les autres non.
    if (!def.statuts.includes(membre.statut)) {
        throw new ErreurTontine(403, LIBELLE_STATUT[membre.statut] || `Votre statut est « ${membre.statut} »`);
    }
    return membre;
}

/**
 * Meme chose, sans exception : repond simplement oui ou non.
 *
 * Utile pour composer un etat d'interface, jamais pour proteger un acte —
 * la protection reste exigerActe, dans la transaction SQL.
 */
async function peut(acte, groupeId, clientId, t = null) {
    try {
        await exigerActe(acte, groupeId, clientId, t);
        return true;
    } catch (e) {
        if (e instanceof ErreurTontine && e.code === 403) return false;
        throw e;
    }
}

/** Le client appartient-il a ce groupe ? */
async function estMembre(groupeId, clientId, t = null) {
    return peut('consulter', groupeId, clientId, t);
}

/**
 * Le client preside-t-il CE groupe ?
 *
 * La question n'a de sens que rapportee a un groupe : le meme client peut
 * presider l'un et n'etre que membre de l'autre.
 */
async function estPresident(groupeId, clientId, t = null) {
    return peut(ACTE_PRESIDENCE, groupeId, clientId, t);
}

/**
 * Ce que l'appelant peut faire dans ce groupe.
 *
 * Sert GET /tontine/groupes/:id/permissions. L'application mobile deduisait
 * ses boutons d'une comparaison sur le nom du role — ['president',
 * 'tresorier'] recopie dans quatre ecrans. Elle lira desormais cette
 * reponse, et cessera de connaitre les roles : le jour ou le bureau change,
 * l'application n'a pas a etre republiee pour suivre.
 *
 * Ce n'est evidemment pas une securite. Le backend refuse l'acte de toute
 * facon ; ceci evite seulement de proposer ce qui sera refuse.
 */
function pourAdhesion(membre) {
    // Exactement la regle qu'exigerActe applique : l'interface ne doit
    // jamais annoncer un droit que le serveur refusera, ni l'inverse.
    const autorise = (def) =>
        (!def.roles.length || def.roles.includes(membre.role))
        && def.statuts.includes(membre.statut);

    const actes = {};
    for (const [nom, def] of Object.entries(ACTES)) {
        if (def.expose) actes[nom] = autorise(def);
    }

    return {
        groupeId: membre.groupeId,
        role: membre.role,
        statut: membre.statut,
        estPresident: autorise(ACTES[ACTE_PRESIDENCE]),
        actes
    };
}

async function resume(groupeId, clientId) {
    // Une seule lecture de l'adhesion : exigerRole la relirait a chaque
    // acte, soit vingt-cinq requetes pour afficher un ecran.
    const { TontineMembre } = require('../../models');

    const membre = await TontineMembre.findOne({ where: { groupeId, clientId } });
    if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");

    return pourAdhesion(membre);
}

module.exports = {
    ACTES,
    pourAdhesion,
    exigerActe,
    peut,
    estMembre,
    estPresident,
    resume
};

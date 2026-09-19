const GroupeService = require('../../services/tontine/groupe.service');
const Permissions = require('../../services/tontine/permissions');
const PresidenceService = require('../../services/tontine/presidence.service');

// Controllers minces : ils authentifient, delegent, et traduisent l'erreur.
// Toute la logique metier vit dans services/tontine/.
function repondreErreur(res, erreur) {
    if (erreur && (erreur.name === 'ErreurTontine' || erreur.name === 'ErreurFonds')) {
        return res.status(erreur.code).json({ error: erreur.message });
    }
    console.error('[tontine] ', erreur);
    return res.status(500).json({ error: erreur.message || 'Erreur interne' });
}

// POST /tontine/groupes
const creer = async (req, res) => {
    try {
        const groupe = await GroupeService.creerGroupe(req.user.id, req.body);
        return res.status(201).json({
            message: `Tontine "${groupe.nom}" creee. Partagez le code ${groupe.codeInvitation} pour recruter vos membres.`,
            groupe
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/mes-groupes
const mesGroupes = async (req, res) => {
    try {
        return res.status(200).json({ groupes: await GroupeService.mesGroupes(req.user.id) });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId
const details = async (req, res) => {
    try {
        return res.status(200).json(await GroupeService.detailsGroupe(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/permissions
//
// Ce que l'appelant peut faire ICI. L'application deduisait ses boutons du
// nom du role, recopie dans quatre ecrans ; elle lit maintenant cette
// reponse et n'a plus a connaitre la composition du bureau.
const permissions = async (req, res) => {
    try {
        return res.status(200).json(await Permissions.resume(req.params.groupeId, req.user.id));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/presidence
const etatPresidence = async (req, res) => {
    try {
        return res.status(200).json(await PresidenceService.etat(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/:groupeId/presidence
//
// Transmettre, et non « changer un role » : l'ancien president redevient
// membre dans la meme ecriture. Le groupe n'est jamais sans president.
const transmettrePresidence = async (req, res) => {
    try {
        const r = await PresidenceService.transferer(
            { clientId: req.user.id }, req.params.groupeId, req.body.clientId, req.body.motif);
        return res.status(200).json({
            message: `La presidence de « ${r.groupe.nom} » est transmise.`,
            sortantClientId: r.sortantClientId,
            entrantClientId: r.entrantClientId
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/:groupeId/quitter
//
// Un depart volontaire n'est pas une exclusion : la seule sortie possible
// etait la sanction, motif a l'appui.
const quitter = async (req, res) => {
    try {
        const r = await GroupeService.quitterGroupe(req.user.id, req.params.groupeId);
        const rendus = [];
        if (r.cautionRestituee > 0) rendus.push(`votre caution de ${r.cautionRestituee} FCFA vous est restituee`);
        if (r.garantiesLiberees > 0) rendus.push(`${r.garantiesLiberees} FCFA de garanties redeviennent disponibles`);
        return res.status(200).json({
            message: `Vous avez quitte « ${r.groupe.nom} ».` + (rendus.length ? ` ${rendus.join(' ; ')}.` : ''),
            cautionRestituee: r.cautionRestituee,
            garantiesLiberees: r.garantiesLiberees,
            membresRestants: r.membresRestants
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/rejoindre
const rejoindre = async (req, res) => {
    try {
        const { groupe, membre } = await GroupeService.rejoindreGroupe(req.user.id, req.body.codeInvitation);
        return res.status(201).json({ message: `Vous avez rejoint "${groupe.nom}".`, groupe, membre });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/groupes/:groupeId/demarrer
const demarrer = async (req, res) => {
    try {
        const r = await GroupeService.demarrerGroupe(req.user.id, req.params.groupeId);
        return res.status(200).json({
            message: `La tontine demarre. Cycle ${r.cycle.numeroCycle} ouvert.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

module.exports = {
    creer, mesGroupes, details, rejoindre, demarrer,
    permissions, etatPresidence, transmettrePresidence, quitter, repondreErreur
};

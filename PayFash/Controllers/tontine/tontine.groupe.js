const GroupeService = require('../../services/tontine/groupe.service');

// Controllers minces : ils authentifient, delegent, et traduisent l'erreur.
// Toute la logique metier vit dans services/tontine/.
function repondreErreur(res, erreur) {
    if (erreur && erreur.name === 'ErreurTontine') {
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

module.exports = { creer, mesGroupes, details, rejoindre, demarrer, repondreErreur };

const { VoteService } = require('../../services/tontine/vote.service');
const EchangeService = require('../../services/tontine/echange.service');
const EnchereService = require('../../services/tontine/enchere.service');
const ContratService = require('../../services/tontine/contrat.service');
const { repondreErreur } = require('./tontine.groupe');

// =====================================================================
//  Gouvernance — votes, marche des tours, encheres, reglement interieur.
// =====================================================================

// --- Votes -----------------------------------------------------------

// POST /tontine/groupes/:groupeId/votes
const creerVote = async (req, res) => {
    try {
        const vote = await VoteService.creer(req.user.id, req.params.groupeId, req.body);
        return res.status(201).json({
            message: `Scrutin ouvert (${vote.sujet}, ${vote.mode}). Cloture le ${new Date(vote.dateLimite).toLocaleString('fr-FR')}.`,
            vote
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/votes
const votesGroupe = async (req, res) => {
    try {
        return res.status(200).json(await VoteService.votesGroupe(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/votes/:voteId
const detailVote = async (req, res) => {
    try {
        return res.status(200).json(await VoteService.detail(req.user.id, req.params.voteId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/votes/:voteId/repondre
const repondreVote = async (req, res) => {
    try {
        const r = await VoteService.repondre(req.user.id, req.params.voteId, req.body.choix, req.body.commentaire);
        return res.status(201).json({
            message: r.depouillementPossible
                ? 'Voix enregistree. Tous les electeurs se sont exprimes : le scrutin peut etre depouille.'
                : 'Voix enregistree.',
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/votes/:voteId/depouiller
const depouillerVote = async (req, res) => {
    try {
        const r = await VoteService.depouiller({ clientId: req.user.id }, req.params.voteId);
        return res.status(200).json({
            message: `Scrutin ${r.resultat} (${r.pour} pour / ${r.contre} contre / ${r.abstentions} abstention(s) sur ${r.electeurs} electeur(s)). ${r.effet.detail}`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// --- Marche des tours ------------------------------------------------

// POST /tontine/groupes/:groupeId/echanges
const proposerEchange = async (req, res) => {
    try {
        const echange = await EchangeService.proposer(
            req.user.id, req.params.groupeId, req.body.destinataireId, req.body.montantCompensation);
        return res.status(201).json({
            message: echange.montantCompensation > 0
                ? `Echange propose : votre tour ${echange.tourDemandeur} contre le tour ${echange.tourDestinataire}, avec ${echange.montantCompensation} FCFA de compensation.`
                : `Echange propose : votre tour ${echange.tourDemandeur} contre le tour ${echange.tourDestinataire}.`,
            echange
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/echanges/mes-echanges
const mesEchanges = async (req, res) => {
    try {
        return res.status(200).json(await EchangeService.mesEchanges(req.user.id));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/echanges
const echangesGroupe = async (req, res) => {
    try {
        return res.status(200).json({ echanges: await EchangeService.echangesGroupe(req.user.id, req.params.groupeId) });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/echanges/:echangeId/accepter
const accepterEchange = async (req, res) => {
    try {
        const r = await EchangeService.accepter(req.user.id, req.params.echangeId);
        return res.status(200).json({
            message: `Echange accepte. Vous passez au tour ${r.nouveauTourDestinataire}.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/echanges/:echangeId/refuser
const refuserEchange = async (req, res) => {
    try {
        return res.status(200).json({ message: 'Echange refuse.', echange: await EchangeService.refuser(req.user.id, req.params.echangeId) });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/echanges/:echangeId/annuler
const annulerEchange = async (req, res) => {
    try {
        return res.status(200).json({ message: 'Demande annulee.', echange: await EchangeService.annuler(req.user.id, req.params.echangeId) });
    } catch (e) { return repondreErreur(res, e); }
};

// --- Encheres --------------------------------------------------------

// POST /tontine/cycles/:cycleId/enchere/ouvrir
const ouvrirEnchere = async (req, res) => {
    try {
        return res.status(200).json(await EnchereService.ouvrir({ clientId: req.user.id }, req.params.cycleId, req.body.dateLimite));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/cycles/:cycleId/enchere/offrir
const offrirEnchere = async (req, res) => {
    try {
        const r = await EnchereService.offrir(req.user.id, req.params.cycleId, req.body.montantDecote);
        return res.status(201).json({
            message: r.remplacee
                ? `Offre mise a jour : vous renoncez a ${r.enchere.montantDecote} FCFA sur le pot.`
                : `Offre deposee : vous renoncez a ${r.enchere.montantDecote} FCFA sur le pot.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/cycles/:cycleId/enchere
const offresEnchere = async (req, res) => {
    try {
        return res.status(200).json(await EnchereService.offres(req.user.id, req.params.cycleId));
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/encheres/:enchereId/retirer
const retirerEnchere = async (req, res) => {
    try {
        return res.status(200).json({ message: 'Offre retiree.', enchere: await EnchereService.retirer(req.user.id, req.params.enchereId) });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/cycles/:cycleId/enchere/adjuger
const adjugerEnchere = async (req, res) => {
    try {
        const r = await EnchereService.adjuger({ clientId: req.user.id }, req.params.cycleId);
        return res.status(200).json({
            message: `Pot adjuge. Le gagnant renonce a ${r.decote} FCFA, redistribues aux cotisants au versement.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// --- Reglement interieur ---------------------------------------------

// POST /tontine/groupes/:groupeId/reglement
const genererReglement = async (req, res) => {
    try {
        const r = await ContratService.generer({ clientId: req.user.id }, req.params.groupeId, req.body.contenu);
        return res.status(201).json({
            message: `Reglement version ${r.contrat.version} ${r.remplace ? 'remplace' : 'genere'}. Il doit maintenant etre signe par tous les membres actifs.`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/reglement
const reglementCourant = async (req, res) => {
    try {
        return res.status(200).json(await ContratService.courant(req.user.id, req.params.groupeId));
    } catch (e) { return repondreErreur(res, e); }
};

// GET /tontine/groupes/:groupeId/reglement/versions
const versionsReglement = async (req, res) => {
    try {
        return res.status(200).json({ versions: await ContratService.versions(req.user.id, req.params.groupeId) });
    } catch (e) { return repondreErreur(res, e); }
};

// POST /tontine/reglements/:contratId/signer
const signerReglement = async (req, res) => {
    try {
        const r = await ContratService.signer(req.user.id, req.params.contratId, req.ip);
        return res.status(201).json({
            message: r.complet
                ? 'Signature enregistree. Le reglement est desormais signe par tous les membres.'
                : `Signature enregistree (${r.signatures}/${r.actifs}).`,
            ...r
        });
    } catch (e) { return repondreErreur(res, e); }
};

module.exports = {
    creerVote, votesGroupe, detailVote, repondreVote, depouillerVote,
    proposerEchange, mesEchanges, echangesGroupe, accepterEchange, refuserEchange, annulerEchange,
    ouvrirEnchere, offrirEnchere, offresEnchere, retirerEnchere, adjugerEnchere,
    genererReglement, reglementCourant, versionsReglement, signerReglement
};

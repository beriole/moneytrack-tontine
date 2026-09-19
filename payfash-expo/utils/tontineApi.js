// =====================================================================
//  Acces au module tontine du backend.
//
//  Rien de plus qu'une carte des routes : l'instance axios existante
//  porte deja la baseURL et l'injection du token.
//
//  Les erreurs remontent telles quelles ; les ecrans les affichent avec
//  messageErreur(), qui sait lire le { error } renvoye par le backend.
// =====================================================================

import api from './axiosApi';

/** Extrait le message lisible d'une erreur axios. */
export const messageErreur = (e, defaut = 'Une erreur est survenue') => {
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.response?.data?.message) return e.response.data.message;
  if (e?.message === 'Network Error') return "Serveur injoignable. Verifiez l'URL dans utils/config.js.";
  return e?.message || defaut;
};

/** Formatage FCFA homogene dans tout le module. */
export const fcfa = (v) => `${Math.round(Number(v) || 0).toLocaleString('fr-FR')} FCFA`;

export const dateCourte = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
};

// ---------------------------------------------------------------
//  Paiements reels (Fapshi)
// ---------------------------------------------------------------
export const etatPaiement = () => api.get('/paiement/etat');
export const initierRecharge = (corps) => api.post('/paiement/recharge', corps);
export const initierRetrait = (corps) => api.post('/paiement/retrait', corps);
// A appeler apres le retour de la page de paiement : c'est ce qui credite
// vraiment le portefeuille quand Fapshi ne peut pas joindre le serveur.
export const verifierPaiement = (reference) => api.get(`/paiement/${reference}/verifier`);
export const mesPaiements = () => api.get('/paiement/mes-paiements');

// ---------------------------------------------------------------
//  Synthese — la tontine vue depuis le reste de l'application
// ---------------------------------------------------------------
export const synthese = () => api.get('/tontine/synthese');
export const soldeReel = () => api.get('/tontine/synthese/solde');
export const tresorerie = (jours = 90) => api.get('/tontine/synthese/tresorerie', { params: { jours } });
export const simulerFinancement = (montant) => api.get('/tontine/synthese/financement', { params: { montant } });

export const etatLiens = (groupeId) => api.get(`/tontine/groupes/${groupeId}/liens`);
export const lierBudget = (groupeId, corps = {}) => api.post(`/tontine/groupes/${groupeId}/lier-budget`, corps);
export const delierBudget = (groupeId) => api.delete(`/tontine/groupes/${groupeId}/lier-budget`);
export const destinationsTour = (groupeId) => api.get(`/tontine/groupes/${groupeId}/destinations`);
export const routerTour = (groupeId, portefeuilleId) =>
  api.put(`/tontine/groupes/${groupeId}/destination-tour`, { portefeuilleId });

export const etatPrelevement = (groupeId) => api.get(`/tontine/groupes/${groupeId}/prelevement`);
export const activerPrelevement = (groupeId, joursAvant) =>
  api.post(`/tontine/groupes/${groupeId}/prelevement`, { joursAvant });
export const desactiverPrelevement = (groupeId) => api.delete(`/tontine/groupes/${groupeId}/prelevement`);

// ---------------------------------------------------------------
//  Caisse 1 — le tour
// ---------------------------------------------------------------
export const mesGroupes = () => api.get('/tontine/groupes/mes-groupes');
export const detailGroupe = (id) => api.get(`/tontine/groupes/${id}`);
export const creerGroupe = (corps) => api.post('/tontine/groupes', corps);
export const rejoindreGroupe = (codeInvitation) => api.post('/tontine/groupes/rejoindre', { codeInvitation });
export const demarrerGroupe = (id) => api.post(`/tontine/groupes/${id}/demarrer`);

// ---------------------------------------------------------------
//  Presidence
//
//  Elle ne se transmettait pas : le role etait attribue a la creation du
//  groupe et n'en bougeait plus. Un president qui part laissait la tontine
//  sans moyen de designer son successeur.
// ---------------------------------------------------------------
export const permissionsGroupe = (groupeId) => api.get(`/tontine/groupes/${groupeId}/permissions`);
export const etatPresidence = (groupeId) => api.get(`/tontine/groupes/${groupeId}/presidence`);
// Quitter un groupe qui n'a pas demarre. La seule sortie possible etait
// l'exclusion : un membre qui changeait d'avis partait avec un motif de
// sanction.
export const quitterGroupe = (groupeId) => api.post(`/tontine/groupes/${groupeId}/quitter`);

// ---------------------------------------------------------------
//  Exposition et garanties
//
//  L'exposition est ce qu'un membre doit encore a sa tontine ; la garantie,
//  une part de son epargne, d'un projet ou de son portefeuille qu'il bloque
//  pour la couvrir. L'argent reste chez lui : seul son disponible baisse.
// ---------------------------------------------------------------
export const monExposition = () => api.get('/tontine/moi/exposition');
export const expositionGroupe = (groupeId) => api.get(`/tontine/groupes/${groupeId}/exposition`);
export const sourcesGarantie = (groupeId) => api.get(`/tontine/groupes/${groupeId}/garanties/sources`);
// Le texte de consentement et son empreinte : a afficher AVANT d'accepter.
export const simulerGarantie = (groupeId, portefeuilleId, montant) =>
  api.get(`/tontine/groupes/${groupeId}/garanties/simulation`, { params: { portefeuilleId, montant } });
// hashTexte : l'empreinte du texte que le membre a lu. Le serveur refuse si
// elle ne correspond pas a ce qu'il appliquerait.
export const affecterGarantie = (groupeId, portefeuilleId, montant, hashTexte) =>
  api.post(`/tontine/groupes/${groupeId}/garanties`, { portefeuilleId, montant, hashTexte });
export const mesGaranties = () => api.get('/tontine/garanties');
export const detailGarantie = (id) => api.get(`/tontine/garanties/${id}`);
export const libererGarantie = (id) => api.post(`/tontine/garanties/${id}/liberer`);
export const garantiesGroupe = (groupeId) => api.get(`/tontine/groupes/${groupeId}/garanties`);
export const transmettrePresidence = (groupeId, clientId, motif) =>
  api.post(`/tontine/groupes/${groupeId}/presidence`, { clientId, motif });

export const cotisationsCycle = (cycleId) => api.get(`/tontine/cycles/${cycleId}/cotisations`);
export const cotiser = (cycleId, montant) => api.post(`/tontine/cycles/${cycleId}/cotiser`, montant ? { montant } : {});
export const verserPot = (cycleId) => api.post(`/tontine/cycles/${cycleId}/verser`);

// ---------------------------------------------------------------
//  Caisse 4 — discipline
// ---------------------------------------------------------------
export const mesAmendes = (groupeId) => api.get('/tontine/amendes/mes-amendes', { params: { groupeId } });
export const amendesGroupe = (groupeId) => api.get(`/tontine/groupes/${groupeId}/amendes`);
export const payerAmende = (amendeId) => api.post(`/tontine/amendes/${amendeId}/payer`);
export const infligerAmende = (groupeId, corps) => api.post(`/tontine/groupes/${groupeId}/amendes`, corps);

export const mesCautions = () => api.get('/tontine/cautions/mes-cautions');
export const bloquerCaution = (groupeId, montant) => api.post(`/tontine/groupes/${groupeId}/caution`, montant ? { montant } : {});
export const cautionsGroupe = (groupeId) => api.get(`/tontine/groupes/${groupeId}/cautions`);

export const etatRecouvrement = (cotisationId) => api.get(`/tontine/cotisations/${cotisationId}/recouvrement`);
export const saisirCaution = (cotisationId) => api.post(`/tontine/cotisations/${cotisationId}/saisir-caution`);

// ---------------------------------------------------------------
//  Gouvernance
// ---------------------------------------------------------------
export const votesGroupe = (groupeId) => api.get(`/tontine/groupes/${groupeId}/votes`);
export const detailVote = (voteId) => api.get(`/tontine/votes/${voteId}`);
export const creerVote = (groupeId, corps) => api.post(`/tontine/groupes/${groupeId}/votes`, corps);
export const repondreVote = (voteId, choix) => api.post(`/tontine/votes/${voteId}/repondre`, { choix });
export const depouillerVote = (voteId) => api.post(`/tontine/votes/${voteId}/depouiller`);

export const echangesGroupe = (groupeId) => api.get(`/tontine/groupes/${groupeId}/echanges`);
export const mesEchanges = () => api.get('/tontine/echanges/mes-echanges');
export const proposerEchange = (groupeId, destinataireId, montantCompensation) =>
  api.post(`/tontine/groupes/${groupeId}/echanges`, { destinataireId, montantCompensation });
export const accepterEchange = (id) => api.post(`/tontine/echanges/${id}/accepter`);
export const refuserEchange = (id) => api.post(`/tontine/echanges/${id}/refuser`);
export const annulerEchange = (id) => api.post(`/tontine/echanges/${id}/annuler`);

// ---------------------------------------------------------------
//  Encheres sur le pot
//
//  Le backend les servait depuis le debut, mais aucun ecran ne les
//  appelait : la creation de tontine proposait pourtant « Enchere » comme
//  mode d'attribution des tours. Le mode existait, la mecanique aussi,
//  et les membres n'avaient aucun moyen d'encherir.
// ---------------------------------------------------------------
export const offresEnchere = (cycleId) => api.get(`/tontine/cycles/${cycleId}/enchere`);
export const ouvrirEnchere = (cycleId, dateLimite) =>
  api.post(`/tontine/cycles/${cycleId}/enchere/ouvrir`, dateLimite ? { dateLimite } : {});
export const offrirEnchere = (cycleId, montantDecote) =>
  api.post(`/tontine/cycles/${cycleId}/enchere/offrir`, { montantDecote });
export const adjugerEnchere = (cycleId) => api.post(`/tontine/cycles/${cycleId}/enchere/adjuger`);
export const retirerEnchere = (enchereId) => api.post(`/tontine/encheres/${enchereId}/retirer`);

export const reglementCourant = (groupeId) => api.get(`/tontine/groupes/${groupeId}/reglement`);
export const genererReglement = (groupeId, contenu) => api.post(`/tontine/groupes/${groupeId}/reglement`, { contenu });
export const signerReglement = (contratId) => api.post(`/tontine/reglements/${contratId}/signer`);


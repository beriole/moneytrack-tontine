const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/client/client.projet.advanced');
const verifyToken = require('../../middleware/verificationtoken');

// ============================================
// Routes Projets Avancés
// ============================================

// Projets avec jalons
route.post('/avance', verifyToken, CONTROLLER.creerProjetAvance);
route.get('/hierarchie', verifyToken, CONTROLLER.getHierarchieProjets);

// Sous-projets
route.post('/:projetParentId/sous-projet', verifyToken, CONTROLLER.creerSousProjet);

// Collaborateurs
route.post('/:projetId/inviter', verifyToken, CONTROLLER.inviterCollaborateurProjet);
route.post('/invitation/:invitationId/repondre', verifyToken, CONTROLLER.repondreInvitationProjet);
route.get('/:projetId/collaborateurs', verifyToken, CONTROLLER.listerCollaborateursProjet);
route.put('/:projetId/collaborateur/:collaboratorId/contribution', verifyToken, CONTROLLER.mettreAJourContribution);

// Jalons (Milestones)
route.post('/:projetId/jalon', verifyToken, CONTROLLER.creerJalon);
route.put('/:projetId/jalon/:jalonId', verifyToken, CONTROLLER.mettreAJourJalon);
route.delete('/:projetId/jalon/:jalonId', verifyToken, CONTROLLER.supprimerJalon);
route.get('/:projetId/timeline', verifyToken, CONTROLLER.getTimelineProjet);

module.exports = route;

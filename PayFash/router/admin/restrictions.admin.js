const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.restrictions');
const { requireRole } = require('../../middleware/verifyAdmin');

// Monte sous verifyAdmin (servers.js). Consulter est ouvert a tout
// administrateur ; poser et lever une restriction relevent de la
// conformite — SUPER_ADMIN passe toujours.
route.get('/types', CONTROLLER.types);
route.get('/client/:clientId', CONTROLLER.situationClient);
route.post('/', requireRole('COMPLIANCE'), CONTROLLER.poser);
route.post('/:id/lever', requireRole('COMPLIANCE'), CONTROLLER.lever);

module.exports = route;

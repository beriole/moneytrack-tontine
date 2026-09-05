const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.validation');
const { requireRole } = require('../../middleware/verifyAdmin');

route.get('/pending', CONTROLLER.listePending);
route.post('/demande', requireRole('ADMIN_FINANCE'), CONTROLLER.creerDemande);
route.post('/:id/approuver', requireRole('ADMIN_FINANCE'), CONTROLLER.approuver);
route.post('/:id/rejeter', requireRole('ADMIN_FINANCE'), CONTROLLER.rejeter);

module.exports = route;

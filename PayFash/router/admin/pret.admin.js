const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.loans');
const { requireRole } = require('../../middleware/verifyAdmin');

route.get('/pret', CONTROLLER.listePrets);
route.get('/pret/:id', CONTROLLER.detailPret);
route.patch('/pret/:id/approuver', requireRole('ADMIN_FINANCE'), CONTROLLER.approuverPret);
route.patch('/pret/:id/rejeter', requireRole('ADMIN_FINANCE'), CONTROLLER.rejeterPret);
route.patch('/pret/:id/defaut', requireRole('ADMIN_FINANCE'), CONTROLLER.marquerDefaut);

module.exports = route;

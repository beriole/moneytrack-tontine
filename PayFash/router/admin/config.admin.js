const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.config');
const { requireRole } = require('../../middleware/verifyAdmin');

route.get('/config', CONTROLLER.listeConfig);
route.patch('/config/:cle', requireRole('SUPER_ADMIN'), CONTROLLER.updateConfig);

module.exports = route;

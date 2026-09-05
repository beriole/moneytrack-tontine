const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.litiges');
const { requireRole } = require('../../middleware/verifyAdmin');

// Monté derrière verifyAdmin (voir servers.js)
route.get('/litige', CONTROLLER.listeLitiges);
route.get('/litige/:id', CONTROLLER.detailsLitige);
route.patch('/litige/:id/resoudre', requireRole('SUPPORT', 'COMPLIANCE'), CONTROLLER.resoudreLitige);

module.exports = route;

const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.aml');
const { requireRole } = require('../../middleware/verifyAdmin');

route.get('/suspectes', requireRole('COMPLIANCE', 'ADMIN_FINANCE'), CONTROLLER.transactionsSuspectes);

module.exports = route;

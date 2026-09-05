const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.dashboard');

// Monté derrière verifyAdmin (voir servers.js)
route.get('/stats', CONTROLLER.stats);
route.get('/charts', CONTROLLER.charts);

module.exports = route;

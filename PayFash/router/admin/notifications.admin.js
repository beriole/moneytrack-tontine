const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.notifications');
const { requireRole } = require('../../middleware/verifyAdmin');

route.get('/notification', CONTROLLER.listeNotifications);
route.post('/campagne', requireRole('MARKETING'), CONTROLLER.envoyerCampagne);

module.exports = route;

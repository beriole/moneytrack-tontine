const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.auth');
const { verifyAdmin, requireRole } = require('../../middleware/verifyAdmin');

// Public
route.post('/login', CONTROLLER.login);

// Protégé
route.get('/me', verifyAdmin, CONTROLLER.me);
route.post('/create', verifyAdmin, requireRole('SUPER_ADMIN'), CONTROLLER.creerAdmin);
route.get('/admins', verifyAdmin, requireRole('SUPER_ADMIN'), CONTROLLER.listeAdmins);

module.exports = route;

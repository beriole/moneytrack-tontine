const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.ledger');

// Monte sous verifyAdmin (servers.js). Le grand livre se consulte : on ne
// le corrige pas, on ecrit un mouvement inverse — par le maker-checker.
route.get('/etat', CONTROLLER.etat);
route.get('/compte/:portefeuilleId', CONTROLLER.releve);
route.get('/', CONTROLLER.journal);

module.exports = route;

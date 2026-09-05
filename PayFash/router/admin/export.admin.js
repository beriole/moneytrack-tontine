const express = require('express');
const route = express.Router();
const CONTROLLER = require('../../Controllers/admin/admin.export');

route.get('/transactions.xlsx', CONTROLLER.exportTransactions);

module.exports = route;

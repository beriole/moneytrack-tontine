const Sequelize = require('sequelize');
const { DATABASE, DBUSER, DBHOST, DIALECT, DBPASSWORD, DBPORT } = require('./index');

// =====================================================================
//  Connexion Sequelize.
//
//  Ce module ne se connecte PLUS au chargement. Il appelait connexion()
//  au niveau du module : importer un modele — donc un routeur, donc un
//  script — ouvrait une connexion et maintenait le processus en vie. Un
//  simple `node -e "require('./router/...')"` ne rendait jamais la main,
//  et l'echec n'etait qu'un console.log : la suite partait en erreurs SQL
//  incomprehensibles plutot que de s'arreter net.
//
//  C'est desormais servers.js qui etablit et verifie la connexion, une
//  fois, au demarrage.
// =====================================================================
const db = new Sequelize(DATABASE, DBUSER, DBPASSWORD, {
    host: DBHOST,
    port: DBPORT,
    dialect: DIALECT,
    logging: false
});

module.exports = db;
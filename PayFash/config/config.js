// Configuration destinee a sequelize-cli uniquement.
// L'application, elle, continue de passer par config/bd.js.
// Les deux lisent la meme source : config/index.js (donc le .env).
const ENV = require('./index');

const base = {
    database: ENV.DATABASE,
    username: ENV.DBUSER,
    password: ENV.DBPASSWORD,
    host: ENV.HOSTNAME,
    port: ENV.DBPORT,
    dialect: ENV.DIALECT || 'mysql',
    logging: console.log
};

module.exports = {
    development: base,
    test: base,
    production: { ...base, logging: false }
};

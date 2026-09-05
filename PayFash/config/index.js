const dotenv = require('dotenv');
// override:true => les valeurs du .env priment sur les variables d'environnement
// systeme (ex: HOSTNAME, defini par Windows comme le nom de la machine).
dotenv.config({ override: true });

const ENV = {
    DATABASE: process.env.DATABASE,
    HOSTNAME: process.env.HOSTNAME,
    DBUSER: process.env.DBUSER,
    DBPASSWORD: process.env.DBPASSWORD,
    PORT: process.env.PORT,
    DIALECT: process.env.DIALECT,
    TOCKEN: process.env.TOCKEN,
    DBPORT: process.env.DBPORT,
    PASSEMAIL: process.env.PASS_EMAIL, // inchangé
    EMAIL: process.env.EMAIL,

    // nouvelles variables ajoutées
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    EMAIL_SENDER_NAME: process.env.EMAIL_SENDER_NAME,
    COMPANY_NAME: process.env.COMPANY_NAME,
    COMPANY_ADDRESS: process.env.COMPANY_ADDRESS,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,

    // ---- Module tontine (caisses 1, 2 et 4) ----
    // Surchargeables dans le .env ; les defauts permettent de demarrer sans
    // toucher au fichier d'environnement.

    // Part prelevee par la plateforme sur chaque versement de pot (1 %)
    TONTINE_FRAIS_PLATEFORME: parseFloat(process.env.TONTINE_FRAIS_PLATEFORME || '0.01'),

    // Caution par defaut a l'entree d'un groupe, en % du montant par periode
    TONTINE_CAUTION_DEFAUT: parseFloat(process.env.TONTINE_CAUTION_DEFAUT || '10'),

    // Client systeme qui encaisse les frais. Sans lui, les frais n'ont pas de
    // destinataire — c'est le piege n.6 releve dans NjanguiPay.
    TONTINE_CLIENT_PLATEFORME_ID: process.env.TONTINE_CLIENT_PLATEFORME_ID
        ? parseInt(process.env.TONTINE_CLIENT_PLATEFORME_ID, 10)
        : null,

    // Taux d'interet mensuel par defaut de la caisse de credit, en %
    TONTINE_TAUX_CREDIT_DEFAUT: parseFloat(process.env.TONTINE_TAUX_CREDIT_DEFAUT || '5'),

    // ---- Fapshi (agregateur de paiement camerounais) ----
    // Le mode decide quelles cles sont lues : on ne melange jamais des
    // identifiants sandbox avec une URL de production.
    FAPSHI_MODE: (process.env.FAPSHI_MODE || 'sandbox').toLowerCase(),
    FAPSHI_BASE_URL: (process.env.FAPSHI_MODE || 'sandbox').toLowerCase() === 'live'
        ? (process.env.FAPSHI_BASE_URL_LIVE || 'https://live.fapshi.com')
        : (process.env.FAPSHI_BASE_URL_SANDBOX || 'https://sandbox.fapshi.com'),
    FAPSHI_API_USER: (process.env.FAPSHI_MODE || 'sandbox').toLowerCase() === 'live'
        ? process.env.FAPSHI_API_USER_LIVE
        : process.env.FAPSHI_API_USER_SANDBOX,
    FAPSHI_API_KEY: (process.env.FAPSHI_MODE || 'sandbox').toLowerCase() === 'live'
        ? process.env.FAPSHI_API_KEY_LIVE
        : process.env.FAPSHI_API_KEY_SANDBOX,

    // URL publique du serveur, pour que Fapshi puisse rappeler le webhook.
    // En developpement sur un reseau local, Fapshi ne peut pas joindre la
    // machine : l'application interroge alors /paiement/:reference/verifier.
    APP_URL: process.env.APP_URL || null,

    // Montant minimal impose par Fapshi.
    PAIEMENT_MONTANT_MIN: parseInt(process.env.PAIEMENT_MONTANT_MIN || '100', 10)
}

module.exports = ENV;

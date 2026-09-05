'use strict';

const ENV = require('../../config/index');

// =====================================================================
//  Client HTTP de l'agregateur Fapshi.
//
//  Cette couche ne connait rien du metier : elle parle a Fapshi, traduit
//  ses reponses, et s'arrete la. Toute la logique d'argent vit dans
//  paiement.service.js.
//
//  Deux choses a savoir sur Fapshi :
//
//   1. l'authentification passe par deux en-tetes, apiuser et apikey ;
//   2. les webhooks ne sont PAS signes. On ne peut donc jamais croire le
//      corps recu : la verite s'obtient uniquement en rappelant
//      /payment-status. C'est la regle qui gouverne toute l'integration.
//
//  Aucune dependance ajoutee : Node 20 fournit fetch nativement.
// =====================================================================

const STATUTS = ['CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED'];

class ErreurFapshi extends Error {
    constructor(code, message, corps) {
        super(message);
        this.code = code;
        this.name = 'ErreurFapshi';
        this.corps = corps;
    }
}

class FapshiService {

    static configure() {
        return !!(ENV.FAPSHI_API_USER && ENV.FAPSHI_API_KEY && ENV.FAPSHI_BASE_URL);
    }

    static get mode() { return ENV.FAPSHI_MODE; }

    static _entetes() {
        if (!this.configure()) {
            throw new ErreurFapshi(503, "Fapshi n'est pas configure : renseignez FAPSHI_API_USER et FAPSHI_API_KEY");
        }
        return {
            'Content-Type': 'application/json',
            apiuser: ENV.FAPSHI_API_USER,
            apikey: ENV.FAPSHI_API_KEY
        };
    }

    static async _appel(methode, chemin, corps, delaiMs = 30000) {
        const controleur = new AbortController();
        const minuterie = setTimeout(() => controleur.abort(), delaiMs);

        try {
            const reponse = await fetch(`${ENV.FAPSHI_BASE_URL}${chemin}`, {
                method: methode,
                headers: this._entetes(),
                body: corps ? JSON.stringify(corps) : undefined,
                signal: controleur.signal
            });

            const texte = await reponse.text();
            let donnees;
            try { donnees = texte ? JSON.parse(texte) : {}; } catch (e) { donnees = { brut: texte }; }

            if (!reponse.ok) {
                throw new ErreurFapshi(
                    reponse.status,
                    donnees.message || `Fapshi a repondu ${reponse.status}`,
                    donnees
                );
            }
            return donnees;
        } catch (e) {
            if (e.name === 'ErreurFapshi') throw e;
            if (e.name === 'AbortError') {
                throw new ErreurFapshi(504, "Fapshi n'a pas repondu a temps");
            }
            // Panne reseau : ne jamais laisser croire que le paiement a
            // echoue — on ne sait pas. Le statut reste a verifier.
            throw new ErreurFapshi(502, `Fapshi injoignable : ${e.message}`);
        }
    }

    /** Solde du compte marchand. Sert aussi de test de connectivite. */
    static solde() {
        return this._appel('GET', '/balance', null, 15000);
    }

    /**
     * Ouvre une collecte et renvoie un lien de paiement.
     * Fapshi impose un montant entier, superieur ou egal a 100 XAF.
     */
    static async initierCollecte({ montant, email, clientId, reference, message, urlRetour, webhook }) {
        const somme = Math.round(Number(montant));
        if (!(somme >= ENV.PAIEMENT_MONTANT_MIN)) {
            throw new ErreurFapshi(400, `Le montant minimal accepte est de ${ENV.PAIEMENT_MONTANT_MIN} FCFA`);
        }

        const corps = {
            amount: somme,
            email: email || undefined,
            userId: String(clientId),
            externalId: reference,
            message: message || 'Recharge MoneyTrack'
        };
        if (urlRetour) corps.redirectUrl = urlRetour;
        if (webhook) corps.webhook = webhook;

        const r = await this._appel('POST', '/initiate-pay', corps);
        return { lien: r.link, transId: r.transId, dateInitiee: r.dateInitiated };
    }

    /**
     * Debit direct sur un compte Mobile Money ou Orange Money, sans page
     * de paiement : l'utilisateur valide sur son telephone.
     */
    static async debitDirect({ montant, telephone, medium, nom, email, clientId, reference, message }) {
        const somme = Math.round(Number(montant));
        if (!(somme >= ENV.PAIEMENT_MONTANT_MIN)) {
            throw new ErreurFapshi(400, `Le montant minimal accepte est de ${ENV.PAIEMENT_MONTANT_MIN} FCFA`);
        }

        const corps = {
            amount: somme,
            phone: this.normaliserTelephone(telephone),
            medium: medium || 'mobile money',
            name: nom || undefined,
            email: email || undefined,
            userId: String(clientId),
            externalId: reference,
            message: message || 'Recharge MoneyTrack'
        };

        const r = await this._appel('POST', '/direct-pay', corps);
        return { transId: r.transId, dateInitiee: r.dateInitiated };
    }

    /** Versement vers un compte Mobile Money (retrait). */
    static async verser({ montant, telephone, medium, nom, email, clientId, reference }) {
        const somme = Math.round(Number(montant));
        const corps = {
            amount: somme,
            phone: this.normaliserTelephone(telephone),
            medium: medium || 'mobile money',
            name: nom || undefined,
            email: email || undefined,
            userId: String(clientId),
            externalId: reference
        };
        const r = await this._appel('POST', '/payout', corps);
        return { transId: r.transId, dateInitiee: r.dateInitiated };
    }

    /**
     * LA source de verite. Le webhook n'etant pas signe, tout statut doit
     * etre confirme ici avant de toucher a un solde.
     */
    static async statut(transId) {
        const r = await this._appel('GET', `/payment-status/${encodeURIComponent(transId)}`, null, 20000);
        return {
            transId: r.transId,
            statut: r.status,
            reussi: r.status === 'SUCCESSFUL',
            termine: ['SUCCESSFUL', 'FAILED', 'EXPIRED'].includes(r.status),
            montant: Number(r.amount) || 0,
            medium: r.medium || null,
            reference: r.externalId || null,
            clientId: r.userId || null,
            payeur: r.payerName || null,
            financialTransId: r.financialTransId || null,
            dateConfirmee: r.dateConfirmed || null,
            brut: r
        };
    }

    /** Annule une collecte qui n'a pas ete payee. */
    static expirer(transId) {
        return this._appel('POST', '/expire-pay', { transId });
    }

    /**
     * Fapshi attend un numero camerounais a 9 chiffres. On retire
     * l'indicatif s'il est present plutot que de laisser l'API refuser.
     */
    static normaliserTelephone(valeur) {
        const chiffres = String(valeur || '').replace(/\D/g, '');
        if (chiffres.startsWith('237') && chiffres.length > 9) return chiffres.slice(3);
        return chiffres;
    }

    static statutsConnus() { return [...STATUTS]; }
}

module.exports = { FapshiService, ErreurFapshi };

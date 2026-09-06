'use strict';

const ENV = require('../../config/index');

// =====================================================================
//  Client HTTP de Groq (API compatible OpenAI).
//
//  Il existe pour une seule raison : la cle.
//
//  L'application mobile appelait Groq directement, avec une variable
//  EXPO_PUBLIC_GROQ_API_KEY. Une variable EXPO_PUBLIC_* est embarquee dans
//  le bundle : n'importe qui installant l'application peut l'extraire et
//  consommer le quota du projet. Ce n'etait pas un oubli — le commentaire
//  du fichier mobile l'assumait — mais cela reste une cle en clair chez
//  l'utilisateur.
//
//  Ici la cle reste sur le serveur. Le telephone parle au backend, le
//  backend parle a Groq.
//
//  Deux garde-fous, sans quoi la route serait un LLM gratuit pour qui a un
//  compte :
//
//   1. l'instruction systeme est ECRITE ICI, jamais recue du client ;
//   2. l'historique et la longueur sont plafonnes.
//
//  Aucune dependance ajoutee : Node 20 fournit fetch nativement.
// =====================================================================

// Ce que l'assistant est, et ce qu'il n'est pas. Cote client, cette
// consigne etait modifiable : il suffisait de la remplacer pour obtenir un
// assistant generaliste aux frais du projet.
const INSTRUCTION_SYSTEME = {
    role: 'system',
    content:
        "Tu es l'assistant virtuel de MoneyTrack, une application de gestion de budget et "
        + "de finances personnelles en Afrique francophone (devise FCFA). Reponds toujours "
        + "en francais, de maniere concise, claire et bienveillante. Aide l'utilisateur a "
        + "gerer son budget, son epargne, ses depenses, ses projets et ses transferts. "
        + "Donne des conseils pratiques et chiffres quand c'est pertinent. Si une question "
        + "sort du domaine financier, recentre poliment la conversation."
};

const ROLES = ['user', 'assistant'];
const MAX_MESSAGES = 20;        // ce qui remonte de conversation
const MAX_CARACTERES = 4000;    // par message
const MAX_TOKENS_REPONSE = 800;

class ErreurIA extends Error {
    constructor(code, message) { super(message); this.code = code; this.name = 'ErreurIA'; }
}

class GroqService {

    static configure() {
        return !!ENV.GROQ_API_KEY;
    }

    /**
     * Ne garde que ce qui ressemble a une conversation, et pas plus que le
     * plafond. Le role 'system' est refuse : il n'appartient qu'au serveur.
     */
    static _nettoyer(historique) {
        if (!Array.isArray(historique)) return [];
        return historique
            .filter(m => m && ROLES.includes(m.role) && typeof m.content === 'string' && m.content.trim())
            .slice(-MAX_MESSAGES)
            .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CARACTERES) }));
    }

    static async repondre(historique) {
        if (!this.configure()) {
            throw new ErreurIA(503, "L'assistant n'est pas configure sur ce serveur");
        }

        const messages = this._nettoyer(historique);
        if (!messages.length) throw new ErreurIA(400, 'Aucun message a traiter');
        if (messages[messages.length - 1].role !== 'user') {
            throw new ErreurIA(400, "Le dernier message doit venir de l'utilisateur");
        }

        const controleur = new AbortController();
        const minuterie = setTimeout(() => controleur.abort(), 30000);

        try {
            const reponse = await fetch(`${ENV.GROQ_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ENV.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: ENV.GROQ_MODEL,
                    messages: [INSTRUCTION_SYSTEME, ...messages],
                    temperature: 0.6,
                    max_tokens: MAX_TOKENS_REPONSE
                }),
                signal: controleur.signal
            });

            const texte = await reponse.text();
            let donnees;
            try { donnees = texte ? JSON.parse(texte) : {}; } catch (e) { donnees = {}; }

            if (!reponse.ok) {
                // Le detail du fournisseur reste dans les journaux : le rendre
                // au client exposerait la configuration du compte.
                console.error('[ia] Groq a repondu', reponse.status, texte.slice(0, 300));
                if (reponse.status === 429) {
                    throw new ErreurIA(429, "L'assistant est momentanement surcharge. Reessayez dans un instant.");
                }
                throw new ErreurIA(502, "L'assistant n'a pas pu repondre");
            }

            const contenu = donnees?.choices?.[0]?.message?.content;
            if (!contenu || !contenu.trim()) throw new ErreurIA(502, "L'assistant a renvoye une reponse vide");
            return contenu.trim();

        } catch (e) {
            if (e.name === 'ErreurIA') throw e;
            if (e.name === 'AbortError') throw new ErreurIA(504, "L'assistant met trop de temps a repondre");
            console.error('[ia] Groq injoignable :', e.message);
            throw new ErreurIA(502, "L'assistant est injoignable");
        } finally {
            clearTimeout(minuterie);
        }
    }
}

module.exports = { GroqService, ErreurIA, INSTRUCTION_SYSTEME };

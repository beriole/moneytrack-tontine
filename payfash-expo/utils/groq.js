// =====================================================================
//  Client Groq (API OpenAI-compatible) pour l'assistant financier MoneyTrack.
//  La clé est lue depuis la variable d'env publique EXPO_PUBLIC_GROQ_API_KEY
//  (fichier .env à la racine). Voir .env.example.
//
//  ⚠️ Une clé EXPO_PUBLIC_* est embarquée dans le bundle client. Pour de la
//  production, proxifiez plutôt l'appel via votre backend. Ici on l'expose
//  côté app conformément à la demande (chatbot Groq direct).
// =====================================================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
// Modèle Groq par défaut (rapide et performant). Personnalisable via .env.
const GROQ_MODEL = process.env.EXPO_PUBLIC_GROQ_MODEL || 'llama-3.3-70b-versatile';

export const SYSTEM_PROMPT = {
  role: 'system',
  content:
    "Tu es l'assistant virtuel de MoneyTrack, une application de gestion de budget et " +
    "de finances personnelles en Afrique francophone (devise FCFA). Réponds toujours " +
    "en français, de manière concise, claire et bienveillante. Aide l'utilisateur à " +
    "gérer son budget, son épargne, ses dépenses, ses projets et ses transferts. " +
    "Donne des conseils pratiques et chiffrés quand c'est pertinent. Si une question " +
    "sort du domaine financier, recentre poliment la conversation.",
};

export function isGroqConfigured() {
  return Boolean(GROQ_API_KEY);
}

/**
 * Envoie l'historique de conversation à Groq et renvoie la réponse texte.
 * @param {Array<{role:'user'|'assistant'|'system', content:string}>} history
 * @returns {Promise<string>}
 */
export async function askGroq(history) {
  if (!GROQ_API_KEY) {
    throw new Error('Clé Groq manquante : définissez EXPO_PUBLIC_GROQ_API_KEY dans .env');
  }

  const messages = [SYSTEM_PROMPT, ...history];

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status} : ${errText || res.statusText}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Réponse Groq vide');
  return content.trim();
}

export default { askGroq, isGroqConfigured, SYSTEM_PROMPT };

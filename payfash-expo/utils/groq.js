// =====================================================================
//  Assistant financier MoneyTrack.
//
//  L'appel passe par le BACKEND (POST /ai/chat), qui detient la clé Groq.
//
//  Auparavant l'application appelait Groq directement avec
//  EXPO_PUBLIC_GROQ_API_KEY. Une variable EXPO_PUBLIC_* est embarquée dans
//  le bundle : quiconque installe l'application peut l'extraire et
//  consommer le quota du projet. Le fichier l'assumait — « on l'expose côté
//  app conformément à la demande » — mais la clé restait en clair chez
//  l'utilisateur, et l'instruction système, modifiable, faisait de la clé un
//  accès à un LLM généraliste.
//
//  L'ancien chemin reste disponible pour qui le veut délibérément :
//  EXPO_PUBLIC_GROQ_DIRECT=1 dans .env le réactive.
// =====================================================================

import api from './axiosApi';

const DIRECT = process.env.EXPO_PUBLIC_GROQ_DIRECT === '1';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
const GROQ_MODEL = process.env.EXPO_PUBLIC_GROQ_MODEL || 'llama-3.3-70b-versatile';

// Conservée pour le mode direct. En mode proxy, c'est le serveur qui pose
// l'instruction système : la laisser au client, c'était laisser n'importe
// qui la remplacer.
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

/**
 * L'assistant est-il utilisable ?
 *
 * En mode proxy la réponse vient du serveur : c'est lui qui a la clé.
 * Synchrone auparavant, la fonction est désormais asynchrone.
 */
export async function isGroqConfigured() {
  if (DIRECT) return Boolean(GROQ_API_KEY);
  try {
    const { data } = await api.get('/ai/chat/etat');
    return Boolean(data?.disponible);
  } catch (e) {
    return false;
  }
}

/**
 * Envoie l'historique de conversation et renvoie la réponse texte.
 * @param {Array<{role:'user'|'assistant', content:string}>} history
 * @returns {Promise<string>}
 */
export async function askGroq(history) {
  if (!DIRECT) {
    try {
      const { data } = await api.post('/ai/chat', { messages: history });
      if (!data?.reponse) throw new Error('Réponse vide');
      return data.reponse;
    } catch (e) {
      // Le backend renvoie déjà un message lisible ; on ne le remplace pas.
      const message = e?.response?.data?.error;
      throw new Error(message || e?.message || "L'assistant n'a pas pu répondre");
    }
  }

  // --- Mode direct, sur choix explicite -----------------------------
  if (!GROQ_API_KEY) {
    throw new Error('Clé Groq manquante : définissez EXPO_PUBLIC_GROQ_API_KEY dans .env');
  }

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [SYSTEM_PROMPT, ...history],
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

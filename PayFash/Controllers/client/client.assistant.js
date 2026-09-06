const { GroqService } = require('../../services/ia/groq.service');

// =====================================================================
//  L'assistant financier, servi par le backend.
//
//  Le telephone appelait Groq directement, cle comprise dans le bundle.
//  Il passe desormais par ici : la cle ne quitte plus le serveur.
//
//  Volontairement mince — toute la discipline (instruction systeme figee,
//  historique plafonne, messages tronques) vit dans le service.
// =====================================================================

// GET /ai/chat/etat
//
// L'ecran de chat doit savoir s'il peut parler AVANT que l'utilisateur
// n'ecrive : sans cette route, il decouvrait l'absence de configuration
// apres avoir compose son message.
const etat = async (req, res) => {
    return res.status(200).json({ disponible: GroqService.configure() });
};

// POST /ai/chat   body: { messages: [{ role: 'user'|'assistant', content }] }
const chat = async (req, res) => {
    try {
        const reponse = await GroqService.repondre(req.body?.messages);
        return res.status(200).json({ reponse });
    } catch (e) {
        if (e.name === 'ErreurIA') {
            return res.status(e.code || 502).json({ error: e.message });
        }
        console.error('[ia] chat :', e);
        return res.status(500).json({ error: "Erreur interne de l'assistant" });
    }
};

module.exports = { chat, etat };

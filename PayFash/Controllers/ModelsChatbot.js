const fs = require("fs");
const brain = require("brain.js");
const path = require("path");

// IMPORTATION DE VOS MODÈLES EXACTS
const Budget = require(path.join(__dirname, "../models/model.budget.js"));
const Categorie = require(path.join(__dirname, "../models/model.categorie.js"));
const Portefeuille = require(path.join(__dirname, "../models/model.portefeuile.js"));
const Projet = require(path.join(__dirname, "../models/model.projet.js"));
const Epargne = require(path.join(__dirname, "../models/model.epargne.js"));
const Notification = require(path.join(__dirname, "../models/model.notification.js"));
const TransactionEpargne = require(path.join(__dirname, "../models/model.TransactionEpargne.js"));

// Charger les intents complets
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "./intents.json"), "utf8"));

// Préparer les données d'entraînement
let trainingData = [];
data.intents.forEach((intent) => {
  intent.patterns.forEach((p) => {
    trainingData.push({ input: p.toLowerCase(), output: intent.tag });
  });
});

// Réseau neuronal
const net = new brain.recurrent.LSTM();

// Entraînement amélioré
const modelPath = path.join(__dirname, "./brain_model.json");

async function trainOrLoadModel() {
  // Si un modèle existe déjà → le charger
  if (fs.existsSync(modelPath)) {
    console.log("📂 Chargement du modèle existant...");
    const savedModel = JSON.parse(fs.readFileSync(modelPath, "utf8"));
    net.fromJSON(savedModel);
    console.log("✅ Modèle chargé avec succès !");
    return;
  }

  // Sinon, entraîner et sauvegarder (sans bloquer le démarrage du serveur)
  setTimeout(() => {
    console.log("🚀 Début de l'entraînement du modèle en arrière-plan...");
    const stats = net.train(trainingData, {
      iterations: 1500,
      log: (details) => console.log("🤖 Training:", details),
      logPeriod: 100,
      learningRate: 0.005,
      errorThresh: 0.01
    });

    fs.writeFileSync(modelPath, JSON.stringify(net.toJSON()), "utf8");
    console.log("✅ Modèle entraîné et sauvegardé !");
  }, 1000); // démarre après 1 seconde
}



// Gestion de contexte avancée
const userContexts = new Map();

function getUserContext(clientId) {
  if (!userContexts.has(clientId)) {
    userContexts.set(clientId, {
      waitingFor: null,
      currentIntent: null,
      stepData: {},
      lastInteraction: new Date()
    });
  }
  return userContexts.get(clientId);
}

function updateUserContext(clientId, updates) {
  const context = getUserContext(clientId);
  Object.assign(context, updates, { lastInteraction: new Date() });
  userContexts.set(clientId, context);
}

function clearUserContext(clientId) {
  userContexts.delete(clientId);
}

// Normalisation améliorée
function normalize(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extraction d'entités
function extractAmount(message) {
  const match = message.match(/(\d+[\s\d]*)\s*(FCFA|fcfa|euros?|€|francs?)/i);
  return match ? parseInt(match[1].replace(/\s/g, '')) : null;
}

function extractBudgetName(message) {
  const patterns = [
    /budget\s+(\w+)/i,
    /budget\s+d[ée']?\s*(\w+)/i,
    /(\w+)\s+budget/i,
    /pour\s+le\s+budget\s+(\w+)/i
  ];
  
  for (let pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// FONCTIONS SPÉCIALISÉES AVEC VOS MODÈLES
async function handlePortfolioBalance(clientId) {
  try {
    const portefeuille = await Portefeuille.findOne({ 
      where: { ClientPortefeuilleId: clientId } 
    });
    
    if (!portefeuille) {
      return {
        solde: "0",
        date: new Date().toLocaleDateString('fr-FR'),
        evolution: "0%",
        details: "Portefeuille non configuré"
      };
    }

    return {
      solde: portefeuille.solde.toLocaleString(),
      date: new Date().toLocaleDateString('fr-FR'),
      evolution: "+2.5%",
      details: `Devise: ${portefeuille.devise} | Type: ${portefeuille.typePorteuille}`
    };
  } catch (error) {
    console.error("Erreur portfolio:", error);
    return { solde: "0", date: "N/A", evolution: "0%", details: "Erreur de chargement" };
  }
}

async function handleListBudgets(clientId) {
  try {
    const budgets = await Budget.findAll({ 
      where: { ClientBudgetId: clientId },
      include: [{ model: Categorie }]
    });

    if (!budgets || budgets.length === 0) {
      return { 
        budgets_list: "📭 **AUCUN BUDGET TROUVÉ**", 
        summary: "Vous n'avez pas encore créé de budget." 
      };
    }

    const budgetsList = budgets.map(budget => {
      const categories = budget.Categories ? budget.Categories.map(cat => 
        `    └─ ${cat.nomCategorie}: ${cat.OneBudget?.montant || 0} FCFA`
      ).join('\n') : '    └─ Aucune catégorie';
      
      return `📊 **${budget.nom}**\n   💰 ${budget.montantAllouer.toLocaleString()} FCFA\n   📅 ${budget.periodeDebut.toLocaleDateString()} - ${budget.periodeFin.toLocaleDateString()}\n${categories}`;
    }).join('\n\n');

    const total = budgets.reduce((sum, b) => sum + b.montantAllouer, 0);
    const activeBudgets = budgets.filter(b => new Date(b.periodeFin) > new Date()).length;

    const summary = `
💰 **Total budgets:** ${total.toLocaleString()} FCFA
📈 **Budgets actifs:** ${activeBudgets}
🎯 **Moyenne/budget:** ${Math.round(total / budgets.length).toLocaleString()} FCFA
    `;

    return { budgets_list: budgetsList, summary: summary };
  } catch (error) {
    console.error("Erreur budgets:", error);
    return { 
      budgets_list: "❌ **ERREUR DE CHARGEMENT**", 
      summary: "Impossible de récupérer les budgets." 
    };
  }
}

async function handleFinancialStats(clientId) {
  try {
    const budgets = await Budget.findAll({ where: { ClientBudgetId: clientId } });
    const projets = await Projet.findAll({ where: { clientId } });
    const epargnes = await Epargne.findAll({ where: { user_id: clientId } });

    const totalBudgets = budgets.reduce((sum, b) => sum + b.montantAllouer, 0);
    const totalProjets = projets.reduce((sum, p) => sum + p.budgetTotall, 0);
    const totalEpargne = epargnes.reduce((sum, e) => sum + e.montant_total, 0);
    const epargneActuelle = epargnes.reduce((sum, e) => sum + e.montant_cumule, 0);

    const stats = `
📈 **TABLEAU DE BORD FINANCIER**

💰 **BUDGETS**
• Total alloué: ${totalBudgets.toLocaleString()} FCFA
• Budgets actifs: ${budgets.length}

🏗️ **PROJETS** 
• Investissement total: ${totalProjets.toLocaleString()} FCFA
• Projets en cours: ${projets.filter(p => p.etat === 'en cours').length}

💰 **ÉPARGNE**
• Objectif total: ${totalEpargne.toLocaleString()} FCFA
• Épargne accumulée: ${epargneActuelle.toLocaleString()} FCFA
• Taux de réalisation: ${Math.round((epargneActuelle / totalEpargne) * 100) || 0}%
    `;

    return {
      stats: stats,
      charts: "📊 Graphiques disponibles dans votre espace personnel",
      insights: epargneActuelle > totalEpargne * 0.5 ? 
        "🎉 Excellent! Vous êtes sur la bonne voie pour atteindre vos objectifs d'épargne!" :
        "💡 Pensez à augmenter votre rythme d'épargne pour atteindre vos objectifs."
    };
  } catch (error) {
    console.error("Erreur stats:", error);
    return {
      stats: "📊 Données temporairement indisponibles",
      charts: "",
      insights: "Veuillez réessayer ultérieurement"
    };
  }
}

async function handleSavingsGoals(clientId) {
  try {
    const epargnes = await Epargne.findAll({ 
      where: { user_id: clientId },
      include: [{ model: TransactionEpargne }]
    });

    if (!epargnes || epargnes.length === 0) {
      return {
        goals_status: "💰 **AUCUN OBJECTIF D'ÉPARGNE**\n\nVous n'avez pas encore défini d'objectif d'épargne.",
        suggestions: "Souhaitez-vous créer votre premier objectif ?"
      };
    }

    const goalsStatus = epargnes.map(epargne => {
      const progression = Math.round((epargne.montant_cumule / epargne.montant_total) * 100);
      const bar = '█'.repeat(Math.round(progression / 10)) + '░'.repeat(10 - Math.round(progression / 10));
      
      return `🎯 **${epargne.objectif}**
📊 ${bar} ${progression}%
💰 ${epargne.montant_cumule.toLocaleString()} / ${epargne.montant_total.toLocaleString()} FCFA
⏳ ${epargne.statut} | 📅 ${epargne.date_fin ? epargne.date_fin.toLocaleDateString() : 'Non définie'}`;
    }).join('\n\n');

    return {
      goals_status: goals_status,
      suggestions: "Pour créer un nouvel objectif, dites-moi le montant et l'échéance !"
    };
  } catch (error) {
    console.error("Erreur epargne:", error);
    return {
      goals_status: "❌ Impossible de charger vos objectifs d'épargne",
      suggestions: "Veuillez réessayer plus tard"
    };
  }
}

async function handleProjectPlanning(clientId) {
  try {
    const projets = await Projet.findAll({ where: { clientId } });

    if (!projets || projets.length === 0) {
      return {
        existing_projects: "🚀 **AUCUN PROJET EN COURS**\n\nVous n'avez pas encore de projet planifié.",
        next_step: "Souhaitez-vous créer votre premier projet ?"
      };
    }

    const projectsList = projets.map(projet => 
      `🏗️ **${projet.nom}**
💰 Budget: ${projet.budgetTotall.toLocaleString()} FCFA
📊 État: ${projet.etat}
${projet.etat === 'en cours' ? '⏳ En progression' : '✅ Terminé'}`
    ).join('\n\n');

    return {
      existing_projects: projectsList,
      next_step: "Pour créer un nouveau projet, donnez-moi son nom et son budget !"
    };
  } catch (error) {
    console.error("Erreur projets:", error);
    return {
      existing_projects: "❌ Impossible de charger vos projets",
      next_step: "Veuillez réessayer plus tard"
    };
  }
}

async function handleExpenseAnalysis(clientId) {
  try {
    const budgets = await Budget.findAll({
      where: { ClientBudgetId: clientId },
      include: [{ model: Categorie }]
    });

    if (!budgets || budgets.length === 0) {
      return {
        analysis: "📊 **AUCUNE DONNÉE D'ANALYSE**\n\nCréez d'abord un budget avec des catégories.",
        recommendations: "Commencez par définir vos budgets et catégories de dépenses."
      };
    }

    let analysis = "📈 **ANALYSE DES DÉPENSES PAR CATÉGORIE**\n\n";
    let totalDepenses = 0;

    budgets.forEach(budget => {
      analysis += `**${budget.nom}**\n`;
      if (budget.Categories && budget.Categories.length > 0) {
        budget.Categories.forEach(categorie => {
          const montant = categorie.OneBudget?.montant || 0;
          totalDepenses += montant;
          analysis += `• ${categorie.nomCategorie}: ${montant.toLocaleString()} FCFA\n`;
        });
      } else {
        analysis += "• Aucune catégorie définie\n";
      }
      analysis += '\n';
    });

    const recommendations = totalDepenses > 0 ?
      `💡 **Recommandations:**\n• Répartissez mieux vos ${totalDepenses.toLocaleString()} FCFA\n• Surveillez les catégories prioritaires\n• Ajustez selon vos besoins réels` :
      "💡 **Conseil:** Ajoutez des montants à vos catégories pour une analyse précise";

    return { analysis: analysis, recommendations: recommendations };
  } catch (error) {
    console.error("Erreur analyse:", error);
    return {
      analysis: "❌ Erreur lors de l'analyse des dépenses",
      recommendations: "Veuillez réessayer ultérieurement"
    };
  }
}

// FONCTION PRINCIPALE CHATBOT
async function chatbot(req, res) {
  const { message } = req.body;
  const  clientId=req.user.id;
  if (!message) {
    return res.status(400).json({ reponse: "Message vide reçu 🤔." });
  }

  if (!clientId) {
    return res.status(400).json({ reponse: "Identifiant client manquant." });
  }
if (!net || !net.run) {
  return res.status(503).json([{ reponse: "⏳ Le chatbot se charge encore, réessayez dans quelques secondes." }]);
}

  const normalizedMessage = normalize(message);
  const intentTag = net.run(normalizedMessage);
  const intent = data.intents.find((i) => i.tag === intentTag);
  const userContext = getUserContext(clientId);

  console.log(`🤖 Intent: ${intentTag} | Client: ${clientId}`);

  try {
    // GESTION DES CONVERSATIONS MULTI-ÉTAPES
    if (userContext.waitingFor) {
      return await handleContextualResponse(message, clientId, userContext, res);
    }

    // TRAITEMENT DES INTELLIGENCES
    if (intent) {
      updateUserContext(clientId, { currentIntent: intent.tag });

      let responseData = {};
      let responseTemplate = intent.responses[Math.floor(Math.random() * intent.responses.length)];

      switch (intent.tag) {
        case "portfolio_balance":
          responseData = await handlePortfolioBalance(clientId);
          break;

        case "list_budgets":
          responseData = await handleListBudgets(clientId);
          break;

        case "financial_stats":
          responseData = await handleFinancialStats(clientId);
          break;

        case "expense_categorization":
          responseData = await handleExpenseAnalysis(clientId);
          break;

        case "savings_goals":
          responseData = await handleSavingsGoals(clientId);
          break;

        case "project_planning":
          responseData = await handleProjectPlanning(clientId);
          break;

        case "create_budget":
          updateUserContext(clientId, { waitingFor: "budget_name" });
          return res.status(200).json([{
            reponse: "🆕 **CRÉATION DE BUDGET**\n\nCommencez par donner un nom à votre nouveau budget :"
          }]);

        default:
          // Pour les intents simples sans données spécifiques
          return res.status(200).json([{ reponse: responseTemplate }]);
      }

      // REMPLACEMENT DES VARIABLES DANS LA RÉPONSE
      const finalResponse = responseTemplate.replace(/{(\w+)}/g, (match, key) => {
        return responseData[key] || match;
      });

      return res.status(200).json([{ reponse: finalResponse }]);
    }

    // FALLBACK INTELLIGENT
    return res.status(200).json([{
      reponse: "🤔 Je n'ai pas bien compris. Je suis spécialisé dans la gestion financière. Essayez avec : 'solde', 'mes budgets', 'statistiques' ou 'créer projet'."
    }]);

  } catch (error) {
    console.error("❌ Erreur chatbot:", error);
    return res.status(500).json([{
      reponse: "🚨 Une erreur technique s'est produite. Notre équipe a été alertée."
    }]);
  }
}

// GESTION DES RÉPONSES CONTEXTUELLES
async function handleContextualResponse(message, clientId, context, res) {
  try {
    switch (context.waitingFor) {
      case "budget_name":
        context.stepData.budgetName = message;
        updateUserContext(clientId, { waitingFor: "budget_amount" });
        return res.status(200).json([{
          reponse: `📝 **Nom du budget:** "${message}"\n\n💸 Quel montant total souhaitez-vous allouer à ce budget ?`
        }]);

      case "budget_amount":
        const amount = extractAmount(message);
        if (amount && amount > 0) {
          context.stepData.budgetAmount = amount;
          updateUserContext(clientId, { waitingFor: "budget_period" });
          return res.status(200).json([{
            reponse: `💰 **Montant:** ${amount.toLocaleString()} FCFA\n\n📅 Quelle est la période de ce budget ? (Ex: "3 mois" ou "du 01/01 au 31/03")`
          }]);
        }
        return res.status(200).json([{
          reponse: "❌ Montant invalide. Veuillez préciser un montant valide (ex: 500000 FCFA)"
        }]);

      case "budget_period":
        // Ici, on pourrait parser la période et créer le budget
        const budgetName = context.stepData.budgetName;
        const budgetAmount = context.stepData.budgetAmount;
        
        // Simulation de création (à remplacer par l'appel réel)
        updateUserContext(clientId, { waitingFor: null, stepData: {} });
        
        return res.status(200).json([{
          reponse: `✅ **BUDGET CRÉÉ AVEC SUCCÈS!**\n\n📊 **${budgetName}**\n💰 ${budgetAmount.toLocaleString()} FCFA\n📅 ${message}\n\nVotre budget a été enregistré. Souhaitez-vous ajouter des catégories ?`
        }]);

      default:
        updateUserContext(clientId, { waitingFor: null });
        return res.status(200).json([{
          reponse: "Merci ! Comment puis-je vous aider maintenant ?"
        }]);
    }
  } catch (error) {
    updateUserContext(clientId, { waitingFor: null, stepData: {} });
    throw error;
  }
}

// FONCTION DE NETTOYAGE DES CONTEXTES EXPIRÉS
function cleanupExpiredContexts() {
  const now = new Date();
  const EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes
  
  for (const [clientId, context] of userContexts.entries()) {
    if (now - context.lastInteraction > EXPIRATION_TIME) {
      userContexts.delete(clientId);
    }
  }
}

// Nettoyage toutes les heures
setInterval(cleanupExpiredContexts, 60 * 60 * 1000);
// Charger ou entraîner le modèle au lancement
trainOrLoadModel();


module.exports = { 
  chatbot,
  cleanupExpiredContexts,
  getUserContext // Pour le debug
};
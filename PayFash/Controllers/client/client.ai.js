const brain = require('brain.js');
const fs = require('fs');
const path = require('path');
const { 
    Client, Portefeuille, Transaction, Budget, Epargne, Projet, 
    Categorie, depense, depenseProjet 
} = require('../../models');
const { Op } = require('sequelize');

// ============================================
// INTELLIGENCE ARTIFICIELLE - Assistant Financier
// ============================================

// FAQ pour le support automatique
const FAQ = [
    {
        question: "comment créer un budget",
        reponse: "Pour créer un budget:\n1. Allez dans la section Budget\n2. Cliquez sur 'Créer un budget'\n3. Définissez le nom, le montant et la période\n4. Ajoutez des catégories de dépenses\n5. Validez la création"
    },
    {
        question: "comment déposer de l'argent",
        reponse: "Pour déposer de l'argent:\n1. Allez dans Portefeuille\n2. Cliquez sur 'Déposer'\n3. Choisissez le portefeuille cible\n4. Entrez le montant\n5. Confirmez la transaction"
    },
    {
        question: "comment créer une épargne",
        reponse: "Pour créer une épargne:\n1. Allez dans Épargne\n2. Cliquez sur 'Nouvelle épargne'\n3. Définissez votre objectif\n4. Fixez le montant cible\n5. Configurez la fréquence de dépôt"
    },
    {
        question: "comment suivre mes dépenses",
        reponse: "Pour suivre vos dépenses:\n1. Consultez la section Budget\n2. Visualisez les catégories\n3. Consultez les statistiques\n4. Exportez vos relevés en PDF/Excel"
    },
    {
        question: "qu'est-ce que le round-up",
        reponse: "Le round-up est une fonctionnalité d'épargne automatique:\n• Arrondit vos achats à l'euro supérieur\n• La différence est déposée sur votre épargne\n• Ex: achat de 2450₣ → 2500₣ épargne (50₣ économisés)"
    },
    {
        question: "comment contacter le support",
        reponse: "Pour contacter le support:\n• Email: support@payfash.com\n• Chat en direct: Disponible 24/7\n• Formulaire: Dans votre espace client\n• Délai de réponse: 24-48h"
    }
];

// Mots-clés pour l'analyse de sentiments financiers
const MOTS_STRESS = [
    'difficile', 'impayé', 'dette', 'problème', 'critique', 'urgent',
    'excédé', 'épuisé', 'angoisse', 'inquiétude', 'stress', 'panique',
    'surendetté', 'faillite', 'ruine', 'catastrophe', 'aide', 'secours'
];

const MOTS_POSITIFS = [
    'bien', 'excellent', 'super', 'génial', 'content', 'satisfait',
    'progrès', 'réussi', 'économie', 'gain', 'bénéfice', 'auge'
];

// Suggestions basées sur la situation financière
const SUGGESTIONS_FINANCIERES = {
    depenses_elevees: {
        seuil: 80,
        messages: [
            "Vos dépensesapprochent de votre budget. Voulez-vous que je vous aide à identifier les postes de dépenses principales?",
            "Attention, vous avez utilisé {pourcentage}% de votre budget. Je peux vous suggérer des optimizations."
        ]
    },
    bonne_epargne: {
        seuil: 50,
        messages: [
            "Bravo! Vous avez économisé {montant}. Continuez ainsi pour atteindre votre objectif!",
            "Votre épargneprogresse bien. Plus que {restant} pour atteindre votre but!"
        ]
    },
    projet_bientot: {
        jours: 30,
        messages: [
            "Votre projet approche de sa date limite. Avez-vous besoin d'aide pour finaliser le financement?"
        ]
    }
};

// ============================================
// CHATBOT AVANCÉ
// ============================================

const chatbot = async (req, res) => {
    const clientId = req.user?.id;
    const { message, contexte } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message requis" });
    }

    try {
        // 1. Analyse du sentiment
        const sentiment = analyserSentiment(message);
        
        // 2. Extraction de l'intention
        const intention = detecterIntention(message);
        
        // 3. Génération de la réponse
        let reponse = await genererReponse(message, intention, clientId);
        
        // 4. Ajouter des suggestions contextuelles
        const suggestions = await genererSuggestions(clientId, intention);
        
        // 5. Détecter le stress financier
        let alertStress = null;
        if (sentiment.negatif > 0.6) {
            alertStress = await detecterStressFinancier(clientId);
        }

        res.json({
            reponse,
            intention: intention.type,
            confiance: intention.confiance,
            suggestions,
            sentiment: {
                score: sentiment,
                alerte: alertStress
            },
            contexte: {
                peutAider: true,
                suggestionsContextuelles: suggestions.slice(0, 3)
            }
        });

    } catch (error) {
        console.error("Erreur chatbot:", error);
        res.status(500).json({ 
            error: "Erreur lors du traitement",
            reponse: "Désolé, j'ai rencontré un problème. Veuillez réessayer ou contacter le support."
        });
    }
};

// ============================================
// ANALYSE DE SENTIMENTS
// ============================================

function analyserSentiment(texte) {
    const mots = texte.toLowerCase().split(/\s+/);
    
    let scorePositif = 0;
    let scoreNegatif = 0;
    let scoreNeutre = mots.length;

    mots.forEach(mot => {
        if (MOTS_POSITIFS.some(m => mot.includes(m))) scorePositif++;
        if (MOTS_STRESS.some(m => mot.includes(m))) scoreNegatif++;
    });

    const total = scorePositif + scoreNegatif || 1;
    
    return {
        positif: scorePositif / total,
        negatif: scoreNegatif / total,
        neutre: 1 - ((scorePositif + scoreNegatif) / (mots.length || 1)),
        score: (scorePositif - scoreNegatif) / (mots.length || 1)
    };
}

async function detecterStressFinancier(clientId) {
    if (!clientId) return null;

    try {
        // Analyser les transactions récentes
        const dateDebut = new Date();
        dateDebut.setDate(dateDebut.getDate() - 30);

        const transactions = await Transaction.findAll({
            where: {
                ClientTransactionId: clientId,
                type: 'dépense',
                date: { [Op.gte]: dateDebut }
            }
        });

        // Calculer le ratio dépenses/revenus
        const revenus = await Transaction.findAll({
            where: {
                ClientTransactionId: clientId,
                type: 'revenu',
                date: { [Op.gte]: dateDebut }
            }
        });

        const totalDepenses = transactions.reduce((sum, t) => sum + t.montant, 0);
        const totalRevenus = revenus.reduce((sum, t) => sum + t.montant, 0);

        if (totalRevenus > 0 && (totalDepenses / totalRevenus) > 0.9) {
            return {
                niveau: 'élevé',
                message: "Vos dépenses sont proches de vos revenus. Voici quelques conseils:",
                conseils: [
                    "Réduisez les dépenses non essentielles",
                    "Augmentez vos revenus ou votre épargne",
                    "Contactez le support si vous avez des difficultés"
                ]
            };
        }

        return null;
    } catch (error) {
        console.error("Erreur détection stress:", error);
        return null;
    }
}

// ============================================
// DÉTECTION D'INTENTION
// ============================================

function detecterIntention(message) {
    const msg = message.toLowerCase();
    
    const intentions = [
        { type: 'solde', mots: ['solde', 'combien', 'argent', 'disponible', 'montant'], poids: 1 },
        { type: 'depot', mots: ['déposer', 'recharger', 'ajouter', 'alimenter'], poids: 1 },
        { type: 'retrait', mots: ['retirer', 'retrait', 'sortir'], poids: 1 },
        { type: 'budget', mots: ['budget', 'dépense', 'catégorie', 'limite'], poids: 1 },
        { type: 'epargne', mots: ['épargne', 'économiser', 'tirelire'], poids: 1 },
        { type: 'projet', mots: ['projet', 'plan', 'objectif'], poids: 1 },
        { type: 'aide', mots: ['aide', 'comment', 'pourquoi', '?', 'explique'], poids: 0.8 },
        { type: 'probleme', mots: ['problème', 'erreur', 'marche pas', 'bug'], poids: 1 },
        { type: 'salutation', mots: ['bonjour', 'salut', 'coucou', 'hello'], poids: 1 },
        { type: 'remerciement', mots: ['merci', 'bravo', 'génial', 'super'], poids: 1 }
    ];

    let meilleureIntention = { type: 'general', confiance: 0.3 };
    
    intentions.forEach(intent => {
        const matches = intent.mots.filter(mot => msg.includes(mot)).length;
        const confiance = (matches * intent.poids) / msg.length;
        if (confiance > meilleureIntention.confiance) {
            meilleureIntention = { type: intent.type, confiance };
        }
    });

    return meilleureIntention;
}

// ============================================
// GÉNÉRATION DE RÉPONSES
// ============================================

async function genererReponse(message, intention, clientId) {
    const msg = message.toLowerCase();
    
    // Vérifier d'abord dans la FAQ
    const reponseFaq = FAQ.find(f => 
        msg.includes(f.question.split(' ')[0]) || 
        f.question.split(' ').some(mot => msg.includes(mot))
    );
    
    if (reponseFaq) {
        return reponseFaq.reponse;
    }

    // Réponses basées sur l'intention
    switch (intention.type) {
        case 'solde':
            return await getSoldeReponse(clientId);
        case 'budget':
            return await getBudgetReponse(clientId);
        case 'epargne':
            return await getEpargneReponse(clientId);
        case 'projet':
            return await getProjetReponse(clientId);
        case 'aide':
            return getAideReponse();
        case 'probleme':
            return getProblemeResponse();
        case 'salutation':
            return getSalutationReponse();
        case 'remerciement':
            return getMerciReponse();
        default:
            return getReponseGenerale(message);
    }
}

async function getSoldeReponse(clientId) {
    if (!clientId) {
        return "Pour voir votre solde, connectez-vous à votre compte.";
    }

    const portefeuille = await Portefeuille.findAll({
        where: { ClientPortefeuilleId: clientId, estActif: true }
    });

    const total = portefeuille.reduce((sum, p) => sum + p.solde, 0);
    const details = portefeuille.map(p => 
        `• ${p.nom || p.typePortefeuille}: ${p.solde.toLocaleString()} ${p.devise}`
    ).join('\n');

    return `💰 **Votre solde total:** ${total.toLocaleString()} XAF\n\n${details}\n\nVoulez-vous plus de détails sur une catégorie?`;
}

async function getBudgetReponse(clientId) {
    if (!clientId) {
        return "Pour voir vos budgets, connectez-vous à votre compte.";
    }

    const budgets = await Budget.findAll({
        where: { ClientBudgetId: clientId, estActif: true }
    });

    if (budgets.length === 0) {
        return "Vous n'avez pas encore de budget. Voulez-vous que je vous aide à en créer un?";
    }

    const details = budgets.map(b => {
        const pct = ((b.montantDepense / b.montantAllouer) * 100).toFixed(1);
        return `• ${b.nom}: ${pct}% utilisé`;
    }).join('\n');

    return `📊 **Vos budgets:**\n\n${details}\n\nJe peux vous aider à:\n• Créer un nouveau budget\n• Analyser vos dépenses\n• Optimiser vos allocations`;
}

async function getEpargneReponse(clientId) {
    if (!clientId) {
        return "Pour voir vos épargnes, connectez-vous à votre compte.";
    }

    const epargnes = await Epargne.findAll({
        where: { user_id: clientId, statut: 'en cours' }
    });

    if (epargnes.length === 0) {
        return "Vous n'avez pas d'épargne en cours. Voulez-vous créer une tire-lire pour un objectif?";
    }

    const details = epargnes.map(e => {
        const pct = ((e.montant_cumule / e.montant_total) * 100).toFixed(1);
        return `• ${e.objectif}: ${e.montant_cumule.toLocaleString()} / ${e.montant_total.toLocaleString()} (${pct}%)`;
    }).join('\n');

    return `🐷 **Vos épargnes:**\n\n${details}\n\nJe peux vous aider à:\n• Créer une nouvelle épargne\n• Configurer l'épargne automatique\n• Simuler les intérêts`;
}

async function getProjetReponse(clientId) {
    if (!clientId) {
        return "Pour voir vos projets, connectez-vous à votre compte.";
    }

    const projets = await Projet.findAll({
        where: { ClientId: clientId, etat: 'en cours' }
    });

    if (projets.length === 0) {
        return "Vous n'avez pas de projet en cours. Voulez-vous en créer un?";
    }

    const details = projets.slice(0, 3).map(p => 
        `• ${p.nom}: ${p.progression}%`
    ).join('\n');

    return `📁 **Vos projets:**\n\n${details}\n\nJe peux vous aider à:\n• Créer un nouveau projet\n• Ajouter des jalons\n• Inviter des collaborateurs`;
}

function getAideReponse() {
    return `🤖 **Comment puis-je vous aider?**\n\nJe peux vous assister pour:\n• 💰 Solde et transactions\n• 📊 Gestion des budgets\n• 🐷 Épargne et objectifs\n• 📁 Projets financiers\n• ❓ Questions fréquentes\n• 🆘 Problèmes techniques\n\nTapez votre question!`;
}

function getProblemeReponse() {
    return `😟 Je suis désolé que vous rencontriez un problème. Voici quelques solutions:\n\n• Vérifiez votre connexion internet\n• Videz le cache de votre navigateur\n• Réessayez dans quelques minutes\n\nSi le problème persiste, contactez le support:\n📧 support@payfash.com`;
}

function getSalutationReponse() {
    const responses = [
        "Bonjour! Comment puis-je vous aider aujourd'hui?",
        "Salut! Je suis là pour vous aider avec vos finances.",
        "Hello! Posez-moi vos questions sur la gestion de budget."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

function getMerciReponse() {
    const responses = [
        "De rien! C'est un plaisir de vous aider. 😊",
        "Merci à vous! N'hésitez pas si vous avez d'autres questions.",
        "Avec plaisir! Je suis là pour vous simplifier la vie financière."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

function getReponseGenerale(message) {
    // Essayer de trouver une réponse pertinente dans les mots-clés
    if (message.includes('invest')) {
        return "Pour investir, je vousconseille de consulter la section Budget pour planifier vos objectifs.";
    }
    if (message.includes('crypto') || message.includes('bitcoin')) {
        return "Les cryptomonnaies sont volatiles. Consultez un expert financier avant d'investir.";
    }
    if (message.includes('emprunt') || message.includes('prêt')) {
        return "Pour un prêt, consultez la section Prêts de votre application.";
    }
    
    return "Je ne suis pas sûr de comprendre. Pouvez-vous reformuler votre question?\n\nJe peux vous aider avec: solde, budgets, épargne, projets, et plus!";
}

// ============================================
// SUGGESTIONS CONTEXTUELLES
// ============================================

async function genererSuggestions(clientId, intention) {
    if (!clientId) {
        return [
            { texte: "Voir mes budgets", action: "Voir budgets" },
            { texte: "Créer une épargne", action: "Créer épargne" },
            { texte: "FAQ", action: "Voir FAQ" }
        ];
    }

    const suggestions = [];

    try {
        // Suggestions basées sur les données utilisateur
        const budgets = await Budget.findAll({
            where: { ClientBudgetId: clientId, estActif: true }
        });

        const epargnes = await Epargne.findAll({
            where: { user_id: clientId, statut: 'en cours' }
        });

        // Analyser les budgets
        budgets.forEach(budget => {
            const pct = (budget.montantDepense / budget.montantAllouer) * 100;
            if (pct > 80) {
                suggestions.push({
                    texte: `Alerte: ${budget.nom} à ${pct.toFixed(0)}%`,
                    action: `budget:${budget.id}`,
                    type: 'alerte'
                });
            }
        });

        // Analyser les épargnes
        epargnes.forEach(epargne => {
            const pct = (epargne.montant_cumule / epargne.montant_total) * 100;
            if (pct >= 100) {
                suggestions.push({
                    texte: `🎉 ${epargne.objectif} atteint!`,
                    action: `epargne:${epargne.id}`,
                    type: 'celebration'
                });
            } else if (pct >= 50) {
                suggestions.push({
                    texte: `${epargne.objectif}: ${pct.toFixed(0)}%`,
                    action: `epargne:${epargne.id}`,
                    type: 'progression'
                });
            }
        });

        // Suggestions générales
        if (budgets.length < 3) {
            suggestions.push({ texte: "Créer un nouveau budget", action: "creer_budget" });
        }
        if (epargnes.length < 2) {
            suggestions.push({ texte: "Créer une épargne", action: "creer_epargne" });
        }

    } catch (error) {
        console.error("Erreur génération suggestions:", error);
    }

    return suggestions.slice(0, 5);
}

// ============================================
// ANALYSE FINANCIÈRE COMPLÈTE
// ============================================

const analyserSituationFinanciere = async (req, res) => {
    const clientId = req.user.id;
    const { periode = 30 } = req.query;

    try {
        const dateDebut = new Date();
        dateDebut.setDate(dateDebut.getDate() - parseInt(periode));

        // Récupérer toutes les données
        const [transactions, budgets, epargnes, projets, portefeuille] = await Promise.all([
            Transaction.findAll({
                where: { 
                    ClientTransactionId: clientId,
                    date: { [Op.gte]: dateDebut }
                }
            }),
            Budget.findAll({
                where: { ClientBudgetId: clientId, estActif: true }
            }),
            Epargne.findAll({
                where: { user_id: clientId, statut: 'en cours' }
            }),
            Projet.findAll({
                where: { ClientId: clientId, etat: 'en cours' }
            }),
            Portefeuille.findAll({
                where: { ClientPortefeuilleId: clientId, estActif: true }
            })
        ]);

        // Calculs financiers
        const revenus = transactions.filter(t => t.type === 'revenu' || t.type === 'transfert_entrant');
        const depenses = transactions.filter(t => t.type === 'dépense' || t.type === 'transfert_sortant');

        const totalRevenus = revenus.reduce((sum, t) => sum + t.montant, 0);
        const totalDepenses = depenses.reduce((sum, t) => sum + t.montant, 0);

        // Ratio d'endettement
        const ratio = totalRevenus > 0 ? (totalDepenses / totalRevenus * 100).toFixed(1) : 0;

        // Analyse par catégorie
        const categoriesDepenses = {};
        depenses.forEach(tx => {
            const cat = categoriserTransaction(tx.description);
            if (!categoriesDepenses[cat]) categoriesDepenses[cat] = 0;
            categoriesDepenses[cat] += tx.montant;
        });

        // Trier par montant
        const topCategories = Object.entries(categoriesDepenses)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // Générer le diagnostic
        const diagnostic = {
            periode: `${periode} jours`,
            resume: {
                totalRevenus,
                totalDepenses,
                solde: totalRevenus - totalDepenses,
                tauxEpargne: totalRevenus > 0 ? ((totalRevenus - totalDepenses) / totalRevenus * 100).toFixed(1) : 0
            },
            ratioEndettement: ratio,
            topCategories: topCategories.map(([cat, montant]) => ({
                categorie: cat,
                montant,
                pourcentage: (montant / totalDepenses * 100).toFixed(1)
            })),
            alertes: [],
            recommandations: []
        };

        // Alertes
        if (parseFloat(ratio) > 90) {
            diagnostic.alertes.push({
                type: 'danger',
                message: "Vos dépenses depassent vos revenus!"
            });
        }
        if (ratio > 70 && ratio <= 90) {
            diagnostic.alertes.push({
                type: 'warning',
                message: "Attention, votre taux d'épargne est très faible."
            });
        }

        // Recommandations
        if (parseFloat(ratio) < 20) {
            diagnostic.recommandations.push("Excellent! Vous pourriez augmenter votre épargne.");
        }
        if (topCategories[0] && topCategories[0][1] > totalDepenses * 0.4) {
            diagnostic.recommandations.push(`Vos dépenses en "${topCategories[0][0]}" représentent une grande partie de votre budget.`);
        }

        res.json(diagnostic);

    } catch (error) {
        console.error("Erreur analyse:", error);
        res.status(500).json({ error: "Erreur lors de l'analyse financière" });
    }
};

// Catégorisation simple
function categoriserTransaction(description) {
    if (!description) return 'autre';
    const desc = description.toLowerCase();
    
    if (desc.includes('restaurant') || desc.includes('aliment')) return 'alimentation';
    if (desc.includes('transport') || desc.includes('uber')) return 'transport';
    if (desc.includes('loyer') || desc.includes('immobilier')) return 'logement';
    if (desc.includes('facture') || desc.includes('électric')) return 'factures';
    if (desc.includes('santé') || desc.includes('pharmacie')) return 'santé';
    if (desc.includes('shopping') || desc.includes('amazon')) return 'shopping';
    if (desc.includes('loisir') || desc.includes('cinéma')) return 'loisir';
    
    return 'autre';
}

// ============================================
// RECOMMANDATIONS PRODUITS (MARKETPLACE)
// ============================================

const getRecommandationsProduits = async (req, res) => {
    const clientId = req.user.id;

    try {
        // Analyser les préférences basées sur les transactions
        const categoriesPreferees = await Transaction.findAll({
            where: { 
                ClientTransactionId: clientId,
                type: 'dépense'
            },
            attributes: ['description'],
            limit: 100
        });

        // Compter les catégories
        const compteurs = {};
        categoriesPreferees.forEach(tx => {
            const cat = categoriserTransaction(tx.description);
            compteurs[cat] = (compteurs[cat] || 0) + 1;
        });

        // Trier par fréquence
        const topCategories = Object.entries(compteurs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        // Générer des recommandations basées sur les catégories
        const recommandations = topCategories.map(([categorie, count]) => ({
            categorie,
            score: count,
            produits: getProduitsSimules(categorie)
        }));

        res.json({
            recommendations: recommandations,
            utilisateur: {
                categoriesPreferees: topCategories.map(c => c[0])
            }
        });

    } catch (error) {
        console.error("Erreur recommandations:", error);
        res.status(500).json({ error: "Erreur lors de la génération des recommandations" });
    }
};

function getProduitsSimules(categorie) {
    // Simulation de produits recommandés
    const produitsParCategorie = {
        alimentation: [
            { nom: "Cours de cuisine économique", prix: 25000, categorie: "formation" },
            { nom: "Livres de recettes rapides", prix: 15000, categorie: "livre" }
        ],
        transport: [
            { nom: "Abonnement transport mensuel", prix: 15000, categorie: "abonnement" },
            { nom: "Application covoiturage", prix: 0, categorie: "app" }
        ],
        logement: [
            { nom: "Assurance habitation", prix: 50000, categorie: "assurance" },
            { nom: "Économiseur d'énergie", prix: 20000, categorie: "équipement" }
        ],
        shopping: [
            { nom: "Cashback offers", prix: 0, categorie: "service" }
        ],
        autre: [
            { nom: "Formation gestion budget", prix: 30000, categorie: "formation" }
        ]
    };

    return produitsParCategorie[categorie] || produitsParCategorie['autre'];
}

module.exports = {
    chatbot,
    analyserSituationFinanciere,
    getRecommandationsProduits,
    analyserSentiment
};

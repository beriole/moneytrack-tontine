const { Budget, Categorie, Transaction, Portefeuille, BudgetCollaborator, Client } = require('../../models');
const { Op } = require('sequelize');

// ============================================
// BUDGETS AVANCÉS - Smart, Collaboratif, Alertes, Cyclique
// ============================================

// Créer un budget cyclique
const creerBudgetCyclique = async (req, res) => {
    const clientId = req.user.id;
    const {
        nom,
        montantAllouer,
        typeCycle = 'mensuel', // hebdomadaire, mensuel, annuel
        periodeDebut,
        periodeFin,
        categories,
        seuilAlerte = 80,
        description,
        couleur,
        icone
    } = req.body;

    try {
        // Valider les dates
        const debut = new Date(periodeDebut);
        const fin = new Date(periodeFin);
        
        if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
            return res.status(400).json({ error: "Dates invalides" });
        }

        // Créer le budget
        const budget = await Budget.create({
            nom,
            montantAllouer,
            periodeDebut: debut,
            periodeFin: fin,
            typeCycle,
            seuilAlerte,
            description,
            couleur: couleur || '#3498db',
            icone: icone || 'wallet',
            ClientBudgetId: clientId,
            montantDepense: 0
        });

        // Ajouter les catégories
        if (categories && categories.length > 0) {
            for (const cat of categories) {
                const [categorie] = await Categorie.findOrCreate({
                    where: { nomCategorie: cat.nom },
                    defaults: { description: cat.description || '' }
                });
                await budget.addCategorie(categorie, { through: { montant: cat.montant } });
            }
        }

        res.status(201).json({
            message: "Budget cyclique créé avec succès",
            budget
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création du budget" });
    }
};

// Obtenir les budgets avec alertes
const getBudgetsAvecAlertes = async (req, res) => {
    const clientId = req.user.id;

    try {
        const budgets = await Budget.findAll({
            where: { ClientBudgetId: clientId, estActif: true },
            include: [Categorie]
        });

        // Vérifier les seuils d'alerte
        const budgetsAvecAlertes = budgets.map(budget => {
            const pourcentage = (budget.montantDepense / budget.montantAllouer) * 100;
            return {
                ...budget.toJSON(),
                pourcentageUtilise: pourcentage.toFixed(1),
                alerteTrigger: pourcentage >= budget.seuilAlerte,
                joursRestants: Math.ceil((new Date(budget.periodeFin) - new Date()) / (1000 * 60 * 60 * 24))
            };
        });

        // Trier par ordre d'alerte
        budgetsAvecAlertes.sort((a, b) => b.pourcentageUtilise - a.pourcentageUtilise);

        res.json({
            budgets: budgetsAvecAlertes,
            totalBudgets: budgets.length,
            alertesActives: budgetsAvecAlertes.filter(b => b.alerteTrigger).length
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération des budgets" });
    }
};

// Mettre à jour les dépenses du budget
const mettreAJourDepensesBudget = async (req, res) => {
    const clientId = req.user.id;
    const { budgetId } = req.params;
    const { montantDepense } = req.body;

    try {
        const budget = await Budget.findOne({
            where: { id: budgetId, ClientBudgetId: clientId }
        });

        if (!budget) {
            return res.status(404).json({ error: "Budget introuvable" });
        }

        budget.montantDepense = montantDepense;
        
        // Vérifier si on doit envoyer une alerte
        const pourcentage = (montantDepense / budget.montantAllouer) * 100;
        
        if (pourcentage >= budget.seuilAlerte && !budget.alerteEnvoyee) {
            budget.alerteEnvoyee = true;
            // Ici, vous pourriez déclencher une notification
            console.log(`⚠️ ALERTE: Budget \"${budget.nom}\" à ${pourcentage.toFixed(1)}%`);
        }
        
        // Réinitialiser l'alerte pour une nouvelle période
        const now = new Date();
        if (now > new Date(budget.periodeFin)) {
            budget.alerteEnvoyee = false;
            budget.periodeFin = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 jours
        }

        await budget.save();

        res.json({
            message: "Dépenses mises à jour",
            budget,
            alerte: pourcentage >= budget.seuilAlerte
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
};

// Renouveler un budget cyclique
const renouvelBudget = async (req, res) => {
    const clientId = req.user.id;
    const { budgetId } = req.params;

    try {
        const budget = await Budget.findOne({
            where: { id: budgetId, ClientBudgetId: clientId }
        });

        if (!budget) {
            return res.status(404).json({ error: "Budget introuvable" });
        }

        // Calculer la nouvelle période selon le type de cycle
        const nouvelleDebut = new Date(budget.periodeFin);
        let nouvelleFin;

        switch (budget.typeCycle) {
            case 'hebdomadaire':
                nouvelleFin = new Date(nouvelleDebut.getTime() + 7 * 24 * 60 * 60 * 1000);
                break;
            case 'mensuel':
                nouvelleFin = new Date(nouvelleDebut);
                nouvelleFin.setMonth(nouvelleFin.getMonth() + 1);
                break;
            case 'annuel':
                nouvelleFin = new Date(nouvelleDebut);
                nouvelleFin.setFullYear(nouvelleFin.getFullYear() + 1);
                break;
            default:
                nouvelleFin = new Date(nouvelleDebut.getTime() + 30 * 24 * 60 * 60 * 1000);
        }

        // Réinitialiser le budget pour la nouvelle période
        budget.periodeDebut = nouvelleDebut;
        budget.periodeFin = nouvelleFin;
        budget.montantDepense = 0;
        budget.alerteEnvoyee = false;
        
        await budget.save();

        res.json({
            message: "Budget renouvelé pour la prochaine période",
            budget
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors du renouvellement" });
    }
};

// ============================================
// BUDGET COLLABORATIF
// ============================================

// Inviter un collaborateur à un budget
const inviterCollaborateur = async (req, res) => {
    const clientId = req.user.id;
    const { budgetId } = req.params;
    const { email, nom, role = 'lecture', peutDepenser = false, limiteDepense } = req.body;

    try {
        const budget = await Budget.findOne({
            where: { id: budgetId, ClientBudgetId: clientId }
        });

        if (!budget) {
            return res.status(404).json({ error: "Budget introuvable" });
        }

        // Activer le mode collaboratif
        budget.estPartage = true;
        await budget.save();

        // Créer l'invitation
        const collaborateur = await BudgetCollaborator.create({
            budgetId,
            userId: clientId, // temporaire
            nom,
            email,
            role,
            peutDepenser,
            limiteDepense,
            statut: 'en_attente'
        });

        // Ici, vous Enverriez un email d'invitation
        console.log(`📧 Invitation envoyée à ${email} pour le budget \"${budget.nom}\"`);

        res.status(201).json({
            message: "Invitation envoyée",
            collaborateur
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de l'invitation" });
    }
};

// Répondre à une invitation
const repondreInvitation = async (req, res) => {
    const { invitationId } = req.params;
    const { accepter } = req.body;
    const clientId = req.user.id;

    try {
        const invitation = await BudgetCollaborator.findByPk(invitationId);

        if (!invitation) {
            return res.status(404).json({ error: "Invitation introuvable" });
        }

        invitation.statut = accepter ? 'accepte' : 'refuse';
        invitation.userId = clientId;
        invitation.dateAcceptation = new Date();
        
        await invitation.save();

        res.json({
            message: accepter ? "Invitation acceptée" : "Invitation refusée",
            invitation
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la réponse" });
    }
};

// Lister les collaborateurs d'un budget
const listerCollaborateurs = async (req, res) => {
    const clientId = req.user.id;
    const { budgetId } = req.params;

    try {
        const budget = await Budget.findOne({
            where: { id: budgetId, ClientBudgetId: clientId }
        });

        if (!budget) {
            return res.status(404).json({ error: "Budget introuvable" });
        }

        const collaborateurs = await BudgetCollaborator.findAll({
            where: { budgetId }
        });

        res.json({ collaborateurs });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération" });
    }
};

// ============================================
// BUDGET SMART - Suggestions basées sur l'historique
// ============================================

const getSuggestionsBudget = async (req, res) => {
    const clientId = req.user.id;
    const { periode = 90 } = req.query; // derniers 90 jours par défaut

    try {
        // Récupérer les transactions des derniers mois
        const dateDebut = new Date();
        dateDebut.setDate(dateDebut.getDate() - parseInt(periode));

        const transactions = await Transaction.findAll({
            where: {
                ClientTransactionId: clientId,
                type: { [Op.in]: ['dépense', 'transfert_sortant'] },
                date: { [Op.gte]: dateDebut }
            },
            order: [['date', 'DESC']]
        });

        // Grouper par catégorie (basé sur les mots-clés)
        const categoriesDepenses = {};
        transactions.forEach(tx => {
            const desc = (tx.description || '').toLowerCase();
            let categorie = 'autre';
            
            if (desc.includes('restaurant') || desc.includes('supermarché') || desc.includes('courses')) categorie = 'alimentaire';
            else if (desc.includes('uber') || desc.includes('taxi') || desc.includes('bus') || desc.includes('essence')) categorie = 'transport';
            else if (desc.includes('loyer') || desc.includes('immobilier')) categorie = 'logement';
            else if (desc.includes('électric') || desc.includes('eau') || desc.includes('internet')) categorie = 'factures';
            else if (desc.includes('pharmacie') || desc.includes('médecin')) categorie = 'santé';
            else if (desc.includes('amazon') || desc.includes('vêtements') || desc.includes('shopping')) categorie = 'shopping';
            else if (desc.includes('cinéma') || desc.includes('sport') || desc.includes('gym')) categorie = 'loisir';

            if (!categoriesDepenses[categorie]) {
                categoriesDepenses[categorie] = { total: 0, count: 0, transactions: [] };
            }
            categoriesDepenses[categorie].total += tx.montant;
            categoriesDepenses[categorie].count++;
        });

        // Calculer les suggestions
        const suggestions = Object.entries(categoriesDepenses)
            .map(([categorie, data]) => ({
                categorie,
                moyenneMensuelle: (data.total / (periode / 30)).toFixed(0),
                totalPeriode: data.total.toFixed(0),
                nombreTransactions: data.count,
                recommandation: `Allouez environ ${(data.total / (periode / 30) * 1.2).toFixed(0)} XAF par mois pour \"${categorie}\"`
            }))
            .sort((a, b) => parseFloat(b.moyenneMensuelle) - parseFloat(a.moyenneMensuelle));

        res.json({
            periodeAnalyse: `${periode} derniers jours`,
            totalDepenses: transactions.reduce((sum, tx) => sum + tx.montant, 0),
            suggestions,
            conseils: generateConseils(suggestions)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de l'analyse" });
    }
};

// Générer des conseils personnalisés
function generateConseils(suggestions) {
    const conseils = [];
    
    const alimentaire = suggestions.find(s => s.categorie === 'alimentaire');
    if (alimentaire && parseFloat(alimentaire.moyenneMensuelle) > 100000) {
        conseils.push({
            type: 'économie',
            message: "Vos dépenses alimentaires sont élevées. Essayez de préparer plus de repas à domicile."
        });
    }

    const transport = suggestions.find(s => s.categorie === 'transport');
    if (transport && parseFloat(transport.moyenneMensuelle) > 50000) {
        conseils.push({
            type: 'optimisation',
            message: "Considérez le covoiturage ou les transports en commun pour réduire les coûts."
        });
    }

    if (suggestions.length > 0) {
        conseils.push({
            type: 'épargne',
            message: `Vous pourriez épargner environ ${(parseFloat(suggestions[0].moyenneMensuelle) * 0.1).toFixed(0)} XAF/mois en réduisant vos ${suggestions[0].categorie}.`
        });
    }

    return conseils;
}

module.exports = {
    // Budget cyclique
    creerBudgetCyclique,
    renouvelBudget,
    
    // Alertes
    getBudgetsAvecAlertes,
    mettreAJourDepensesBudget,
    
    // Budget collaboratif
    inviterCollaborateur,
    repondreInvitation,
    listerCollaborateurs,
    
    // Budget smart
    getSuggestionsBudget
};

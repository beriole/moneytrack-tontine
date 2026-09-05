const { Epargne, TransactionEpargne, EpargneAutomatique, Portefeuille, Transaction } = require('../../models');
const { Op } = require('sequelize');

// ============================================
// ÉPARGNE AVANCÉE - Taux, Objectifs, Automatique, Tire-lire
// ============================================

// Citations motivantes
const CITATIONS = [
    "L'épargne est la vertu des gens prévoyants.",
    "Un tiens vaut mieux que deux tu l'auras.",
    "Épargnez pour votre avenir, pas pour les urgences.",
    "Les petits ruisseaux font les grandes rivières.",
    "L'argent économisé est argent gagné.",
    "Commencez où vous êtes, utilisez ce que vous avez, faites ce que vous pouvez.",
    "La meilleure время d'épargner était hier. La prochaine meilleure est aujourd'hui.",
    "Votre avenir commence par vos économies d'aujourd'hui."
];

// Créer une épargne avec options avancées
const creerEpargneAvancee = async (req, res) => {
    const clientId = req.user.id;
    const {
        objectif,
        date_debut,
        date_fin,
        montant_total,
        // Nouveaux champs
        tauxInteret = 0,
        imageObjectif,
        couleur = '#3498db',
        icone = 'piggy-bank',
        descriptionMotivation,
        frequenceDepot,
        montantRecurrent,
        estTireLire = false,
        estSecrete = false,
        motivationQuote
    } = req.body;

    try {
        // Validation des dates
        const debut = new Date(date_debut);
        const fin = date_fin ? new Date(date_fin) : null;
        
        if (isNaN(debut.getTime())) {
            return res.status(400).json({ error: "Date de début invalide" });
        }

        // Calculer la progression initiale
        const progression = 0;

        const epargne = await Epargne.create({
            objectif,
            date_debut: debut,
            date_fin: fin,
            montant_total,
            montant_cumule: 0,
            statut: 'en cours',
            // Nouveaux champs
            tauxInteret,
            capitalInitial: 0,
            interetCumule: 0,
            imageObjectif,
            couleur,
            icone,
            descriptionMotivation,
            frequenceDepot,
            montantRecurrent,
            estTireLire,
            estSecrete,
            motivationQuote: motivationQuote || CITATIONS[Math.floor(Math.random() * CITATIONS.length)],
            progression
        });

        res.status(201).json({
            message: "Épargne créée avec succès",
            epargne
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création de l'épargne" });
    }
};

// Déposer sur une épargne avec calcul d'intérêts
const deposerEpargne = async (req, res) => {
    const clientId = req.user.id;
    const { epargneId } = req.params;
    const { montant, portefeuilleSourceId } = req.body;

    try {
        const epargne = await Epargne.findOne({
            where: { id: epargneId, user_id: clientId }
        });

        if (!epargne) {
            return res.status(404).json({ error: "Épargne introuvable" });
        }

        if (epargne.statut === 'termine') {
            return res.status(400).json({ error: "Cette épargne est déjà terminée" });
        }

        // Mise à jour du montant
        const ancienMontant = epargne.montant_cumule;
        epargne.montant_cumule += parseFloat(montant);
        
        // Si premier dépôt, enregistrer le capital initial
        if (epargne.capitalInitial === 0 || epargne.capitalInitial === null) {
            epargne.capitalInitial = parseFloat(montant);
        }

        // Calculer les intérêts
        if (epargne.tauxInteret > 0) {
            await calculerInterets(epargne);
        }

        // Mettre à jour la progression
        epargne.progression = Math.min(100, (epargne.montant_cumule / epargne.montant_total) * 100);

        // Vérifier si l'objectif est atteint
        if (epargne.montant_cumule >= epargne.montant_total && epargne.statut !== 'termine') {
            epargne.statut = 'termine';
            // Calculer les intérêts finaux
            if (epargne.tauxInteret > 0) {
                await calculerInterets(epargne);
            }
        }

        await epargne.save();

        // Créer la transaction
        await TransactionEpargne.create({
            Epargne_id: epargneId,
            type: 'depot',
            montant,
            description: `Dépôt sur l'épargne "${epargne.objectif}"`,
            date: new Date()
        });

        // Optionnel: Transférer depuis le portefeuille source
        if (portefeuilleSourceId) {
            const portefeuille = await Portefeuille.findByPk(portefeuilleSourceId);
            if (portefeuille && portefeuille.solde >= montant) {
                portefeuille.solde -= montant;
                await portefeuille.save();
            }
        }

        // Réponse avec progression
        const progressionData = {
            actuel: epargne.montant_cumule,
            objectif: epargne.montant_total,
            pourcentage: epargne.progression,
            restant: Math.max(0, epargne.montant_total - epargne.montant_cumule),
            objectifAtteint: epargne.montant_cumule >= epargne.montant_total,
            interets: epargne.interetCumule
        };

        res.json({
            message: "Dépôt effectué",
            epargne,
            progression: progressionData,
            celebration: epargne.montant_cumule >= epargne.montant_total
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors du dépôt" });
    }
};

// Retirer d'une épargne
const retirerEpargne = async (req, res) => {
    const clientId = req.user.id;
    const { epargneId } = req.params;
    const { montant, portefeuilleCibleId } = req.body;

    try {
        const epargne = await Epargne.findOne({
            where: { id: epargneId, user_id: clientId }
        });

        if (!epargne) {
            return res.status(404).json({ error: "Épargne introuvable" });
        }

        if (epargne.montant_cumule < montant) {
            return res.status(400).json({ 
                error: "Solde insuffisant",
                disponible: epargne.montant_cumule
            });
        }

        // Mise à jour du montant
        epargne.montant_cumule -= parseFloat(montant);
        
        // Ajuster les intérêts au prorata (si taux > 0)
        if (epargne.tauxInteret > 0 && epargne.interetCumule > 0) {
            const ratio = (epargne.montant_cumule + montant) / (epargne.montant_cumule + montant + epargne.interetCumule);
            epargne.interetCumule = Math.floor(epargne.interetCumule * ratio);
        }

        // Mettre à jour la progression
        epargne.progression = Math.min(100, (epargne.montant_cumule / epargne.montant_total) * 100);

        // Vérifier si le statut doit changer
        if (epargne.montant_cumule < epargne.montant_total && epargne.statut === 'termine') {
            epargne.statut = 'en cours';
        }

        await epargne.save();

        // Créer la transaction
        await TransactionEpargne.create({
            Epargne_id: epargneId,
            type: 'retrait',
            montant,
            description: `Retrait de l'épargne "${epargne.objectif}"`,
            date: new Date()
        });

        // Optionnel: Transférer vers le portefeuille cible
        if (portefeuilleCibleId) {
            const portefeuille = await Portefeuille.findByPk(portefeuilleCibleId);
            if (portefeuille) {
                portefeuille.solde += montant;
                await portefeuille.save();
            }
        }

        res.json({
            message: "Retrait effectué",
            epargne
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors du retrait" });
    }
};

// Calculer les intérêts composés
async function calculerInterets(epargne) {
    const maintenant = new Date();
    const dernierCalcul = epargne.dernierCalculInterets || epargne.date_debut;
    
    // Calculer le nombre de jours depuis le dernier calcul
    const jours = Math.floor((maintenant - new Date(dernierCalcul)) / (1000 * 60 * 60 * 24));
    
    if (jours > 0 && epargne.montant_cumule > 0) {
        // Intérêts composés: I = P * (1 + r/n)^(nt) - P
        // Pour simplifier: intérêts journaliers
        const tauxJournalier = epargne.tauxInteret / 100 / 365;
        const interets = Math.floor(epargne.montant_cumule * tauxJournalier * jours);
        
        epargne.interetCumule += interets;
        epargne.dernierCalculInterets = maintenant;
    }
    
    return epargne;
}

// Obtenir le simulateur d'intérêts
const simulatorInterets = async (req, res) => {
    const { montant, taux, periodeAnnees, frequenceComposition = 'mensuel' } = req.query;

    if (!montant || !taux || !periodeAnnees) {
        return res.status(400).json({ error: "Paramètres manquants" });
    }

    const capital = parseFloat(montant);
    const tauxAnnuel = parseFloat(taux);
    const annees = parseFloat(periodeAnnees);

    // Différentes fréquences de composition
    const frequences = {
        'quotidien': 365,
        'mensuel': 12,
        'trimestriel': 4,
        'annuel': 1
    };

    const n = frequences[frequenceComposition] || 12;
    const tauxPeriodique = tauxAnnuel / n;

    // Calculer le montant final avec intérêts composés
    const montantFinal = capital * Math.pow(1 + tauxPeriodique, n * annees);
    const interetsTotaux = montantFinal - capital;

    // Tableau d'évolution année par année
    const evolution = [];
    for (let annee = 1; annee <= annees; annee++) {
        const valeur = capital * Math.pow(1 + tauxPeriodique, n * annee);
        evolution.push({
            annee,
            valeur: Math.floor(valeur),
            interets: Math.floor(valeur - capital)
        });
    }

    res.json({
        simulation: {
            capitalInitial: capital,
            tauxAnnuel: `${tauxAnnuel}%`,
            periodeAnnees: annees,
            composition: frequenceComposition,
            montantFinal: Math.floor(montantFinal),
            interetsTotaux: Math.floor(interetsTotaux),
            valeurActuelle: Math.floor(capital * Math.pow(1 + tauxAnnuel/100, annees))
        },
        evolution
    });
};

// Obtenir les objectifs d'épargne avec progression
const getEpargnesAvecProgression = async (req, res) => {
    const clientId = req.user.id;
    const { inclureTerminees = true } = req.query;

    try {
        const whereClause = { user_id: clientId };
        
        if (!inclureTerminees) {
            whereClause.statut = { [Op.ne]: 'termine' };
        }

        const epargnes = await Epargne.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']]
        });

        // Enrichir avec les données de progression
        const epargnesCompletees = epargnes.map(epargne => {
            const progression = {
                actuel: epargne.montant_cumule,
                objectif: epargne.montant_total,
                pourcentage: Math.min(100, ((epargne.montant_cumule + epargne.interetCumule) / epargne.montant_total) * 100).toFixed(1),
                restant: Math.max(0, epargne.montant_total - epargne.montant_cumule),
                interets: epargne.interetCumule,
                objectifAtteint: epargne.montant_cumule >= epargne.montant_total,
                joursRestants: epargne.date_fin 
                    ? Math.ceil((new Date(epargne.date_fin) - new Date()) / (1000 * 60 * 60 * 24))
                    : null,
                montantAvecInterets: epargne.montant_cumule + epargne.interetCumule
            };

            return {
                ...epargne.toJSON(),
                progression,
                estCachee: epargne.estSecrete
            };
        });

        // Statistiques globales
        const stats = {
            totalEpargnes: epargnesCompletees.length,
            enCours: epargnesCompletees.filter(e => e.statut === 'en cours').length,
            terminees: epargnesCompletees.filter(e => e.statut === 'termine').length,
            totalAccumule: epargnesCompletees.reduce((sum, e) => sum + e.montant_cumule, 0),
            totalInterets: epargnesCompletees.reduce((sum, e) => sum + e.interetCumule, 0),
            totalObjectifs: epargnesCompletees.reduce((sum, e) => sum + e.montant_total, 0)
        };

        // Filtrer les cacher si l'utilisateur ne veut pas voir les détaillées
        const visibleEpargnes = epargnesCompletees.map(e => {
            if (e.estSecrete) {
                return {
                    ...e,
                    montant_cumule: '***',
                    interetCumule: '***',
                    progression: { ...e.progression, actuel: '***', interets: '***' }
                };
            }
            return e;
        });

        res.json({
            epargnes: visibleEpargnes,
            statistiques: stats
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération" });
    }
};

// ============================================
// ÉPARGNE AUTOMATIQUE (Round-up)
// ============================================

// Configurer l'épargne automatique
const configurerEpargneAutomatique = async (req, res) => {
    const clientId = req.user.id;
    const {
        type = 'arrondi',
        arrondiSuperieur = true,
        pasArrondi = 100,
        montantFixe,
        pourcentageDepot,
        frequence = 'a_chaque_depot',
        portefeuilleCibleId,
        depotMinimal = 100,
        depotMaximal,
        jourDepot,
        notifierArrondi = true
    } = req.body;

    try {
        // Vérifier si une规则 existe déjà
        const existante = await EpargneAutomatique.findOne({
            where: { userId: clientId, estActif: true }
        });

        if (existante) {
            // Mettre à jour l'existante
            existante.type = type;
            existante.arrondiSuperieur = arrondiSuperieur;
            existante.pasArrondi = pasArrondi;
            existante.montantFixe = montantFixe;
            existante.pourcentageDepot = pourcentageDepot;
            existante.frequence = frequence;
            existante.portefeuilleCibleId = portefeuilleCibleId;
            existante.depotMinimal = depotMinimal;
            existante.depotMaximal = depotMaximal;
            existante.jourDepot = jourDepot;
            existante.notifierArrondi = notifierArrondi;
            
            await existante.save();
            
            return res.json({
                message: "Règle d'épargne automatique mise à jour",
                regle: existante
            });
        }

        // Créer une nouvelle règle
        const regle = await EpargneAutomatique.create({
            userId: clientId,
            type,
            arrondiSuperieur,
            pasArrondi,
            montantFixe,
            pourcentageDepot,
            frequence,
            portefeuilleCibleId,
            depotMinimal,
            depotMaximal,
            jourDepot,
            notifierArrondi
        });

        res.status(201).json({
            message: "Règle d'épargne automatique créée",
            regle
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la configuration" });
    }
};

// Obtenir la règle d'épargne automatique
const getEpargneAutomatique = async (req, res) => {
    const clientId = req.user.id;

    try {
        const regle = await EpargneAutomatique.findOne({
            where: { userId: clientId, estActif: true }
        });

        if (!regle) {
            return res.json({
                message: "Aucune règle configurée",
                configuree: false
            });
        }

        res.json({
            configuree: true,
            regle,
            statistiques: {
                totalEpargne: regle.totalEpargne,
                nbOperations: regle.nbOperations,
                dernierArrondi: regle.dernierArrondi
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération" });
    }
};

// Calculer l'arrondi (appelé lors d'un dépôt)
const triggerArrondi = async (req, res) => {
    const clientId = req.user.id;
    const { montantDepense } = req.body;

    try {
        const regle = await EpargneAutomatique.findOne({
            where: { userId: clientId, estActif: true, frequence: 'a_chaque_depot' }
        });

        if (!regle || !montantDepense) {
            return res.json({ applicable: false, raison: "Aucune règle active ou montant invalide" });
        }

        // Vérifier le dépôt minimum
        if (montantDepense < regle.depotMinimal) {
            return res.json({ 
                applicable: false, 
                raison: `Dépôt minimum de ${regle.depotMinimal} non atteint` 
            });
        }

        let montantEpargne = 0;

        switch (regle.type) {
            case 'arrondi':
                // Arrondir au prochain multiple
                const reste = montantDepense % regle.pasArrondi;
                if (regle.arrondiSuperieur && reste > 0) {
                    montantEpargne = regle.pasArrondi - reste;
                } else if (!regle.arrondiSuperieur) {
                    montantEpargne = reste;
                }
                break;
                
            case 'montant_fixe':
                montantEpargne = regle.montantFixe;
                break;
                
            case 'pourcentage_depot':
                montantEpargne = (montantDepense * (regle.pourcentageDepot / 100));
                break;
                
            case 'solde_arrondi':
                // Arrondir le solde restant à 0
                // Cette option nécessite le solde du wallet
                break;
        }

        // Limiter le montant maximum
        if (regle.depotMaximal && montantEpargne > regle.depotMaximal) {
            montantEpargne = regle.depotMaximal;
        }

        // Mettre à jour les statistiques
        if (montantEpargne > 0) {
            regle.totalEpargne += montantEpargne;
            regle.nbOperations += 1;
            regle.dernierArrondi = new Date();
            await regle.save();
        }

        res.json({
            applicable: montantEpargne > 0,
            montantDepense,
            montantEpargne,
            regle: regle.type,
            message: montantEpargne > 0 
                ? `Vous allez épargner ${montantEpargne} XAF automatiquement!`
                : "Aucun arrondi applicable"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors du calcul" });
    }
};

// Activer/désactiver l'épargne automatique
const toggleEpargneAutomatique = async (req, res) => {
    const clientId = req.user.id;
    const { actif } = req.body;

    try {
        const regle = await EpargneAutomatique.findOne({
            where: { userId: clientId }
        });

        if (!regle) {
            return res.status(404).json({ error: "Aucune règle configurée" });
        }

        regle.estActif = actif;
        await regle.save();

        res.json({
            message: actif ? "Épargne automatique activée" : "Épargne automatique désactivée",
            regle
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la modification" });
    }
};

// Supprimer la règle d'épargne automatique
const supprimerEpargneAutomatique = async (req, res) => {
    const clientId = req.user.id;

    try {
        const regle = await EpargneAutomatique.findOne({
            where: { userId: clientId }
        });

        if (!regle) {
            return res.status(404).json({ error: "Aucune règle configurée" });
        }

        await regle.destroy();

        res.json({ message: "Règle d'épargne automatique supprimée" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la suppression" });
    }
};

// ============================================
// TIRE-LIRE (Piggy Bank)
// ============================================

// Créer une tire-lire
const creerTireLire = async (req, res) => {
    const clientId = req.user.id;
    const {
        objectif,
        montant_total,
        date_fin,
        couleur = '#FF6B6B',
        icone = 'piggy-bank',
        motivationQuote,
        estSecrete = false
    } = req.body;

    try {
        const epargne = await Epargne.create({
            objectif,
            date_debut: new Date(),
            date_fin: date_fin ? new Date(date_fin) : null,
            montant_total,
            montant_cumule: 0,
            statut: 'en cours',
            estTireLire: true,
            couleur,
            icone,
            motivationQuote: motivationQuote || CITATIONS[Math.floor(Math.random() * CITATIONS.length)],
            estSecrete,
            progression: 0
        });

        res.status(201).json({
            message: "Tire-lire créée! � piggy-bank",
            tirelire: epargne
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création de la tire-lire" });
    }
};

// Obtenir une citation motivante aléatoire
const getCitationMotivation = async (req, res) => {
    const citation = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
    res.json({ citation });
};

module.exports = {
    creerEpargneAvancee,
    deposerEpargne,
    retirerEpargne,
    simulatorInterets,
    getEpargnesAvecProgression,
    configurerEpargneAutomatique,
    getEpargneAutomatique,
    triggerArrondi,
    toggleEpargneAutomatique,
    supprimerEpargneAutomatique,
    creerTireLire,
    getCitationMotivation
};

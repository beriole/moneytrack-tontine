const { Projet, ProjetCollaborator, Milestone, Categorie, Transaction, depenseProjet } = require('../../models');
const { Op } = require('sequelize');

// ============================================
// PROJETS AVANCÉS - Sous-projets, Collaborateurs, Jalons
// ============================================

// Créer un projet avec jalons
const creerProjetAvance = async (req, res) => {
    const clientId = req.user.id;
    const {
        nom,
        budgetTotall,
        dateDebut,
        dateFinPrevue,
        description,
        objectif,
        estPrive = true,
        jalons // Tableau de jalons
    } = req.body;

    try {
        // Créer le projet
        const projet = await Projet.create({
            nom,
            budgetTotall,
            dateDebut: dateDebut ? new Date(dateDebut) : new Date(),
            dateFinPrevue: dateFinPrevue ? new Date(dateFinPrevue) : null,
            description,
            objectif,
            estPrive,
            etat: 'en cours',
            niveau: 0,
            progression: 0,
            ClientId: clientId
        });

        // Créer les jalons si fournis
        if (jalons && jalons.length > 0) {
            for (let i = 0; i < jalons.length; i++) {
                const jalon = jalons[i];
                await Milestone.create({
                    projetId: projet.id,
                    nom: jalon.nom,
                    description: jalon.description,
                    dateFinPrevue: jalon.dateFinPrevue ? new Date(jalon.dateFinPrevue) : null,
                    budgetAlloue: jalon.budgetAlloue || 0,
                    priorite: jalon.priorite || 'moyenne',
                    ordre: i + 1
                });
            }
        }

        const projetComplet = await Projet.findByPk(projet.id, {
            include: [{ model: Milestone, as: 'jalons' }]
        });

        res.status(201).json({
            message: "Projet créé avec succès",
            projet: projetComplet
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création du projet" });
    }
};

// Créer un sous-projet
const creerSousProjet = async (req, res) => {
    const clientId = req.user.id;
    const { projetParentId } = req.params;
    const {
        nom,
        budgetTotall,
        dateFinPrevue,
        description
    } = req.body;

    try {
        // Vérifier le projet parent
        const projetParent = await Projet.findOne({
            where: { id: projetParentId, ClientId: clientId }
        });

        if (!projetParent) {
            return res.status(404).json({ error: "Projet parent introuvable" });
        }

        // Créer le sous-projet
        const sousProjet = await Projet.create({
            nom,
            budgetTotall,
            dateFinPrevue: dateFinPrevue ? new Date(dateFinPrevue) : null,
            description,
            projetParentId,
            niveau: projetParent.niveau + 1,
            etat: 'en cours',
            progression: 0,
            ClientId: clientId
        });

        res.status(201).json({
            message: "Sous-projet créé",
            sousProjet
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création du sous-projet" });
    }
};

// Lister la hiérarchie des projets
const getHierarchieProjets = async (req, res) => {
    const clientId = req.user.id;

    try {
        // Récupérer tous les projets principaux
        const projetsParents = await Projet.findAll({
            where: { 
                ClientId: clientId,
                projetParentId: null
            },
            include: [
                { model: Projet, as: 'sousProjets' },
                { model: Milestone, as: 'jalons' }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Construire l'arborescence complète
        const hierarchie = await Promise.all(projetsParents.map(async (projet) => {
            // Récupérer tous les descendants récursivement
            const descendants = await getDescendants(projet.id);
            
            // Calculer les totaux
            const tousProjets = [projet, ...descendants];
            const budgetTotal = tousProjets.reduce((sum, p) => sum + p.budgetTotall, 0);
            const depensesTotal = tousProjets.reduce((sum, p) => sum + p.montantDepense, 0);
            const progressionMoyenne = tousProjets.reduce((sum, p) => sum + p.progression, 0) / tousProjets.length;

            return {
                ...projet.toJSON(),
                sousProjets: descendants,
                statistiques: {
                    nombreTotal: tousProjets.length,
                    budgetTotal,
                    depensesTotal,
                    reste: budgetTotal - depensesTotal,
                    progressionMoyenne: progressionMoyenne.toFixed(1)
                }
            };
        }));

        res.json({
            projets: hierarchie,
            totalProjets: hierarchie.length
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération" });
    }
};

// Fonction récursive pour récupérer les descendants
async function getDescendants(parentId) {
    const enfants = await Projet.findAll({
        where: { projetParentId: parentId },
        include: [{ model: Milestone, as: 'jalons' }]
    });

    let descendants = [];
    for (const enfant of enfants) {
        descendants.push(enfant);
        const sousDescendants = await getDescendants(enfant.id);
        descendants = [...descendants, ...sousDescendants];
    }

    return descendants;
}

// ============================================
// COLLABORATEURS
// ============================================

// Inviter un collaborateur
const inviterCollaborateurProjet = async (req, res) => {
    const clientId = req.user.id;
    const { projetId } = req.params;
    const { email, nom, role = 'contributeur', peutDepenser = false, limiteDepense } = req.body;

    try {
        const projet = await Projet.findOne({
            where: { id: projetId, ClientId: clientId }
        });

        if (!projet) {
            return res.status(404).json({ error: "Projet introuvable" });
        }

        const collaborateur = await ProjetCollaborator.create({
            projetId,
            userId: clientId,
            nom,
            email,
            role,
            peutDepenser,
            limiteDepense,
            statut: 'invite'
        });

        // Envoyer l'email d'invitation (à implémenter)
        console.log(`📧 Invitation envoyée à ${email} pour le projet \"${projet.nom}\"`);

        res.status(201).json({
            message: "Collaborateur invité",
            collaborateur
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de l'invitation" });
    }
};

// Répondre à une invitation projet
const repondreInvitationProjet = async (req, res) => {
    const { invitationId } = req.params;
    const { accepter } = req.body;
    const clientId = req.user.id;

    try {
        const invitation = await ProjetCollaborator.findByPk(invitationId);

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

// Lister les collaborateurs
const listerCollaborateursProjet = async (req, res) => {
    const clientId = req.user.id;
    const { projetId } = req.params;

    try {
        const projet = await Projet.findOne({
            where: { id: projetId, ClientId: clientId }
        });

        if (!projet) {
            return res.status(404).json({ error: "Projet introuvable" });
        }

        const collaborateurs = await ProjetCollaborator.findAll({
            where: { projetId }
        });

        // Statistiques des contributions
        const totalContributions = collaborateurs.reduce((sum, c) => sum + c.contribution, 0);

        res.json({
            collaborateurs,
            statistiques: {
                totalCollaborateurs: collaborateurs.length,
                totalContributions,
                acceptes: collaborateurs.filter(c => c.statut === 'accepte').length,
                enAttente: collaborateurs.filter(c => c.statut === 'invite').length
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération" });
    }
};

// Mettre à jour la contribution d'un collaborateur
const mettreAJourContribution = async (req, res) => {
    const { projetId, collaboratorId } = req.params;
    const { contribution } = req.body;
    const clientId = req.user.id;

    try {
        const collaborateur = await ProjetCollaborator.findOne({
            where: { id: collaboratorId, projetId }
        });

        if (!collaborateur) {
            return res.status(404).json({ error: "Collaborateur introuvable" });
        }

        // Vérifier les permissions
        if (collaborateur.userId !== clientId && collaborateur.role !== 'responsable') {
            return res.status(403).json({ error: "Permission refusée" });
        }

        collaborateur.contribution = contribution;
        await collaborateur.save();

        res.json({
            message: "Contribution mise à jour",
            collaborateur
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
};

// ============================================
// JALONS (MILESTONES)
// ============================================

// Créer un jalon
const creerJalon = async (req, res) => {
    const clientId = req.user.id;
    const { projetId } = req.params;
    const {
        nom,
        description,
        dateDebutPrevue,
        dateFinPrevue,
        budgetAlloue,
        priorite = 'moyenne'
    } = req.body;

    try {
        const projet = await Projet.findOne({
            where: { id: projetId, ClientId: clientId }
        });

        if (!projet) {
            return res.status(404).json({ error: "Projet introuvable" });
        }

        // Compter les jalons existants pour l'ordre
        const countJalons = await Milestone.count({ where: { projetId } });

        const jalon = await Milestone.create({
            projetId,
            nom,
            description,
            dateDebutPrevue: dateDebutPrevue ? new Date(dateDebutPrevue) : null,
            dateFinPrevue: dateFinPrevue ? new Date(dateFinPrevue) : null,
            budgetAlloue: budgetAlloue || 0,
            priorite,
            ordre: countJalons + 1,
            statut: 'planifie'
        });

        res.status(201).json({
            message: "Jalon créé",
            jalon
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création du jalon" });
    }
};

// Mettre à jour un jalon
const mettreAJourJalon = async (req, res) => {
    const clientId = req.user.id;
    const { projetId, jalonId } = req.params;
    const {
        nom,
        description,
        dateFinPrevue,
        budgetAlloue,
        progression,
        statut,
        priorite
    } = req.body;

    try {
        const projet = await Projet.findOne({
            where: { id: projetId, ClientId: clientId }
        });

        if (!projet) {
            return res.status(404).json({ error: "Projet introuvable" });
        }

        const jalon = await Milestone.findOne({
            where: { id: jalonId, projetId }
        });

        if (!jalon) {
            return res.status(404).json({ error: "Jalon introuvable" });
        }

        // Mettre à jour les champs
        if (nom) jalon.nom = nom;
        if (description) jalon.description = description;
        if (dateFinPrevue) jalon.dateFinPrevue = new Date(dateFinPrevue);
        if (budgetAlloue) jalon.budgetAlloue = budgetAlloue;
        if (priorite) jalon.priorite = priorite;
        
        if (progression !== undefined) {
            jalon.progression = progression;
            if (progression >= 100) {
                jalon.statut = 'termine';
                jalon.dateFinReelle = new Date();
            } else if (progression > 0) {
                jalon.statut = 'en_cours';
            }
        }
        
        if (statut) jalon.statut = statut;

        await jalon.save();

        // Mettre à jour la progression du projet
        await mettreAJourProgressionProjet(projetId);

        res.json({
            message: "Jalon mis à jour",
            jalon
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
};

// Fonction pour mettre à jour la progression du projet
async function mettreAJourProgressionProjet(projetId) {
    const jalons = await Milestone.findAll({ where: { projetId } });
    
    if (jalons.length === 0) return;

    const progressionMoyenne = jalons.reduce((sum, j) => sum + j.progression, 0) / jalons.length;
    
    await Projet.update(
        { progression: progressionMoyenne },
        { where: { id: projetId } }
    );
}

// Obtenir la timeline (Gantt simplifié)
const getTimelineProjet = async (req, res) => {
    const clientId = req.user.id;
    const { projetId } = req.params;

    try {
        const projet = await Projet.findOne({
            where: { id: projetId, ClientId: clientId },
            include: [
                { model: Milestone, as: 'jalons', order: [['ordre', 'ASC']] },
                { model: Projet, as: 'sousProjets' }
            ]
        });

        if (!projet) {
            return res.status(404).json({ error: "Projet introuvable" });
        }

        // Construire la timeline
        const timeline = {
            projet: {
                id: projet.id,
                nom: projet.nom,
                dateDebut: projet.dateDebut,
                dateFinPrevue: projet.dateFinPrevue,
                progression: projet.progression,
                etat: projet.etat
            },
            jalons: projet.jalons.map(jalon => ({
                id: jalon.id,
                nom: jalon.nom,
                dateDebutPrevue: jalon.dateDebutPrevue,
                dateFinPrevue: jalon.dateFinPrevue,
                dateFinReelle: jalon.dateFinReelle,
                progression: jalon.progression,
                statut: jalon.statut,
                priorite: jalon.priorite,
                budgetAlloue: jalon.budgetAlloue,
                depenses: jalon.depenses,
                enRetard: jalon.dateFinPrevue && new Date() > new Date(jalon.dateFinPrevue) && jalon.statut !== 'termine'
            })),
            sousProjets: projet.sousProjets.map(sp => ({
                id: sp.id,
                nom: sp.nom,
                progression: sp.progression,
                etat: sp.etat,
                dateFinPrevue: sp.dateFinPrevue
            }))
        };

        // Calculer les statistiques de la timeline
        const totalJalons = projet.jalons.length;
        const termines = projet.jalons.filter(j => j.statut === 'termine').length;
        const enRetard = projet.jalons.filter(j => 
            j.dateFinPrevue && new Date() > new Date(j.dateFinPrevue) && j.statut !== 'termine'
        ).length;

        timeline.statistiques = {
            totalJalons,
            termines,
            enRetard,
            enCours: totalJalons - termines - enRetard,
            pourcentageTermine: totalJalons > 0 ? ((termines / totalJalons) * 100).toFixed(1) : 0
        };

        res.json(timeline);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération de la timeline" });
    }
};

// Supprimer un jalon
const supprimerJalon = async (req, res) => {
    const clientId = req.user.id;
    const { projetId, jalonId } = req.params;

    try {
        const projet = await Projet.findOne({
            where: { id: projetId, ClientId: clientId }
        });

        if (!projet) {
            return res.status(404).json({ error: "Projet introuvable" });
        }

        const jalon = await Milestone.findOne({
            where: { id: jalonId, projetId }
        });

        if (!jalon) {
            return res.status(404).json({ error: "Jalon introuvable" });
        }

        if (jalon.statut === 'termine') {
            return res.status(400).json({ error: "Impossible de supprimer un jalon terminé" });
        }

        await jalon.destroy();

        res.json({ message: "Jalon supprimé" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la suppression" });
    }
};

module.exports = {
    // Projets
    creerProjetAvance,
    creerSousProjet,
    getHierarchieProjets,
    
    // Collaborateurs
    inviterCollaborateurProjet,
    repondreInvitationProjet,
    listerCollaborateursProjet,
    mettreAJourContribution,
    
    // Jalons
    creerJalon,
    mettreAJourJalon,
    getTimelineProjet,
    supprimerJalon
};

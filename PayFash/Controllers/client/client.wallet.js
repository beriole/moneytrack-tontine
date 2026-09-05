const { Portefeuille, Transaction } = require('../../models');
const { Op } = require('sequelize');

// ============================================
// FONCTIONNALITÉS DE BASE (existantes)
// ============================================

// Afficher le solde de tous les portefeuilles d'un client
const solde = async (req, res) => {
    const clientId = req.user.id;
    try {
        const portefeuilles = await Portefeuille.findAll({
            where: { ClientPortefeuilleId: clientId, estActif: true }
        });

        const totalSolde = portefeuilles.reduce((acc, p) => {
            return acc + p.solde;
        }, 0);

        res.status(200).json({
            message: "Solde des comptes de l'utilisateur",
            totalSolde,
            totalDevises: [...new Set(portefeuilles.map(p => p.devise))],
            portefeuilleParDevise: portefeuilles.reduce((acc, p) => {
                if (!acc[p.devise]) acc[p.devise] = 0;
                acc[p.devise] += p.solde;
                return acc;
            }, {}),
            portefeuilles: portefeuilles
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Depot sur un portefeuille — NEUTRALISE.
//
// Cette fonction faisait « portefeuille.solde += montant » derriere un
// simple verifyToken : elle creait de la monnaie a partir de rien. Tant
// qu'aucun retrait reel n'existait, la faille restait theorique. Depuis
// que /paiement/retrait verse vraiment sur un compte Mobile Money, c'est
// devenu un chemin direct pour se crediter puis encaisser.
//
// L'argent n'entre desormais que par /paiement/recharge, ou le solde ne
// bouge qu'apres confirmation du paiement aupres de Fapshi.
const depot = async (req, res) => {
  return res.status(410).json({
    error: "Cette route ne credite plus de portefeuille. Utilisez /paiement/recharge : le solde n'est credite qu'apres un paiement Mobile Money confirme.",
    remplacee_par: "POST /paiement/recharge"
  });
};

// Retrait depuis un portefeuille — NEUTRALISE.
//
// Symetrique du depot : elle diminuait le solde sans qu'aucun argent ne
// sorte reellement. L'utilisateur perdait son solde sans rien recevoir.
//
// Les retraits passent desormais par /paiement/retrait, qui reserve les
// fonds puis demande un versement Mobile Money a Fapshi — et rembourse
// automatiquement si le fournisseur refuse.
const retrait = async (req, res) => {
  return res.status(410).json({
    error: "Cette route ne debite plus de portefeuille. Utilisez /paiement/retrait pour un versement Mobile Money reel.",
    remplacee_par: "POST /paiement/retrait"
  });
};

// Transfert entre portefeuilles d'un même client
const transfer = async (req, res) => {
  const { fromType, toType, montant, fromWalletId, toWalletId } = req.body;
  const clientId = req.user.id;

  if (!montant || montant <= 0) 
    return res.status(400).json({ error: "Montant invalide" });

  try {
    let fromPortefeuille, toPortefeuille;
    
    // Récupérer le portefeuille source
    if (fromWalletId) {
        fromPortefeuille = await Portefeuille.findOne({ 
            where: { id: fromWalletId, ClientPortefeuilleId: clientId, estActif: true } 
        });
    } else {
        fromPortefeuille = await Portefeuille.findOne({ 
            where: { ClientPortefeuilleId: clientId, typePortefeuille: fromType, estActif: true } 
        });
    }
    
    // Récupérer le portefeuille destination
    if (toWalletId) {
        toPortefeuille = await Portefeuille.findOne({ 
            where: { id: toWalletId, ClientPortefeuilleId: clientId, estActif: true } 
        });
    } else {
        toPortefeuille = await Portefeuille.findOne({ 
            where: { ClientPortefeuilleId: clientId, typePortefeuille: toType, estActif: true } 
        });
    }

    if (!fromPortefeuille || !toPortefeuille) 
      return res.status(404).json({ error: "Portefeuille introuvable" });

    if (fromPortefeuille.id === toPortefeuille.id)
        return res.status(400).json({ error: "Impossible de transférer vers le même portefeuille" });

    if (fromPortefeuille.solde < montant) 
      return res.status(400).json({ error: "Solde insuffisant", disponible: fromPortefeuille.solde });

    // Transaction
    await Portefeuille.sequelize.transaction(async (t) => {
      fromPortefeuille.solde -= parseFloat(montant);
      toPortefeuille.solde += parseFloat(montant);

      await fromPortefeuille.save({ transaction: t });
      await toPortefeuille.save({ transaction: t });

      await Transaction.bulkCreate([
        { 
            type: 'transfert_sortant', 
            montant, 
            date: new Date(),
            statut: 'Succès',
            description: `Transfert de ${montant} vers "${toPortefeuille.nom || toPortefeuille.typePortefeuille}"`,
            ClientTransactionId: clientId 
        },
        { 
            type: 'transfert_entrant', 
            montant, 
            date: new Date(),
            statut: 'Succès',
            description: `Transfert de ${montant} depuis "${fromPortefeuille.nom || fromPortefeuille.typePortefeuille}"`,
            ClientTransactionId: clientId 
        }
      ], { transaction: t });
    });

    return res.status(201).json({
      message: `Transfert de ${montant} ${fromPortefeuille.devise} de "${fromPortefeuille.nom || fromType}" vers "${toPortefeuille.nom || toType}" effectué avec succès`,
      fromPortefeuille,
      toPortefeuille
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Historique des transactions d'un client
const transaction = async (req, res) => {
    const clientId = req.user.id;
    const { portefeuilleId, type, dateDebut, dateFin, limit = 50, offset = 0 } = req.query;

    try {
        const whereClause = { ClientTransactionId: clientId };
        
        // Filtrer par portefeuille si spécifié
        if (portefeuilleId) {
            whereClause.PortefeuilleId = portefeuilleId;
        }
        
        // Filtrer par type de transaction
        if (type) {
            whereClause.type = type;
        }
        
        // Filtrer par date
        if (dateDebut || dateFin) {
            whereClause.date = {};
            if (dateDebut) whereClause.date[Op.gte] = new Date(dateDebut);
            if (dateFin) whereClause.date[Op.lte] = new Date(dateFin);
        }

        const transactions = await Transaction.findAndCountAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Statistiques
        const stats = await Transaction.findAll({
            where: { ClientTransactionId: clientId },
            attributes: [
                'type',
                [require('sequelize').fn('SUM', require('sequelize').col('montant')), 'total']
            ],
            group: ['type'],
            raw: true
        });

        res.json({ 
            transactions: transactions.rows,
            total: transactions.count,
            page: Math.floor(offset / limit) + 1,
            totalPages: Math.ceil(transactions.count / limit),
            statistiques: stats
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// NOUVELLES FONCTIONNALITÉS (Sous-comptes illimités)
// ============================================

// Créer un nouveau portefeuille personnalisé
const creerPortefeuille = async (req, res) => {
    const clientId = req.user.id;
    const { 
        nom, 
        devise = 'XAF', 
        typePortefeuille = 'autre',
        objectifMontant,
        objectifDate,
        description,
        couleur,
        icone,
        estPrincipal = false
    } = req.body;

    try {
        // Vérifier le nombre de portefeuilles
        const countPortefeuilles = await Portefeuille.count({
            where: { ClientPortefeuilleId: clientId, estActif: true }
        });

        // Limite de 20 portefeuilles par utilisateur
        if (countPortefeuilles >= 20) {
            return res.status(400).json({ 
                error: "Limite de 20 portefeuilles atteinte",
                conseils: "Vous pouvez désactiver des portefeuille existants pour en créer de nouveaux"
            });
        }

        // Créer le portefeuille
        const portefeuille = await Portefeuille.create({
            nom: nom || `${typePortefeuille} ${countPortefeuilles + 1}`,
            devise,
            typePortefeuille,
            estPrincipal,
            objectifMontant: objectifMontant || null,
            objectifDate: objectifDate ? new Date(objectifDate) : null,
            description,
            couleur: couleur || '#3498db',
            icone: icone || 'wallet',
            ClientPortefeuilleId: clientId
        });

        res.status(201).json({
            message: "Portefeuille créé avec succès",
            portefeuille
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création du portefeuille" });
    }
};

// Obtenir les détails d'un portefeuille spécifique
const getPortefeuilleDetails = async (req, res) => {
    const clientId = req.user.id;
    const { walletId } = req.params;

    try {
        const portefeuille = await Portefeuille.findOne({
            where: { id: walletId, ClientPortefeuilleId: clientId }
        });

        if (!portefeuille) {
            return res.status(404).json({ error: "Portefeuille introuvable" });
        }

        // Obtenir les dernières transactions
        const dernieresTransactions = await Transaction.findAll({
            where: { ClientTransactionId: clientId },
            order: [['createdAt', 'DESC']],
            limit: 10
        });

        // Calculer le progreso vers l'objectif
        let progresObjectif = null;
        if (portefeuille.objectifMontant) {
            progresObjectif = {
                actuel: portefeuille.solde,
                objectif: portefeuille.objectifMontant,
                pourcentage: Math.min(100, (portefeuille.solde / portefeuille.objectifMontant) * 100).toFixed(2),
                restant: Math.max(0, portefeuille.objectifMontant - portefeuille.solde),
                dateLimite: portefeuille.objectifDate
            };
        }

        res.json({
            portefeuille,
            progresObjectif,
            dernieresTransactions
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Modifier un portefeuille
const modifierPortefeuille = async (req, res) => {
    const clientId = req.user.id;
    const { walletId } = req.params;
    const { 
        nom, 
        devise, 
        typePortefeuille, 
        estPrincipal,
        objectifMontant,
        objectifDate,
        description,
        couleur,
        icone
    } = req.body;

    try {
        const portefeuille = await Portefeuille.findOne({
            where: { id: walletId, ClientPortefeuilleId: clientId }
        });

        if (!portefeuille) {
            return res.status(404).json({ error: "Portefeuille introuvable" });
        }

        // Mettre à jour les champs fournis
        if (nom !== undefined) portefeuille.nom = nom;
        if (devise !== undefined) portefeuille.devise = devise;
        if (typePortefeuille !== undefined) portefeuille.typePortefeuille = typePortefeuille;
        if (estPrincipal !== undefined) portefeuille.estPrincipal = estPrincipal;
        if (objectifMontant !== undefined) portefeuille.objectifMontant = objectifMontant;
        if (objectifDate !== undefined) portefeuille.objectifDate = objectifDate ? new Date(objectifDate) : null;
        if (description !== undefined) portefeuille.description = description;
        if (couleur !== undefined) portefeuille.couleur = couleur;
        if (icone !== undefined) portefeuille.icone = icone;

        await portefeuille.save();

        res.json({
            message: "Portefeuille mis à jour avec succès",
            portefeuille
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Supprimer/désactiver un portefeuille
const supprimerPortefeuille = async (req, res) => {
    const clientId = req.user.id;
    const { walletId } = req.params;
    const { hardDelete = false } = req.query;

    try {
        const portefeuille = await Portefeuille.findOne({
            where: { id: walletId, ClientPortefeuilleId: clientId }
        });

        if (!portefeuille) {
            return res.status(404).json({ error: "Portefeuille introuvable" });
        }

        // Vérifier si le portefeuille a un solde
        if (portefeuille.solde > 0 && !hardDelete) {
            return res.status(400).json({ 
                error: "Le portefeuille contient encore des fonds",
                solde: portefeuille.solde,
                conseil: "Transférez les fonds vers un autre portefeuille avant de supprimer"
            });
        }

        if (hardDelete) {
            await portefeuille.destroy();
            return res.json({ message: "Portefeuille supprimé définitivement" });
        }

        // Désactivation douce
        portefeuille.estActif = false;
        await portefeuille.save();

        res.json({ 
            message: "Portefeuille désactivé (soft delete)",
            portefeuilleId: walletId
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Lister tous les portefeuille avec filtres
const listerPortefeuilles = async (req, res) => {
    const clientId = req.user.id;
    const { type, devise, inclureInactifs = false, limit = 20, offset = 0 } = req.query;

    try {
        const whereClause = { ClientPortefeuilleId: clientId };
        
        if (!inclureInactifs) {
            whereClause.estActif = true;
        }
        if (type) {
            whereClause.typePortefeuille = type;
        }
        if (devise) {
            whereClause.devise = devise;
        }

        const portfefeuilles = await Portefeuille.findAndCountAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Statistiques par type
        const statsParType = await Portefeuille.findAll({
            where: { ClientPortefeuilleId: clientId, estActif: true },
            attributes: [
                'typePortefeuille',
                'devise',
                [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
                [require('sequelize').fn('SUM', require('sequelize').col('solde')), 'total']
            ],
            group: ['typePortefeuille', 'devise'],
            raw: true
        });

        res.json({
            portefeuille: portfefeuilles.rows,
            total: portfefeuilles.count,
            statistiquesParType: statsParType
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Définir un objectif d'épargne pour un portefeuille
const setObjectifEpargne = async (req, res) => {
    const clientId = req.user.id;
    const { walletId } = req.params;
    const { objectifMontant, objectifDate, notification = true } = req.body;

    try {
        const portefeuille = await Portefeuille.findOne({
            where: { id: walletId, ClientPortefeuilleId: clientId, estActif: true }
        });

        if (!portefeuille) {
            return res.status(404).json({ error: "Portefeuille introuvable" });
        }

        if (!objectifMontant || objectifMontant <= 0) {
            return res.status(400).json({ error: "Montant objectif invalide" });
        }

        portefeuille.objectifMontant = objectifMontant;
        if (objectifDate) {
            portefeuille.objectifDate = new Date(objectifDate);
        }
        await portefeuille.save();

        const pourcentage = ((portefeuille.solde / objectifMontant) * 100).toFixed(2);

        res.json({
            message: "Objectif d'épargne défini",
            portefeuille,
            progres: {
                actuel: portefeuille.solde,
                objectif: objectifMontant,
                pourcentage,
                restant: objectifMontant - portefeuille.solde,
                dateLimite: portefeuille.objectifDate
            },
            notificationActive: notification
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Vérifier les objectifs atteints
const checkObjectifsAtteints = async (req, res) => {
    const clientId = req.user.id;

    try {
        const portefeuille = await Portefeuille.findAll({
            where: { 
                ClientPortefeuilleId: clientId, 
                estActif: true,
                objectifMontant: { [Op.gt]: 0 }
            }
        });

        const objectifs = portfefeuilles.map(p => ({
            id: p.id,
            nom: p.nom || p.typePortefeuille,
            actuel: p.solde,
            objectif: p.objectifMontant,
            pourcentage: Math.min(100, (p.solde / p.objectifMontant) * 100).toFixed(2),
            atteint: p.solde >= p.objectifMontant,
            dateLimite: p.objectifDate
        }));

        const atteints = objectifs.filter(o => o.atteint);
        const enCours = objectifs.filter(o => !o.atteint);

        res.json({
            total: objectifs.length,
            atteints,
            enCours,
            resume: {
                atteinte: atteints.length,
                enCours: enCours.length
            }
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    // Fonctions existantes
    solde,
    depot,
    retrait,
    transfer,
    transaction,
    // Nouvelles fonctions
    creerPortefeuille,
    getPortefeuilleDetails,
    modifierPortefeuille,
    supprimerPortefeuille,
    listerPortefeuilles,
    setObjectifEpargne,
    checkObjectifsAtteints
};

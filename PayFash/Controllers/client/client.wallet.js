const { Portefeuille, Transaction } = require('../../models');
const { STATUTS } = require('../../services/statutTransaction');
const { Op } = require('sequelize');
const Fonds = require('../../services/fonds.service');

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
        // Le solde ne dit plus tout : une part peut etre bloquee en
        // garantie. Elle reste au client — elle compte dans son total —
        // mais ne peut pas sortir. L'ecran doit pouvoir le montrer.
        const totalBloque = Fonds.arrondir(portefeuilles.reduce((acc, p) => acc + Fonds.reserve(p), 0));

        res.status(200).json({
            message: "Solde des comptes de l'utilisateur",
            totalSolde,
            totalDisponible: Fonds.arrondir(totalSolde - totalBloque),
            totalBloque,
            totalDevises: [...new Set(portefeuilles.map(p => p.devise))],
            portefeuilleParDevise: portefeuilles.reduce((acc, p) => {
                if (!acc[p.devise]) acc[p.devise] = 0;
                acc[p.devise] += p.solde;
                return acc;
            }, {}),
            portefeuilles: portefeuilles.map(p => ({ ...p.toJSON(), ...Fonds.etat(p) }))
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

  // Sans identifiant ni type, la clause WHERE partait avec une valeur
  // undefined et Sequelize levait une erreur opaque en 500.
  if ((!fromWalletId && !fromType) || (!toWalletId && !toType)) {
    return res.status(400).json({
      error: "Precisez la source et la destination (fromWalletId/toWalletId, ou fromType/toType)"
    });
  }

  try {
    // Chargement, controle du solde et ecritures dans UNE SEULE transaction,
    // sur des lignes verrouillees. Auparavant le solde etait lu hors
    // transaction et sauve dedans sans verrou : deux transferts simultanes
    // passaient tous les deux le controle et pouvaient vider le portefeuille
    // au-dela de son solde.
    const { fromPortefeuille, toPortefeuille } = await Portefeuille.sequelize.transaction(async (t) => {
      const verrou = { transaction: t, lock: t.LOCK.UPDATE };
      const base = { ClientPortefeuilleId: clientId, estActif: true };

      const fromPortefeuille = await Portefeuille.findOne({
        where: fromWalletId
          ? { ...base, id: fromWalletId }
          : { ...base, typePortefeuille: fromType },
        ...verrou
      });

      const toPortefeuille = await Portefeuille.findOne({
        where: toWalletId
          ? { ...base, id: toWalletId }
          : { ...base, typePortefeuille: toType },
        ...verrou
      });

      if (!fromPortefeuille || !toPortefeuille) {
        throw Object.assign(new Error("Portefeuille introuvable"), { statut: 404 });
      }
      if (fromPortefeuille.id === toPortefeuille.id) {
        throw Object.assign(new Error("Impossible de transférer vers le même portefeuille"), { statut: 400 });
      }
      // Le disponible, pas le solde : la regle vit dans fonds.service, la
      // meme pour toutes les sorties. Un transfert ne doit pas pouvoir
      // vider un portefeuille epargne de sa part bloquee en garantie.
      try {
        await Fonds.transferer(fromPortefeuille, toPortefeuille, montant, t, {
            type: 'transfert', clientId: fromPortefeuille.ClientPortefeuilleId,
            description: `Transfert ${fromPortefeuille.nom || ''} vers ${toPortefeuille.nom || ''}`.trim()
        });
      } catch (e) {
        if (e instanceof Fonds.ErreurFonds) {
          throw Object.assign(new Error(e.message), { statut: e.code, ...e.details });
        }
        throw e;
      }

      await Transaction.bulkCreate([
        { 
            type: 'transfert_sortant', 
            montant, 
            date: new Date(),
            statut: STATUTS.SUCCESS,
            description: `Transfert de ${montant} vers "${toPortefeuille.nom || toPortefeuille.typePortefeuille}"`,
            ClientTransactionId: clientId 
        },
        { 
            type: 'transfert_entrant', 
            montant, 
            date: new Date(),
            statut: STATUTS.SUCCESS,
            description: `Transfert de ${montant} depuis "${fromPortefeuille.nom || fromPortefeuille.typePortefeuille}"`,
            ClientTransactionId: clientId 
        }
      ], { transaction: t });

      return { fromPortefeuille, toPortefeuille };
    });

    return res.status(201).json({
      message: `Transfert de ${montant} ${fromPortefeuille.devise} de "${fromPortefeuille.nom || fromType}" vers "${toPortefeuille.nom || toType}" effectué avec succès`,
      fromPortefeuille,
      toPortefeuille
    });
  } catch (error) {
    // Les refus metier remontent avec leur code : un solde insuffisant n'est
    // pas une erreur serveur.
    if (error.statut) {
      const corps = { error: error.message };
      if (error.disponible !== undefined) corps.disponible = error.disponible;
      return res.status(error.statut).json(corps);
    }
    return res.status(500).json({ error: error.message });
  }
};

// Historique des transactions d'un client
const transaction = async (req, res) => {
    const clientId = req.user.id;
    const { portefeuilleId, type, dateDebut, dateFin, limit = 50, offset = 0 } = req.query;

    try {
        const whereClause = { ClientTransactionId: clientId };

        // Le grand livre n'a pas de dimension "portefeuille" : une ecriture
        // est rattachee au client, pas au sous-compte. Filtrer dessus
        // produisait une erreur SQL sur une colonne inexistante. On le dit
        // plutot que d'ignorer silencieusement le filtre demande.
        if (portefeuilleId) {
            return res.status(400).json({
                error: "Le filtre par portefeuille n'est pas disponible : les transactions sont rattachees au client, pas a un sous-compte."
            });
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
        // Une caisse de tontine n'appartient a aucun client : elle est creee
        // par le module tontine, sans proprietaire. Laisser un client s'en
        // fabriquer une polluait l'encours des caisses du back-office et
        // brouillait les regles qui refusent d'operer sur ce type.
        if (typePortefeuille === 'tontine') {
            return res.status(400).json({
                error: "Le type « tontine » est reserve aux caisses de groupe, creees par le module tontine."
            });
        }

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
        if (typePortefeuille !== undefined) {
            if (typePortefeuille === 'tontine') {
                return res.status(400).json({
                    error: "Le type « tontine » est reserve aux caisses de groupe."
                });
            }
            portefeuille.typePortefeuille = typePortefeuille;
        }
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
    // req.query ne contient que des chaines : "false" est truthy. Sans cette
    // conversion, ?hardDelete=false sautait le garde-fou "le portefeuille
    // contient encore des fonds" ET declenchait la suppression definitive.
    const hardDelete = ['1', 'true', 'oui'].includes(String(req.query.hardDelete || '').toLowerCase());

    try {
        const portefeuille = await Portefeuille.findOne({
            where: { id: walletId, ClientPortefeuilleId: clientId }
        });

        if (!portefeuille) {
            return res.status(404).json({ error: "Portefeuille introuvable" });
        }

        // Des fonds bloques garantissent une obligation : aucun mode de
        // suppression ne doit les faire disparaitre avec le portefeuille.
        if (Fonds.reserve(portefeuille) > 0) {
            return res.status(409).json({
                error: "Ce portefeuille porte des fonds bloques en garantie : il ne peut pas etre supprime",
                bloque: Fonds.reserve(portefeuille)
            });
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

        const objectifs = portefeuille.map(p => ({
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

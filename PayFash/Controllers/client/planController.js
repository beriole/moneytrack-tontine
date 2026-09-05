const { Plan, detailPlan, Client } = require('../../models/index');
const Paiement = require("../../models/model.paiement");

// Lister tous les plans disponibles avec leurs détails
const listerPlans = async (req, res) => {
  try {
    const plans = await Plan.findAll({
      include: [{ model: detailPlan }] // grâce au belongsToMany
    });
    res.status(200).json(plans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la récupération des plans" });
  }
};

// Récupérer un plan spécifique avec ses détails
const getPlanById = async (req, res) => {
  const { planId } = req.params;
  try {
    const plan = await Plan.findByPk(planId, {
      include: [{ model: detailPlan }]
    });
    if (!plan) return res.status(404).json({ message: "Plan introuvable" });
    res.status(200).json(plan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Souscrire à un plan
const souscrirePlan = async (req, res) => {
  const clientId = req.user.id;
  const { planId } = req.body;

  try {
    const client = await Client.findByPk(clientId);
    if (!client) return res.status(404).json({ message: "Client introuvable" });

    const plan = await Plan.findByPk(planId);
    if (!plan) return res.status(404).json({ message: "Plan introuvable" });

    // Vérifier si le client a déjà un plan
    if (client.planId) {
      return res.status(400).json({ message: "Vous avez déjà un plan actif. Veuillez renouveler." });
    }

    // Associer le plan au client
    await client.update({ planId: plan.id });

    res.status(200).json({ message: `Souscription au plan ${plan.nom} réussie!`, plan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la souscription au plan" });
  }
};

// Renouveler un plan
const renouvelerPlan = async (req, res) => {
  const clientId = req.user.id;
  const { planId } = req.body;

  try {
    const client = await Client.findByPk(clientId);
    if (!client) return res.status(404).json({ message: "Client introuvable" });

    const plan = await Plan.findByPk(planId);
    if (!plan) return res.status(404).json({ message: "Plan introuvable" });

    // Mettre à jour le plan du client
    await client.update({ planId: plan.id });

    res.status(200).json({ message: `Plan renouvelé vers ${plan.nom} avec succès!`, plan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors du renouvellement du plan" });
  }
};

// Ajouter un plan (Admin)
const creerPlan = async (req, res) => {
  const { nom, description, prix, details } = req.body;
  try {
    const plan = await Plan.create({ nom, description, prix });

    if (details && Array.isArray(details)) {
      // Créer ou récupérer les détails et les lier au plan
      for (let d of details) {
        let dp = await detailPlan.findOne({ where: { detail: d } });
        if (!dp) {
          dp = await detailPlan.create({ detail: d });
        }
        await plan.addDetailPlan(dp); // association N-N
      }
    }

    res.status(201).json({ message: "Plan créé avec succès", plan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la création du plan" });
  }
};
 

// Enregistrer un paiement
const enregistrerPaiement = async (req, res) => {
  try {
    console.log(req.body)
    const { planId, montant, payToken, status, motif } = req.body;
    const clientId=req.user.id;
    // Vérification des champs obligatoires
    if (!clientId || !planId || !montant || !payToken || !status) {
      return res.status(400).json({ message: "Champs obligatoires manquants" });
    }

    // Vérifier si le client existe
    const client = await Client.findByPk(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client introuvable" });
    }

    // Création du paiement
    const paiement = await Paiement.create({
      type: "achat",          // type par défaut
      montant,
      date: new Date(),
      payToken,
      status,
      motif: motif || "paiement",
      ClientId: clientId      // clé étrangère vers le client
    });
    client.planId=planId;
    await client.save();

    res.status(201).json({
      message: "Paiement enregistré avec succès",
      paiement
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur lors de l'enregistrement du paiement" });
  }
};



module.exports = {
 enregistrerPaiement,
  listerPlans,
  getPlanById,
  souscrirePlan,
  renouvelerPlan,
  creerPlan
};

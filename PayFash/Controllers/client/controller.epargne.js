const Epargne = require('../../models/model.epargne');
const TransactionEpargne = require('../../models/model.TransactionEpargne');



const creerEpargne = async (req, res) => {
  try {
    const {  objectif, date_debut, date_fin, montant_total } = req.body;
    const userId=req.user.id;
    const epargne = await Epargne.create({
      objectif,
      date_debut,
      date_fin,
      montant_total,
      user_id: userId
    });

    return res.status(201).json({ succes: "Épargne créée avec succès", epargne });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ echec: "Erreur lors de la création de l'épargne" });
  }
};


const listerEpargnes = async (req, res) => {
  try {

    const userId=req.user.id;

    const epargnes = await Epargne.findAll({
      where: { user_id: userId },
      include: [{ model: TransactionEpargne }]
    });
    console.log(epargnes);
    return res.status(200).json(epargnes);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ echec: "Erreur lors de la récupération des épargnes" });
  }
};


const ajouterTransaction = async (req, res) => {
  try {
    const { epargneId } = req.params;
    const { montant, description } = req.body;

    const epargne = await Epargne.findByPk(epargneId);
    if (!epargne) return res.status(404).json({ echec: "Épargne introuvable" });

    const transaction = await TransactionEpargne.create({
      montant,
      description,
      Epargne_id: epargneId
    });

  
    epargne.montant_cumule += parseFloat(montant);

    if (epargne.montant_cumule >= epargne.montant_total) {
      epargne.statut = "termine";
    }

    await epargne.save();

    return res.status(201).json({ succes: "Transaction ajoutée avec succès", transaction, epargne });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ echec: "Erreur lors de l'ajout de la transaction" });
  }
};


const supprimerEpargne = async (req, res) => {
  try {
    const { epargneId } = req.params;

    await TransactionEpargne.destroy({ where: { Epargne_id: epargneId } });
    await Epargne.destroy({ where: { id: epargneId } });

    return res.status(200).json({ succes: "Épargne supprimée avec succès" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ echec: "Erreur lors de la suppression de l'épargne" });
  }
};


const getStatistiquesEpargne = async (req, res) => {
  try {
    const { epargneId } = req.params;

    const epargne = await Epargne.findByPk(epargneId, {
      include: [TransactionEpargne]
    });

    if (!epargne) return res.status(404).json({ echec: "Épargne introuvable" });

    let totalTransactions = 0;
    epargne.TransactionEpargnes.forEach(tx => {
      totalTransactions += parseFloat(tx.montant);
    });

    return res.status(200).json({
      objectif: epargne.montant_total,
      cumulé: epargne.montant_cumule,
      restant: epargne.montant_total - epargne.montant_cumule,
      statut: epargne.statut,
      transactions: epargne.TransactionEpargnes
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ echec: "Erreur lors de la récupération des statistiques" });
  }
};

module.exports = {
  creerEpargne,
  listerEpargnes,
  ajouterTransaction,
  supprimerEpargne,
  getStatistiquesEpargne
};

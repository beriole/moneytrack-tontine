const { where } = require('sequelize');
const Budget=require('../../models/model.budget');
const Categorie=require('../../models/model.categorie');
const Projet =require('../../models/model.projet');
const depense =require('../../models/model.depenses');
const Portefeuille=require('../../models/model.portefeuile');
const Transaction=require('../../models/models.transaction')
const depenseProjet=require('../../models/models.depenseProjet');
const TransactionDepenseProjet=require('../../models/model.TransactionDepenseProjet');
const budgets=async (req,res)=> {
 const {id} =req.user;
try {
    const tableBudget= await Budget.findAll({where:{
    ClientBudgetId:id
     },include:Categorie});
    res.status(200).json(tableBudget);
} catch (error) {
    res.status(500).json({message:"erreur de recuperation"});
}
}
const creerBudget= async (req,res)=> {
 const { nom,montantAllouer,periodeDebut,periodeFin,categories}=req.body;
 console.log(req.body);
 const id=req.user.id;
 try {
    console.log(Budget);
    const ajouter= await  Budget.create({
        nom:nom,
        montantAllouer:montantAllouer,
        periodeDebut:periodeDebut,
        periodeFin:periodeFin,
        ClientBudgetId:id
    });
    let montant=0;
    for (let element of categories){
    if (element.montant === undefined || element.montant === null) {
            return res.status(400).json({ message: `Le montant est obligatoire pour la catégorie "${element.nom}"` });
        }
        const categorie= await Categorie.findOrCreate({where:{nomCategorie:element.nom}, defaults: { description: element.description }});
        const add= await ajouter.addCategorie(categorie[0],{through:{montant:element.montant}});
        montant +=element.montant;
    }
    ajouter.montantAllouer=montant;
     await ajouter.save();
     req.body.montantAllouer=montant;
    res.status(200).json(req.body);
 } catch (error) {
    console.log(error);
    res.status(500).json({message:"une erreur c'est produite"});
 }

}
const ajouter_categorie=async (req,res)=> {
    const budgetNom=req.params.nom;
    const id=req.user.id;
    const {nom, description,montant}=req.body;
    try {
        const trouve= await Categorie.findOrCreate({where:{nomCategorie:nom},defaults:{description:description}});
        const add= await Budget.findOne({where:{nom:budgetNom,ClientBudgetId:id}});
        console.log(budgetNom);
        if(add){
            await add.addCategorie(trouve[0],{through:{montant:montant}});
            add.montantAllouer+=montant;
            await add.save();
            return res.status(200).json({
            succes:"ajouter avec succes"})
        }
        return res.status(404).json({
            succes:"ce budget n'existe pas"})
    } catch (error) {
        console.log(error);
        res.status(200).json({message:"une erreur c'est produite"})
    }

}
const modifier_categorie = async (req, res) => {
    const budgetNom = req.params.nom;
   const id=req.user.id;
    const cate = req.params.nomCategorie;
    const { nom, description, montant } = req.body;

    try {
        const modifier = await Budget.findOne({
            where: { nom: budgetNom, ClientBudgetId: id },
            include: {
                model: Categorie,
                where: { nomCategorie: cate },
                through: { attributes: ['id', 'montant'] } 
            }
        });

        if (!modifier || modifier.Categories.length === 0) {
            return res.status(404).json({ echec: "Budget ou catégorie introuvable" });
        }

        const element = modifier.Categories[0];

        if (!element.budgetCategorie) { 
            return res.status(400).json({ echec: "Montant introuvable dans le pivot" });
        }

        if (montant !== undefined) {
            modifier.montantAllouer = modifier.montantAllouer - element.budgetCategorie.montant + montant;
            await element.budgetCategorie.update({ montant }); 
        }

        if (nom) element.nomCategorie = nom;
        if (description) element.description = description;
        await element.save();
        await modifier.save();

        return res.status(200).json({ succes: "Catégorie modifiée avec succès" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ echec: "Une erreur s'est produite" });
    }
};


/*const modifier_categorie=async (req,res)=> {
    const budgetNom=req.params.nom;
    const id=req.params.id;
    const cate=req.params.nomCategorie;
    const {nom, description,montant}=req.body;
    try {
        const modifier = await Budget.findOne({
        where: { nom: budgetNom, ClientBudgetId: id },
        include: {
            model: Categorie,
            where: { nomCategorie: cate },
            through: { attributes: ['montant'] }
        }
        });
        if (modifier && modifier.Categories.length > 0) {
            const element = modifier.Categories[0];
            if (!element.budgetCategorie) {
                return res.status(400).json({ echec: "Montant introuvable dans le pivot" });
            }
            modifier.montantAllouer -=element.budgetCategorie.montant;
            modifier.montantAllouer+=montant;
            element.nomCategorie=nom;
            element.description=description;
            element.budgetCategorie.montant = montant;
            await element.budgetCategorie.save();
            await element.save();
            await modifier.save();
            return res.status(200).json({ succes: "Catégorie modifiier avec succes" });
        }
    } catch (error) {
        console.log(error);
        return res.status(200).json({ echec: "une erreur c'est produite" });
    }

}*/
const supprimer_categorie=async (req,res)=> {
    const budgetNom=req.params.nom;
    const id=req.user.id;
    const cate=req.params.nomCategorie;
try {
   const retire = await Budget.findOne({
    where: { nom: budgetNom, ClientBudgetId: id },
    include: {
        model: Categorie,
        where: { nomCategorie: cate },
        through: { attributes: ['montant'] }
    }
    });
  
if (retire && retire.Categories.length > 0) {
    const element = retire.Categories[0];
    retire.montantAllouer -=element.budgetCategorie.montant;
    await retire.save();
    await retire.removeCategorie(element);
    return res.status(200).json({ succes: "Catégorie supprimée" });
}
     return res.status(400).json({echecs:"categorie ou budget inexistant" })
} catch (error) {
    console.log(error);
      return res.status(400).json({echecs:"une erreur c'est produite" })
}
}
const statistique=async (req,res)=> {

    res.status(200).json({
        succes:"statistique de revenue et de depenses"
    })
}
const planification=async (req,res)=> {

    res.status(200).json({
        succes:"vous avez fais une nouvelle planifications bugetaire"
    })
};
const creerProjet = async (req, res) => {
  try {
    const { nomProjet, budgetTotal, depenses } = req.body;
    const clientId = req.user.id;

    // Création du projet
    const projet = await Projet.create({
      nom: nomProjet,
      budgetTotall: budgetTotal,
      clientId: clientId,
      etat: "en cours"
    });

    // Traitement des catégories et dépenses
    for (const dep of depenses) {
      // Vérifier si la catégorie existe, sinon la créer
      const [categorie] = await Categorie.findOrCreate({
        where: { nomCategorie: dep.nomCategorie },
        defaults: { description: dep.description || "" }
      });

      // Créer la dépense pour le projet
      const depense = await depenseProjet.create({
        projetId: projet.id,
        categorieId: categorie.id,
        montant: dep.montant,
        dateDeblocage: dep.dateDeblocage,
        statut: "bloqué"
      });

      // Créer la transaction initiale
      await TransactionDepenseProjet.create({
        depenseProjetId: depense.id,
        type: "deblocage",
        montant: dep.montant,
        description: "Montant bloqué initialement"
      });
    }

    res.status(201).json({ message: "Projet créé avec succès", projet });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la création du projet" });
  }
};

const supprimerProjet = async (req, res) => {
  try {
    const { deleteProjetId } = req.params;
    await Projet.destroy({ where: { id: parseInt(deleteProjetId) } });
    res.json({ message: "Projet supprimé avec succès" });
    await depenseProjet.destroy({where:{projetId:null}});
    await TransactionDepenseProjet.destroy({where:{depenseProjetId:null}})
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la suppression du projet" });
  }
};
const listerProjetsClient = async (req, res) => {
  try {
    const clientId=req.user.id;
    const projets = await Projet.findAll({
      where: { clientId },
      include: [
        {
          model: depenseProjet,
          include: [{ model: Categorie }]
        }
      ]
    });
    res.json(projets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des projets" });
  }
};
const getProjetDetails = async (req, res) => {
  try {
    const { projetId } = req.params;
    const projet = await Projet.findByPk(projetId, {
      include: [
        {
          model: depenseProjet,
          include: [
            { model: Categorie },
            { model: TransactionDepenseProjet }
          ]
        }
      ]
    });

    if (!projet) return res.status(404).json({ error: "Projet introuvable" });

    res.json(projet);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération du projet" });
  }
};
const getStatistiquesProjet = async (req, res) => {
  try {
    const { projetId } = req.params;
    const depenses = await depenseProjet.findAll({
      where: { projetId },
      include: [TransactionDepenseProjet]
    });

    let totalDebloque = 0, totalUtilise = 0, totalBloque = 0;

    depenses.forEach(dep => {
      dep.TransactionDepenseProjets.forEach(tx => {
        if (tx.type === "deblocage") totalDebloque += parseFloat(tx.montant);
        if (tx.type === "utilisation") totalUtilise += parseFloat(tx.montant);
      });
      if (dep.statut === "bloqué") totalBloque += parseFloat(dep.montant);
    });

    res.json({
      totalDepenses: depenses.length,
      totalDebloque,
      totalUtilise,
      totalBloque,
      soldeRestant: totalDebloque - totalUtilise
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des statistiques" });
  }
};
// Supprimer un budget par son id
const supprimerBudget = async (req, res) => {
  try {
    const { budgetId } = req.params;
    const clientId = req.user.id;

    // Vérifier que le budget appartient bien à l'utilisateur
    const budget = await Budget.findOne({ where: { id: budgetId, ClientBudgetId: clientId } });
    if (!budget) return res.status(404).json({ error: "Budget introuvable ou accès refusé" });

    // Supprimer les associations avec les catégories dans la table pivot
    await budget.setCategories([]);
    
    // Supprimer le budget
    await budget.destroy();

    res.status(200).json({ message: "Budget supprimé avec succès" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la suppression du budget" });
  }
};



const listeDepensesCategorieBudget = async (req, res, next) => {
  try {
    const budgetId = req.params.budgetId;
    const categorieId = req.params.categorieId;

    // Vérifier si le budget existe
    const budget = await Budget.findByPk(budgetId, {
      include: {
        model: Categorie,
        where: { id: categorieId },
        through: { attributes: [] }, // supprime les infos de la table pivot
        include: {
          model: depense,  // inclure toutes les dépenses liées à cette catégorie
        }
      }
    });

    if (!budget || budget.Categories.length === 0) {
      return res.status(404).json({ message: "Budget ou catégorie introuvable" });
    }

    // Récupérer les dépenses
    const depenses = budget.Categories[0].depenses;

    res.status(200).json({
      budgetId: budget.id,
      categorieId: categorieId,
      categorieNom: budget.Categories[0].nomCategorie,
      depenses
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la récupération des dépenses" });
  }
};



// Middleware pour lister les transactions d'une catégorie de dépenses d'un projet
const listeTransactionsCategorieProjet = async (req, res, next) => {
  try {
    const { projetId, categorieId } = req.params;

    // Vérifier si le projet existe
    const monProjet = await Projet.findByPk(projetId);
    if (!monProjet) {
      return res.status(404).json({ message: "Projet introuvable" });
    }

    // Vérifier si la catégorie existe
    const maCategorie = await Categorie.findByPk(categorieId);
    if (!maCategorie) {
      return res.status(404).json({ message: "Catégorie introuvable" });
    }

    // Récupérer toutes les dépenses liées à ce projet et cette catégorie
    const depenses = await depenseProjet.findAll({
      where: {
        projetId: projetId,
        categorieId: categorieId
      },
      include: [
        {
          model: TransactionDepenseProjet,
          attributes: ["id", "montant", "description", "createdAt", "updatedAt"]
        }
      ]
    });

    // Construire la réponse
    const transactions = depenses.flatMap(d => d.TransactionDepenseProjets);

    return res.status(200).json({
      projetId,
      categorieId,
      categorieNom: maCategorie.nomCategorie,
      transactions
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erreur serveur lors de la récupération des transactions" });
  }
};

const getContextesUtilisateur = async (req, res) => {
  try {
    const clientId = req.user.id;

    // 📌 1. Budgets + catégories
    const budgets = await Budget.findAll({
      where: { ClientBudgetId: clientId },
      include: [
        {
          model: Categorie,
          through: { attributes: ['montant'] } // pivot montant budget-catégorie
        }
      ]
    });

    // 📌 2. Projets + dépenses + catégories
    const projets = await Projet.findAll({
      where: { clientId:clientId },
      include: [
        {
          model: depenseProjet,
          include: [
            { model: Categorie },
            { model: TransactionDepenseProjet }
          ]
        }
      ]
    });
console.log(projets);
    // 📌 3. Portefeuilles + transactions
    const portefeuilles = await Portefeuille.findAll({
      where: { ClientPortefeuilleId: clientId }
    });

    const transactions = await Transaction.findAll({
      where: { ClientTransactionId: clientId },
      order: [['createdAt', 'DESC']]
    });

    // 📌 4. Tontine — engagements, tours à venir, argent immobilisé.
    // Sans cette section, le contexte ment : il annonce un solde libre
    // alors qu'une cotisation tombe dans trois jours, et il ignore le tour
    // qui arrive. Le chatbot et la planification s'appuient dessus.
    let tontine = null;
    try {
      const SyntheseService = require('../../services/tontine/synthese.service');
      tontine = await SyntheseService.complete(clientId);
    } catch (e) {
      console.log('Contexte tontine indisponible :', e.message);
    }

    return res.status(200).json({
      budgets,
      projets,
      portefeuilles,
      transactions,
      tontine
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erreur lors de la récupération des contextes" });
  }
};

const enregistrerDepense = async (req, res) => {
  try {
    const clientId = req.user.id;
    const { typeContexte, contexteId, categorieId, montant, numero, destinateur, description } = req.body;

    if (!typeContexte || !contexteId || !categorieId || !montant) {
      return res.status(400).json({ error: "Champs requis manquants" });
    }

    // 1️⃣ Créer la transaction générale
    const transaction = await Transaction.create({
      montant,
      date: new Date(),
      type: "dépense",
      statut: "Validée",
      description: description || `Paiement par ${numero} - ${destinateur}`,
      frais: 100.3, // tu peux calculer dynamique si besoin
      ClientTransactionId: clientId
    });


    if (typeContexte === "budget") {
      const monBudget = await Budget.findByPk(contexteId);
      if (!monBudget) return res.status(404).json({ error: "Budget introuvable" });

      const maCategorie = await Categorie.findByPk(categorieId);
      if (!maCategorie) return res.status(404).json({ error: "Catégorie introuvable" });

      const nouvelleDepense = await depense.create({
        montant,
        description:description,
        categorieId: maCategorie.id,
      });

      return res.status(201).json({
        message: "Dépense enregistrée dans le budget",
        transaction,
        depense: nouvelleDepense
      });
    }

    if (typeContexte === "projet") {
      const monProjet = await Projet.findByPk(contexteId);
      if (!monProjet) return res.status(404).json({ error: "Projet introuvable" });

      const maCategorie = await Categorie.findByPk(categorieId);
      if (!maCategorie) return res.status(404).json({ error: "Catégorie introuvable" });

      const nouvelleDepenseProjet = await depenseProjet.create({
        montant,
        projetId: monProjet.id,
        categorieId: maCategorie.id
      });

      await TransactionDepenseProjet.create({
        type:'utilisation',
        montant,
        description: description || `Dépense projet via ${numero}`,
        depenseProjetId: nouvelleDepenseProjet.id
      });

      return res.status(201).json({
        message: "Dépense enregistrée dans le projet",
        transaction
      });
    }

    return res.status(400).json({ error: "Type de contexte invalide" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erreur serveur lors de l'enregistrement de la dépense" });
  }
};



const fonction={
    listeTransactionsCategorieProjet,
    listeDepensesCategorieBudget,
    planification,
    creerBudget,
    enregistrerDepense,
    ajouter_categorie,
    statistique,
    supprimer_categorie,
    modifier_categorie,
    budgets,
    creerProjet,
    supprimerProjet,
    supprimerBudget,
    listerProjetsClient,
    getProjetDetails,
    getStatistiquesProjet,
    getContextesUtilisateur 

}
module.exports=fonction;
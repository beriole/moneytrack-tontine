const budgets = [
  {
    id: 1,
    nom: "planification de construction",
    montantAllouer: 31200,
    periodeDebut: "2024-06-23T00:00:00.000Z",
    periodeFin: "2024-12-23T00:00:00.000Z",
    createdAt: "2025-09-19T05:13:15.000Z",
    updatedAt: "2025-09-19T05:13:15.000Z",
    ClientBudgetId: 1,
    Categories: [
      { id: 1, nomCategorie: "alimentation", description: "Dépenses de nourriture et repas", budgetCategorie: { id: 1, montant: 4500, budgetId: 1, categorieId: 1 } },
      { id: 2, nomCategorie: "electricite", description: "Factures d'électricité du chantier", budgetCategorie: { id: 2, montant: 3200, budgetId: 1, categorieId: 2 } },
      { id: 3, nomCategorie: "eau", description: "Factures d'eau", budgetCategorie: { id: 3, montant: 1500, budgetId: 1, categorieId: 3 } },
      { id: 4, nomCategorie: "transport", description: "Déplacements et carburant", budgetCategorie: { id: 4, montant: 2800, budgetId: 1, categorieId: 4 } },
      { id: 5, nomCategorie: "materiaux", description: "Achat de matériaux de construction", budgetCategorie: { id: 5, montant: 7500, budgetId: 1, categorieId: 5 } },
      { id: 6, nomCategorie: "loyers", description: "Location de matériel et bureaux", budgetCategorie: { id: 6, montant: 2200, budgetId: 1, categorieId: 6 } },
      { id: 7, nomCategorie: "salaires", description: "Paiement des ouvriers et employés", budgetCategorie: { id: 7, montant: 6000, budgetId: 1, categorieId: 7 } },
      { id: 8, nomCategorie: "assurances", description: "Assurances chantier et sécurité", budgetCategorie: { id: 8, montant: 1200, budgetId: 1, categorieId: 8 } },
      { id: 9, nomCategorie: "licences", description: "Permis et autorisations légales", budgetCategorie: { id: 9, montant: 800, budgetId: 1, categorieId: 9 } },
      { id: 10, nomCategorie: "divers", description: "Autres dépenses imprévues", budgetCategorie: { id: 10, montant: 1500, budgetId: 1, categorieId: 10 } }
    ]
  },
  {
    id: 2,
    nom: "Déploiement logistique rural",
    montantAllouer: 19000,
    periodeDebut: "2024-07-01T00:00:00.000Z",
    periodeFin: "2024-12-31T00:00:00.000Z",
    createdAt: "2025-09-19T05:20:12.000Z",
    updatedAt: "2025-09-19T05:20:12.000Z",
    ClientBudgetId: 1,
    Categories: [
      { id: 4, nomCategorie: "transport", description: "Déplacements et carburant", budgetCategorie: { id: 11, montant: 4000, budgetId: 2, categorieId: 4 } },
      { id: 8, nomCategorie: "assurances", description: "Assurances chantier et sécurité", budgetCategorie: { id: 17, montant: 1500, budgetId: 2, categorieId: 8 } },
      { id: 9, nomCategorie: "licences", description: "Permis et autorisations légales", budgetCategorie: { id: 18, montant: 800, budgetId: 2, categorieId: 9 } },
      { id: 10, nomCategorie: "divers", description: "Autres dépenses imprévues", budgetCategorie: { id: 20, montant: 1200, budgetId: 2, categorieId: 10 } },
      { id: 11, nomCategorie: "stockage", description: "Entrepôts temporaires", budgetCategorie: { id: 12, montant: 2500, budgetId: 2, categorieId: 11 } },
      { id: 12, nomCategorie: "main d'œuvre", description: "Salaires des chauffeurs", budgetCategorie: { id: 13, montant: 3000, budgetId: 2, categorieId: 12 } },
      { id: 13, nomCategorie: "sécurité", description: "Surveillance des cargaisons", budgetCategorie: { id: 14, montant: 1800, budgetId: 2, categorieId: 13 } },
      { id: 14, nomCategorie: "communication", description: "Radios et téléphones", budgetCategorie: { id: 15, montant: 1200, budgetId: 2, categorieId: 14 } },
      { id: 15, nomCategorie: "maintenance", description: "Réparation des véhicules", budgetCategorie: { id: 16, montant: 2000, budgetId: 2, categorieId: 15 } },
      { id: 16, nomCategorie: "formation", description: "Formation des conducteurs", budgetCategorie: { id: 19, montant: 1000, budgetId: 2, categorieId: 16 } }
    ]
  },
  {
    id: 3,
    nom: "Campagne de sensibilisation santé",
    montantAllouer: 12000,
    periodeDebut: "2024-08-01T00:00:00.000Z",
    periodeFin: "2024-11-30T00:00:00.000Z",
    createdAt: "2025-09-19T05:30:10.000Z",
    updatedAt: "2025-09-19T05:30:10.000Z",
    ClientBudgetId: 2,
    Categories: [
      { id: 1, nomCategorie: "alimentation", description: "Collations pour participants", budgetCategorie: { id: 21, montant: 2000, budgetId: 3, categorieId: 1 } },
      { id: 10, nomCategorie: "divers", description: "Autres dépenses imprévues", budgetCategorie: { id: 22, montant: 1000, budgetId: 3, categorieId: 10 } },
      { id: 14, nomCategorie: "communication", description: "Affiches et flyers", budgetCategorie: { id: 23, montant: 3000, budgetId: 3, categorieId: 14 } },
      { id: 12, nomCategorie: "main d'œuvre", description: "Paiement des animateurs", budgetCategorie: { id: 24, montant: 4000, budgetId: 3, categorieId: 12 } },
      { id: 16, nomCategorie: "formation", description: "Séances de formation", budgetCategorie: { id: 25, montant: 2000, budgetId: 3, categorieId: 16 } }
    ]
  },
  {
    id: 4,
    nom: "Projet agricole communautaire",
    montantAllouer: 25000,
    periodeDebut: "2024-05-01T00:00:00.000Z",
    periodeFin: "2024-12-31T00:00:00.000Z",
    createdAt: "2025-09-19T05:40:05.000Z",
    updatedAt: "2025-09-19T05:40:05.000Z",
    ClientBudgetId: 3,
    Categories: [
      { id: 5, nomCategorie: "materiaux", description: "Semences et engrais", budgetCategorie: { id: 26, montant: 8000, budgetId: 4, categorieId: 5 } },
      { id: 4, nomCategorie: "transport", description: "Livraison des produits", budgetCategorie: { id: 27, montant: 4000, budgetId: 4, categorieId: 4 } },
      { id: 12, nomCategorie: "main d'œuvre", description: "Salaires des agriculteurs", budgetCategorie: { id: 28, montant: 6000, budgetId: 4, categorieId: 12 } },
      { id: 10, nomCategorie: "divers", description: "Autres dépenses imprévues", budgetCategorie: { id: 29, montant: 5000, budgetId: 4, categorieId: 10 } },
      { id: 8, nomCategorie: "assurances", description: "Assurances récoltes", budgetCategorie: { id: 30, montant: 2000, budgetId: 4, categorieId: 8 } }
    ]
  },
  {
    id: 5,
    nom: "Événement culturel",
    montantAllouer: 15000,
    periodeDebut: "2024-09-01T00:00:00.000Z",
    periodeFin: "2024-09-30T00:00:00.000Z",
    createdAt: "2025-09-19T05:50:01.000Z",
    updatedAt: "2025-09-19T05:50:01.000Z",
    ClientBudgetId: 4,
    Categories: [
      { id: 14, nomCategorie: "communication", description: "Publicité et affiches", budgetCategorie: { id: 31, montant: 3000, budgetId: 5, categorieId: 14 } },
      { id: 12, nomCategorie: "main d'œuvre", description: "Salaires animateurs", budgetCategorie: { id: 32, montant: 4000, budgetId: 5, categorieId: 12 } },
      { id: 10, nomCategorie: "divers", description: "Cadeaux et imprévus", budgetCategorie: { id: 33, montant: 2500, budgetId: 5, categorieId: 10 } },
      { id: 1, nomCategorie: "alimentation", description: "Restauration", budgetCategorie: { id: 34, montant: 3000, budgetId: 5, categorieId: 1 } },
      { id: 8, nomCategorie: "assurances", description: "Assurance événement", budgetCategorie: { id: 35, montant: 1500, budgetId: 5, categorieId: 8 } }
    ]
  },
  {
    id: 6,
    nom: "Installation énergie solaire",
    montantAllouer: 35000,
    periodeDebut: "2024-06-01T00:00:00.000Z",
    periodeFin: "2024-12-31T00:00:00.000Z",
    createdAt: "2025-09-19T06:00:00.000Z",
    updatedAt: "2025-09-19T06:00:00.000Z",
    ClientBudgetId: 5,
    Categories: [
      { id: 5, nomCategorie: "materiaux", description: "Panneaux et batteries", budgetCategorie: { id: 36, montant: 20000, budgetId: 6, categorieId: 5 } },
      { id: 4, nomCategorie: "transport", description: "Livraison matériel", budgetCategorie: { id: 37, montant: 5000, budgetId: 6, categorieId: 4 } },
      { id: 12, nomCategorie: "main d'œuvre", description: "Salaires installateurs", budgetCategorie: { id: 38, montant: 8000, budgetId: 6, categorieId: 12 } },
      { id: 10, nomCategorie: "divers", description: "Autres frais", budgetCategorie: { id: 39, montant: 2000, budgetId: 6, categorieId: 10 } }
    ]
  },
  {
    id: 7,
    nom: "Formation numérique",
    montantAllouer: 18000,
    periodeDebut: "2024-07-01T00:00:00.000Z",
    periodeFin: "2024-09-30T00:00:00.000Z",
    createdAt: "2025-09-19T06:10:00.000Z",
    updatedAt: "2025-09-19T06:10:00.000Z",
    ClientBudgetId: 6,
    Categories: [
      { id: 12, nomCategorie: "main d'œuvre", description: "Formateurs", budgetCategorie: { id: 40, montant: 10000, budgetId: 7, categorieId: 12 } },
      { id: 14, nomCategorie: "communication", description: "Supports pédagogiques", budgetCategorie: { id: 41, montant: 4000, budgetId: 7, categorieId: 14 } },
      { id: 10, nomCategorie: "divers", description: "Autres dépenses", budgetCategorie: { id: 42, montant: 4000, budgetId: 7, categorieId: 10 } }
    ]
  }
];

export default budgets;

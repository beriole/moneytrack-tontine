export const projets = [
  {
    id: 1,
    nom: "Projet déménagement",
    budgetTotall: 1500000,
    etat: "en cours",
    createdAt: "2025-09-19T11:44:51.000Z",
    updatedAt: "2025-09-19T11:44:51.000Z",
    clientId: 1,
    depenseProjets: [
      {
        id: 1,
        montant: 300000,
        dateDeblocage: "2025-09-05T00:00:00.000Z",
        statut: "bloqué",
        projetId: 1,
        categorieId: 1,
        Categorie: { id: 1, nomCategorie: "alimentation", description: "Dépenses de nourriture et repas" }
      },
      {
        id: 2,
        montant: 500000,
        dateDeblocage: "2025-09-15T00:00:00.000Z",
        statut: "bloqué",
        projetId: 1,
        categorieId: 2,
        Categorie: { id: 2, nomCategorie: "electricite", description: "Factures d'électricité du chantier" }
      },
      {
        id: 3,
        montant: 700000,
        dateDeblocage: "2025-10-01T00:00:00.000Z",
        statut: "bloqué",
        projetId: 1,
        categorieId: 3,
        Categorie: { id: 3, nomCategorie: "eau", description: "Factures d'eau" }
      }
    ]
  },
  {
    id: 2,
    nom: "Projet construction",
    budgetTotall: 2500000,
    etat: "planifié",
    createdAt: "2025-09-20T10:00:00.000Z",
    updatedAt: "2025-09-20T10:00:00.000Z",
    clientId: 2,
    depenseProjets: [
      {
        id: 4,
        montant: 800000,
        dateDeblocage: "2025-09-25T00:00:00.000Z",
        statut: "débloqué",
        projetId: 2,
        categorieId: 5,
        Categorie: { id: 5, nomCategorie: "materiaux", description: "Achat de matériaux de construction" }
      },
      {
        id: 5,
        montant: 400000,
        dateDeblocage: "2025-10-05T00:00:00.000Z",
        statut: "bloqué",
        projetId: 2,
        categorieId: 6,
        Categorie: { id: 6, nomCategorie: "loyers", description: "Location de matériel et bureaux" }
      }
    ]
  },
  {
    id: 3,
    nom: "Projet agricole",
    budgetTotall: 1000000,
    etat: "terminé",
    createdAt: "2025-07-01T08:00:00.000Z",
    updatedAt: "2025-09-10T08:00:00.000Z",
    clientId: 3,
    depenseProjets: [
      {
        id: 6,
        montant: 500000,
        dateDeblocage: "2025-07-15T00:00:00.000Z",
        statut: "débloqué",
        projetId: 3,
        categorieId: 7,
        Categorie: { id: 7, nomCategorie: "salaires", description: "Paiement des ouvriers" }
      },
      {
        id: 7,
        montant: 300000,
        dateDeblocage: "2025-08-01T00:00:00.000Z",
        statut: "débloqué",
        projetId: 3,
        categorieId: 4,
        Categorie: { id: 4, nomCategorie: "transport", description: "Déplacements et carburant" }
      }
    ]
  },
  {
    id: 4,
    nom: "Projet santé",
    budgetTotall: 2000000,
    etat: "en cours",
    createdAt: "2025-06-12T12:00:00.000Z",
    updatedAt: "2025-09-12T12:00:00.000Z",
    clientId: 4,
    depenseProjets: [
      {
        id: 8,
        montant: 1000000,
        dateDeblocage: "2025-07-01T00:00:00.000Z",
        statut: "débloqué",
        projetId: 4,
        categorieId: 8,
        Categorie: { id: 8, nomCategorie: "assurances", description: "Assurances médicales" }
      },
      {
        id: 9,
        montant: 600000,
        dateDeblocage: "2025-08-15T00:00:00.000Z",
        statut: "bloqué",
        projetId: 4,
        categorieId: 9,
        Categorie: { id: 9, nomCategorie: "licences", description: "Permis et autorisations légales" }
      }
    ]
  },
  {
    id: 5,
    nom: "Projet événement culturel",
    budgetTotall: 500000,
    etat: "terminé",
    createdAt: "2025-05-20T15:00:00.000Z",
    updatedAt: "2025-08-20T15:00:00.000Z",
    clientId: 5,
    depenseProjets: [
      {
        id: 10,
        montant: 200000,
        dateDeblocage: "2025-06-01T00:00:00.000Z",
        statut: "débloqué",
        projetId: 5,
        categorieId: 10,
        Categorie: { id: 10, nomCategorie: "divers", description: "Autres dépenses imprévues" }
      },
      {
        id: 11,
        montant: 300000,
        dateDeblocage: "2025-06-15T00:00:00.000Z",
        statut: "débloqué",
        projetId: 5,
        categorieId: 14,
        Categorie: { id: 14, nomCategorie: "communication", description: "Radios et téléphones" }
      }
    ]
  },
  {
    id: 6,
    nom: "Projet énergie solaire",
    budgetTotall: 3500000,
    etat: "en cours",
    createdAt: "2025-04-01T09:00:00.000Z",
    updatedAt: "2025-09-01T09:00:00.000Z",
    clientId: 6,
    depenseProjets: [
      {
        id: 12,
        montant: 2000000,
        dateDeblocage: "2025-04-15T00:00:00.000Z",
        statut: "débloqué",
        projetId: 6,
        categorieId: 5,
        Categorie: { id: 5, nomCategorie: "materiaux", description: "Achat de panneaux solaires" }
      },
      {
        id: 13,
        montant: 800000,
        dateDeblocage: "2025-05-10T00:00:00.000Z",
        statut: "bloqué",
        projetId: 6,
        categorieId: 12,
        Categorie: { id: 12, nomCategorie: "main d'œuvre", description: "Salaires des installateurs" }
      }
    ]
  },
  {
    id: 7,
    nom: "Projet formation numérique",
    budgetTotall: 800000,
    etat: "planifié",
    createdAt: "2025-09-10T14:00:00.000Z",
    updatedAt: "2025-09-18T14:00:00.000Z",
    clientId: 7,
    depenseProjets: [
      {
        id: 14,
        montant: 400000,
        dateDeblocage: "2025-09-20T00:00:00.000Z",
        statut: "bloqué",
        projetId: 7,
        categorieId: 16,
        Categorie: { id: 16, nomCategorie: "formation", description: "Séances de formation" }
      },
      {
        id: 15,
        montant: 300000,
        dateDeblocage: "2025-09-25T00:00:00.000Z",
        statut: "bloqué",
        projetId: 7,
        categorieId: 1,
        Categorie: { id: 1, nomCategorie: "alimentation", description: "Restauration des participants" }
      }
    ]
  }
];

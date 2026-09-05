// importation de la base de donnée
const db = require('../config/bd');
const Paiement=require('../models/model.paiement')
// importation des modules personnalisés
const photo = require('./model.photo');

const Admin = require('./model.admin');
const Budget = require('./model.budget');
const NotificationEnvoyer = require('./model.NotificationEnvoyer');
const Categorie = require('./model.categorie');
const TransactionDepenseProjet = require('./model.TransactionDepenseProjet');
const depense = require('./model.depenses');
const Litige = require('./model.litige');
const projet = require('./model.projet');
const depenseProjet = require('./models.depenseProjet');
const Notification = require('./model.notification');
const OneBudget = require('./model.OneBudgetCategorie');
const Portefeuille = require('./model.portefeuile');
const Client = require('./models.client');
const Transaction = require('./models.transaction');
const Otp = require('./models.Otp');
const Epargne = require('./model.epargne');
const TransactionEpargne = require('./model.TransactionEpargne');
const Plan = require('./model.plan');
const detailPlan = require('./model.detailPlan');
const AuditLog = require('./model.auditLog');
const Pret = require('./model.pret');
const SystemConfig = require('./model.systemConfig');
const PendingAction = require('./model.pendingAction');

// NOUVEAUX MODÈLES
const BudgetCollaborator = require('./model.budgetCollaborator');
const ProjetCollaborator = require('./model.projetCollaborator');
const Milestone = require('./model.milestone');
const EpargneAutomatique = require('./model.epargneAuto');

// MODULE TONTINE — caisse 1 (le tour), caisse 2 (epargne/credit), caisse 4 (amendes)
const tontine = require('./tontine');
const {
    TontineGroupe,
    TontineMembre,
    TontineCycle,
    TontineCotisation,
    TontineCaution,
    TontineAmende,
    TontineVote,
    TontineVoteReponse,
    TontineEchangeTour,
    TontineEnchere,
    TontinePoolCredit,
    TontineDemandeCredit,
    TontineRemboursementCredit,
    TontinePartage,
    TontineContrat,
    TontineSignature
} = tontine;

// Alias pour les relations
const Projet = projet;

// Relation client ↔ profile
Client.hasOne(photo, { foreignKey: "clientId" });
photo.belongsTo(Client, { foreignKey: "clientId" });

// Relation client ↔ litige
Client.hasMany(Litige, { foreignKey: "clientId", as: "litige" });
Litige.belongsTo(Client, { foreignKey: "clientId" });

// Relation client ↔ notification
Client.belongsToMany(Notification, { through: NotificationEnvoyer, foreignKey: "ClientId" });
Notification.belongsToMany(Client, { through: NotificationEnvoyer, foreignKey: "NotificationId" });
Admin.hasMany(Notification, { foreignKey: "adminId" });
Notification.belongsTo(Admin, { foreignKey: "adminId" });

// Relation plan ↔ détail plan (plusieurs-à-plusieurs)
Plan.belongsToMany(detailPlan, { through: 'PlanDetail', foreignKey: 'planId' });
detailPlan.belongsToMany(Plan, { through: 'PlanDetail', foreignKey: 'detailPlanId' });

// Relation client ↔ plan (un client ne peut souscrire qu'à un plan)
Plan.hasMany(Client, { foreignKey: 'planId' });
Client.belongsTo(Plan, { foreignKey: 'planId' });

// Relation client ↔ portefeuille
Client.hasMany(Portefeuille, { foreignKey: "ClientPortefeuilleId", as: "portefeuille" });
Portefeuille.belongsTo(Client, { foreignKey: "ClientPortefeuilleId", as: "client" });

// Relation client ↔ budget
Client.hasMany(Budget, { foreignKey: "ClientBudgetId", as: "budget" });
Budget.belongsTo(Client, { foreignKey: "ClientBudgetId", as: "clientBudget" });

// Relation budget ↔ catégorie
Budget.belongsToMany(Categorie, { through: OneBudget, foreignKey: "budgetId" });
Categorie.belongsToMany(Budget, { through: OneBudget, foreignKey: "categorieId" });

// Relation catégorie ↔ dépense
Categorie.hasMany(depense, { foreignKey: "categorieId" });
depense.belongsTo(Categorie, { foreignKey: "categorieId" });

// Relation client ↔ projet
Client.hasMany(projet, { foreignKey: "clientId" });
projet.belongsTo(Client, { foreignKey: "clientId" });

// Relation projet ↔ dépense projet
projet.hasMany(depenseProjet, { foreignKey: "projetId", onDelete: "CASCADE", hooks: true });
depenseProjet.belongsTo(projet, { foreignKey: "projetId" });

// Relation catégorie ↔ dépense projet
Categorie.hasMany(depenseProjet, { foreignKey: "categorieId" });
depenseProjet.belongsTo(Categorie, { foreignKey: "categorieId" });

// Relation client ↔ transactions
Client.hasMany(Transaction, { foreignKey: "ClientTransactionId", as: "transactionClient" });
Transaction.belongsTo(Client, { foreignKey: "ClientTransactionId", as: "clienttransaction" });

// Relation dépense projet ↔ transaction dépense projet
depenseProjet.hasMany(TransactionDepenseProjet, { foreignKey: "depenseProjetId", onDelete: "CASCADE", hooks: true });
TransactionDepenseProjet.belongsTo(depenseProjet, { foreignKey: "depenseProjetId" });

// Relation client ↔ épargne
Client.hasMany(Epargne, { foreignKey: 'user_id' });
Epargne.belongsTo(Client, { foreignKey: 'user_id' });

// Relation client ↔ prêt
Client.hasMany(Pret, { foreignKey: 'clientId' });
Pret.belongsTo(Client, { foreignKey: 'clientId' });
Client.hasMany(Paiement, { foreignKey: 'user_id' });
Paiement.belongsTo(Client, { foreignKey: 'user_id' });

// Relation épargne ↔ transaction épargne
Epargne.hasMany(TransactionEpargne, { foreignKey: 'Epargne_id' });
TransactionEpargne.belongsTo(Epargne, { foreignKey: 'Epargne_id' });

// ============================================
// NOUVELLES RELATIONS
// ============================================

// Budget ↔ Collaborateurs
Budget.hasMany(BudgetCollaborator, { foreignKey: 'budgetId', as: 'collaborateurs' });
BudgetCollaborator.belongsTo(Budget, { foreignKey: 'budgetId' });

// Projet ↔ Sous-projets (hiérarchie)
Projet.hasMany(Projet, { foreignKey: 'projetParentId', as: 'sousProjets' });
Projet.belongsTo(Projet, { foreignKey: 'projetParentId', as: 'projetParent' });

// Projet ↔ Collaborateurs
Projet.hasMany(ProjetCollaborator, { foreignKey: 'projetId', as: 'collaborateurs' });
ProjetCollaborator.belongsTo(Projet, { foreignKey: 'projetId' });

// Projet ↔ Jalons (Milestones)
Projet.hasMany(Milestone, { foreignKey: 'projetId', as: 'jalons' });
Milestone.belongsTo(Projet, { foreignKey: 'projetId' });

// ============================================
// MODULE TONTINE ↔ NOYAU PAYFASH
// Les relations internes au module vivent dans models/tontine/index.js.
// Ici on ne branche que ce qui touche Client et Portefeuille.
//
// Note : les colonnes transactionId / transactionBlocageId / ... restent des
// references souples (INTEGER sans contrainte). La table transactions est
// ecrite en masse par le module portefeuille ; on evite d'y accrocher une
// douzaine de contraintes supplementaires.
// ============================================

// Le groupe est cree par un client, et sa caisse est un vrai portefeuille
Client.hasMany(TontineGroupe, { foreignKey: 'createurId', as: 'tontinesCreees' });
TontineGroupe.belongsTo(Client, { foreignKey: 'createurId', as: 'createur' });
TontineGroupe.belongsTo(Portefeuille, { foreignKey: 'portefeuilleId', as: 'caisse' });

// Adhesions : un client peut etre membre de plusieurs tontines
Client.hasMany(TontineMembre, { foreignKey: 'clientId', as: 'adhesionsTontine' });
TontineMembre.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
TontineMembre.belongsTo(Client, { foreignKey: 'garantId', as: 'garant' });
TontineMembre.belongsTo(Client, { foreignKey: 'invitePar', as: 'parrain' });

// Le beneficiaire du tour
TontineCycle.belongsTo(Client, { foreignKey: 'beneficiaireId', as: 'beneficiaire' });

// Cotisations, cautions, amendes : rattachees au client pour les vues "mes ..."
Client.hasMany(TontineCotisation, { foreignKey: 'clientId', as: 'cotisationsTontine' });
TontineCotisation.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

Client.hasMany(TontineCaution, { foreignKey: 'clientId', as: 'cautionsTontine' });
TontineCaution.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

Client.hasMany(TontineAmende, { foreignKey: 'clientId', as: 'amendesTontine' });
TontineAmende.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
TontineAmende.belongsTo(Client, { foreignKey: 'infligeePar', as: 'censeur' });

// Gouvernance
TontineVote.belongsTo(Client, { foreignKey: 'creePar', as: 'auteur' });
TontineVoteReponse.belongsTo(Client, { foreignKey: 'clientId', as: 'votant' });

// Marche des tours et encheres
TontineEchangeTour.belongsTo(Client, { foreignKey: 'demandeurId', as: 'demandeur' });
TontineEchangeTour.belongsTo(Client, { foreignKey: 'destinataireId', as: 'destinataire' });
TontineEnchere.belongsTo(Client, { foreignKey: 'clientId', as: 'encherisseur' });

// Credit
Client.hasMany(TontineDemandeCredit, { foreignKey: 'clientId', as: 'creditsTontine' });
TontineDemandeCredit.belongsTo(Client, { foreignKey: 'clientId', as: 'emprunteur' });

// Signature du reglement interieur
TontineSignature.belongsTo(Client, { foreignKey: 'clientId', as: 'signataire' });

module.exports = {
    Epargne,
    TransactionEpargne,
    Admin,
    Budget,
    Categorie,
    Client,
    Litige,
    Notification,
    NotificationEnvoyer,
    OneBudget,
    depenseProjet,
    projet,
    Projet,
    photo,
    Portefeuille,
    depense,
    Transaction,
    Otp,
    db,
    Plan,
    detailPlan,
    AuditLog,
    Pret,
    SystemConfig,
    PendingAction,
    Paiement,
    BudgetCollaborator,
    ProjetCollaborator,
    Milestone,
    EpargneAutomatique,

    // Module tontine
    TontineGroupe,
    TontineMembre,
    TontineCycle,
    TontineCotisation,
    TontineCaution,
    TontineAmende,
    TontineVote,
    TontineVoteReponse,
    TontineEchangeTour,
    TontineEnchere,
    TontinePoolCredit,
    TontineDemandeCredit,
    TontineRemboursementCredit,
    TontinePartage,
    TontineContrat,
    TontineSignature
};

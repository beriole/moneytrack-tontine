// =====================================================================
//  Script de données de test PayFash.
//  Crée un utilisateur de démo + portefeuilles, transactions, budgets,
//  projets, épargnes et plans marketplace. Idempotent : rejouable.
//
//  Lancer :  node seed.js
//  Login généré :  email = test@payfash.com   mot de passe = test1234
// =====================================================================
const bcrypt = require('bcrypt');
const models = require('./models');
const {
  db, Client, Portefeuille, Transaction, Budget, Categorie,
  Projet, Epargne, TransactionEpargne, Plan,
} = models;

const EMAIL = 'test@payfash.com';
const PASSWORD = 'test1234';

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function seed() {
  await db.authenticate();
  console.log('✅ Connexion DB OK');
  // S'assurer que les tables existent (sans tout casser)
  await db.sync();

  // -------- 1. Client de démo --------
  const hash = await bcrypt.hash(PASSWORD, 10);
  let client = await Client.findOne({ where: { email: EMAIL } });
  if (client) {
    console.log('ℹ️  Client démo déjà présent (id=%s) — nettoyage des données liées…', client.id);
    await Promise.all([
      Portefeuille.destroy({ where: { ClientPortefeuilleId: client.id } }),
      Transaction.destroy({ where: { ClientTransactionId: client.id } }),
      Projet.destroy({ where: { clientId: client.id } }),
    ]);
    const oldBudgets = await Budget.findAll({ where: { ClientBudgetId: client.id } });
    for (const b of oldBudgets) { await b.setCategories([]); await b.destroy(); }
    const oldEp = await Epargne.findAll({ where: { user_id: client.id } });
    for (const e of oldEp) {
      await TransactionEpargne.destroy({ where: { Epargne_id: e.id } });
      await e.destroy();
    }
    client.motDePasse = hash;
    client.isVerified = true;
    client.isActive = true;
    await client.save();
  } else {
    client = await Client.create({
      nom: 'Beriole Démo',
      email: EMAIL,
      telephone: 690000123,
      motDePasse: hash,
      isActive: true,
      isVerified: true,
      dateInscription: new Date(),
    });
    console.log('✅ Client démo créé (id=%s)', client.id);
  }
  const cid = client.id;

  // -------- 2. Portefeuilles --------
  await Portefeuille.bulkCreate([
    { nom: 'Compte Courant', solde: 150000, devise: 'XAF', typePortefeuille: 'courant', estPrincipal: true, ClientPortefeuilleId: cid },
    { nom: 'Épargne',        solde: 80000,  devise: 'XAF', typePortefeuille: 'epargne', ClientPortefeuilleId: cid },
    { nom: 'Projets',        solde: 60000,  devise: 'XAF', typePortefeuille: 'projet',  ClientPortefeuilleId: cid },
  ]);
  console.log('✅ 3 portefeuilles créés');

  // -------- 3. Transactions --------
  await Transaction.bulkCreate([
    { montant: 200000, date: daysAgo(12), type: 'revenu',    statut: 'Succès', description: 'Salaire mensuel',            frais: 0,   ClientTransactionId: cid },
    { montant: 15000,  date: daysAgo(9),  type: 'depense',   statut: 'Succès', description: 'Courses alimentaires',       frais: 100, ClientTransactionId: cid },
    { montant: 50000,  date: daysAgo(7),  type: 'transfert', statut: 'Succès', description: 'Transfert vers Épargne',     frais: 0,   ClientTransactionId: cid },
    { montant: 8000,   date: daysAgo(4),  type: 'depense',   statut: 'Succès', description: 'Transport',                  frais: 50,  ClientTransactionId: cid },
    { montant: 30000,  date: daysAgo(2),  type: 'revenu',    statut: 'Succès', description: 'Remboursement ami',          frais: 0,   ClientTransactionId: cid },
    { montant: 12000,  date: daysAgo(1),  type: 'depense',   statut: 'En confirmation', description: 'Facture électricité', frais: 100, ClientTransactionId: cid },
  ]);
  console.log('✅ 6 transactions créées');

  // -------- 4. Budgets + catégories --------
  const budgetsData = [
    {
      nom: 'Budget Mensuel', montantAllouer: 120000, periodeDebut: daysAgo(15), periodeFin: daysAgo(-15),
      cats: [
        { nom: 'Alimentation', description: 'Courses et repas', montant: 50000 },
        { nom: 'Transport',    description: 'Carburant et taxi', montant: 30000 },
        { nom: 'Loisirs',      description: 'Sorties',          montant: 40000 },
      ],
    },
    {
      nom: 'Budget Vacances', montantAllouer: 200000, periodeDebut: daysAgo(5), periodeFin: daysAgo(-60),
      cats: [
        { nom: 'Hébergement', description: 'Hôtel', montant: 120000 },
        { nom: 'Activités',   description: 'Excursions', montant: 80000 },
      ],
    },
  ];
  for (const bd of budgetsData) {
    const budget = await Budget.create({
      nom: bd.nom, montantAllouer: bd.montantAllouer,
      periodeDebut: bd.periodeDebut, periodeFin: bd.periodeFin, ClientBudgetId: cid,
    });
    for (const c of bd.cats) {
      const [cat] = await Categorie.findOrCreate({
        where: { nomCategorie: c.nom }, defaults: { description: c.description },
      });
      await budget.addCategorie(cat, { through: { montant: c.montant } });
    }
  }
  console.log('✅ 2 budgets + catégories créés');

  // -------- 5. Projets --------
  await Projet.bulkCreate([
    { nom: 'Achat Ordinateur', budgetTotall: 350000, etat: 'en cours', progression: 40, montantDepense: 140000, description: 'Nouveau PC portable', clientId: cid, dateDebut: daysAgo(20), dateFinPrevue: daysAgo(-40) },
    { nom: 'Voyage Dubaï',     budgetTotall: 1500000, etat: 'en pause', progression: 15, montantDepense: 225000, description: 'Vacances de fin d\'année', clientId: cid, dateDebut: daysAgo(10), dateFinPrevue: daysAgo(-120) },
  ]);
  console.log('✅ 2 projets créés');

  // -------- 6. Épargnes + transactions épargne --------
  const ep1 = await Epargne.create({
    objectif: 'Fonds d\'urgence', date_debut: daysAgo(60), date_fin: daysAgo(-120),
    montant_total: 500000, montant_cumule: 175000, statut: 'en cours', progression: 35,
    couleur: '#4F46E5', icone: 'shield', user_id: cid,
  });
  const ep2 = await Epargne.create({
    objectif: 'Nouvelle moto', date_debut: daysAgo(30), date_fin: daysAgo(-90),
    montant_total: 800000, montant_cumule: 240000, statut: 'en cours', progression: 30,
    couleur: '#8B5CF6', icone: 'motorcycle', user_id: cid,
  });
  await TransactionEpargne.bulkCreate([
    { montant: 100000, date_transaction: daysAgo(55), description: 'Dépôt initial', Epargne_id: ep1.id },
    { montant: 75000,  date_transaction: daysAgo(20), description: 'Dépôt mensuel', Epargne_id: ep1.id },
    { montant: 240000, date_transaction: daysAgo(25), description: 'Dépôt initial', Epargne_id: ep2.id },
  ]);
  console.log('✅ 2 épargnes + transactions créées');

  // -------- 7. Plans marketplace (globaux) --------
  const plans = [
    { nom: 'Plan Starter',  description: 'Idéal pour débuter : gestion de budget et 1 projet.',         prix: 0 },
    { nom: 'Plan Pro',      description: 'Projets illimités, épargne avancée et assistant IA.',         prix: 2500 },
    { nom: 'Plan Business', description: 'Comptes partagés, statistiques avancées et support prioritaire.', prix: 6000 },
  ];
  for (const p of plans) {
    await Plan.findOrCreate({ where: { nom: p.nom }, defaults: p });
  }
  console.log('✅ 3 plans marketplace assurés');

  console.log('\n========================================');
  console.log('🎉 Seed terminé avec succès !');
  console.log('   Email    : %s', EMAIL);
  console.log('   Password : %s', PASSWORD);
  console.log('========================================');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Erreur seed :', err); process.exit(1); });

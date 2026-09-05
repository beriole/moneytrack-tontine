# MoneyTrack 💸

Application de gestion de budget, d'épargne et de finances personnelles (FCFA) — Afrique francophone,
avec un module de **tontine camerounaise (njangi)** intégré au reste des comptes.

## Structure du dépôt

| Dossier | Description |
|---|---|
| `payfash-expo/` | Application mobile **Expo SDK 54** (React Native) — client final |
| `PayFash/` | Backend **Node.js / Express / Sequelize (MySQL)** — API REST + back-office admin |
| `stage1/` | Version initiale React Native CLI (référence historique) |

## Fonctionnalités

### Finances personnelles
Portefeuilles (courant / épargne / projet), transferts, dépenses, budgets, projets,
épargne, marketplace de plans, prêts, assistant IA (Groq).

### Tontine (njangi)
Le module reprend trois des quatre caisses d'une tontine camerounaise. La caisse de
solidarité (caisse 3) est hors périmètre.

| Caisse | Contenu |
|---|---|
| **1 — Tour rotatif** | Cycles, cotisations, ordre de passage (tirage, vote, enchère, ancienneté), échange de tour, caution, garant |
| **2 — Épargne & crédit** | Pool d'épargne du groupe, demandes de crédit, échéancier de remboursement, partage annuel (*la casse*) |
| **4 — Amendes** | Barème configurable, retards constatés automatiquement, recouvrement sur la caution puis sur le garant |

Gouvernance : rôles président / trésorier / censeur / secrétaire, votes, contrats signés.

**Ce n'est pas un module juxtaposé.** Une tontine est simultanément une ligne de budget,
une entrée de trésorerie datée, une épargne et de l'argent immobilisé. L'application
distingue donc partout quatre soldes — **brut / engagé / immobilisé / disponible** — et
c'est le *disponible* qui est proposé à l'utilisateur, jamais le brut.

### Paiements
Encaissements et retraits mobile money (MTN MoMo, Orange Money) via l'agrégateur
[Fapshi](https://fapshi.com). Les webhooks Fapshi n'étant pas signés, chaque
notification est **revérifiée par appel API** avant d'être créditée ; l'idempotence
repose sur une référence unique et une relecture verrouillée.

### Back-office
Tableau de bord, gestion utilisateurs & agents, KYC, transactions, remboursements,
litiges, prêts, AML/anti-fraude, notifications, exports Excel — protégé par un RBAC
à 7 rôles et un journal d'audit. Les opérations financières sensibles passent par un
**maker-checker** : deux administrateurs distincts, et une trace nominative.

## Démarrage rapide

### Backend

```bash
cd PayFash
npm install
cp .env.example .env            # renseigner la base, le secret JWT, Fapshi
npx sequelize-cli db:migrate    # 8 migrations, toutes idempotentes
npm start                       # http://localhost:3000
```

Générer aussi une paire de clés RSA dans `PayFash/.private/` (`private.pem`, `public.pem`)
pour la signature des jetons.

### Application mobile

```bash
cd payfash-expo
npm install
cp .env.example .env            # renseigner EXPO_PUBLIC_GROQ_API_KEY
# Ajuster utils/config.js avec l'IP LAN du backend
npx expo start                  # scanner le QR avec Expo Go (SDK 54)
```

## Vérification

Neuf scénarios de bout en bout couvrent le module, sur une base réelle :

```bash
cd PayFash
node scripts/seed-tontine-demo.js     # jeu de données de démonstration
node scripts/verifier-tontine.js      # schéma et migrations
node scripts/scenario-tontine.js      # caisse 1 — le tour rotatif
node scripts/scenario-caisse2.js      # épargne et crédit
node scripts/scenario-caisse4.js      # amendes et recouvrement
node scripts/scenario-gouvernance.js  # rôles, votes, contrats
node scripts/scenario-synchronisation.js
node scripts/scenario-notifications.js
node scripts/scenario-prelevement.js  # mandat de prélèvement
node scripts/scenario-paiement.js     # Fapshi (bac à sable réel)
node scripts/scenario-backoffice.js
```

Chacun affiche ses contrôles ligne par ligne et **échoue bruyamment** au premier écart.
Tous vérifient la conservation de la monnaie : la somme des variations de soldes, frais
de plateforme et fonds immobilisés compris, doit être nulle.

## ⚠️ Sécurité

Aucun secret n'est versionné (voir `.gitignore`) :

- `**/.env` et toute variante `.env.*` — variables d'environnement
- `PayFash/.private/*.pem` — clés de signature JWT, à générer localement
- `backups/`, `*.sql` — sauvegardes de base

Les fichiers `.env.example` sont des gabarits **sans aucune valeur réelle**.
Ne jamais committer de clés.

### Deux garde-fous à connaître

`POST /wallet/deposit` et `POST /wallet/withdraw` répondent volontairement **410 Gone**.
Ils créditaient un portefeuille sans contrepartie réelle — donc créaient de l'argent.
Tout mouvement passe désormais par `/paiement/*`, adossé à Fapshi.

`TONTINE_CLIENT_PLATEFORME_ID` doit désigner un client existant. Sans lui, les frais de
plateforme n'ont pas de destinataire et ne sont **pas prélevés, silencieusement**.

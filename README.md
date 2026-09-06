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

Un groupe **gelé** par l'administration ne bouge plus d'argent. La distinction
compte : ce qui crée un engagement — verser le pot, apporter, décaisser un
crédit, échanger un tour — est bloqué dès le gel et sur un groupe terminé ; ce
qui *solde une dette* envers le groupe — régler une amende, rembourser un
crédit, saisir ou rendre une caution, clore l'exercice — reste possible sur un
groupe terminé, sans quoi un crédit encore dehors à la fin de la rotation
serait irremboursable.

**Ce n'est pas un module juxtaposé.** Une tontine est simultanément une ligne de budget,
une entrée de trésorerie datée, une épargne et de l'argent immobilisé. L'application
distingue donc quatre soldes — **brut / engagé / immobilisé / disponible** — exposés par
`GET /tontine/synthese/solde`, et c'est le *disponible* que l'accueil affiche.

Un retrait, lui, se juge sur un cinquième chiffre : le **retirable**, c'est-à-dire le
solde du compte réellement débité moins les engagements des 30 prochains jours. Le
`disponible` somme tous les portefeuilles, y compris une épargne qu'un retrait ne
touche pas. `POST /paiement/retrait` oppose le retirable côté serveur : le dépasser
reste possible, mais doit être demandé explicitement (`accepterRisque: true`) —
c'est une décision de l'utilisateur, pas un défaut de contrôle.

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
cp .env.example .env            # renseigner la base et Fapshi

# Les clés RSA qui signent les jetons (RS256). Il n'y a pas de secret JWT.
mkdir -p .private
openssl genrsa -out .private/private.pem 2048
openssl rsa -in .private/private.pem -pubout -out .private/public.pem

npm start                       # http://localhost:3000
```

**L'ordre compte.** Les tables sont créées au démarrage par `db.sync()`, et les
migrations ne font qu'altérer des tables *existantes* : lancées sur une base
vierge, elles échouent. Sur une base neuve, `npm start` suffit. Sur une base
déjà en service, arrêtez le serveur, sauvegardez, puis :

```bash
npx sequelize-cli db:migrate    # 10 migrations, toutes idempotentes
```

### Application mobile

```bash
cd payfash-expo
npm install
cp .env.example .env            # EXPO_PUBLIC_API_URL et EXPO_PUBLIC_GROQ_API_KEY
npx expo start                  # scanner le QR avec Expo Go (SDK 54)
```

`EXPO_PUBLIC_API_URL` doit porter l'**IP LAN** de la machine qui fait tourner le
backend — jamais `localhost`, qui désignerait le téléphone lui-même. Sur
émulateur Android, `http://10.0.2.2:3000`.

## Vérification

Neuf scénarios de bout en bout couvrent le module, sur une base réelle :

```bash
cd PayFash
npm test                              # la suite complète, hors Fapshi
npm run test:paiement                 # Fapshi (bac à sable réel, clés requises)
```

Ou scénario par scénario :

```bash
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

Un compte dont l'adresse email n'est pas vérifiée peut utiliser l'application,
mais **ne peut ni recharger ni retirer** : le code OTP existait depuis toujours
sans que rien ne le lise. La connexion, elle, reste ouverte — la fermer
mettrait dehors les comptes déjà créés.

`TONTINE_CLIENT_PLATEFORME_ID` doit désigner un client existant. Sans lui, les frais de
plateforme n'ont pas de destinataire et ne sont **pas prélevés, silencieusement**.

Un retrait dont l'issue est **inconnue** — Fapshi injoignable, délai dépassé, 5xx — n'est
jamais remboursé automatiquement : l'opérateur a peut-être exécuté le versement, et
recréditer ferait sortir l'argent deux fois. Le paiement passe en `A_VERIFIER`, les fonds
restent réservés, et l'opération est reprise à la main. Seul un refus *certain* (4xx,
requête jamais partie) rembourse.

Les opérations financières de l'administration — remboursement, ajustement de
portefeuille, versement forcé d'un pot — n'ont **aucune voie d'exécution directe**. Toutes
déposent une demande (`202`) qu'un second administrateur doit approuver via
`POST /api/admin/validation/:id/approuver`.

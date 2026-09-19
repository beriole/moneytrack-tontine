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
épargne, plans d'abonnement, assistant IA (Groq).

La boutique marchande et les prêts entre utilisateurs ont été **retirés**. Ni l'une
ni les autres n'avaient de mise en œuvre réelle : le contrôleur de la boutique
renvoyait des messages fixes, l'espace vendeur répondait « vous etes connecter » à
tout, et le pair-à-pair du prêt se résumait à quatre routes en `501`. Le besoin de
crédit est couvert par la caisse 2 de la tontine, qui elle fonctionne : vote du
groupe, échéancier, remboursement. Les **plans d'abonnement**, eux, restent en
place — le back-office continue de les gérer sous `/api/admin/produit`, un nom que
l'histoire explique et que l'interface impose.

L'assistant passe par le backend (`POST /ai/chat`) : la clé Groq reste sur le
serveur, dans `GROQ_API_KEY`. Elle était auparavant embarquée dans le bundle
mobile via `EXPO_PUBLIC_GROQ_API_KEY` — extractible par quiconque installe
l'application. L'instruction système est posée côté serveur et l'historique
plafonné : sans cela, un compte suffisait à obtenir un LLM généraliste aux
frais du projet. L'ancien appel direct reste accessible avec
`EXPO_PUBLIC_GROQ_DIRECT=1`, en connaissance de cause.

### Tontine (njangi)
Le module reprend trois des quatre caisses d'une tontine camerounaise. La caisse de
solidarité (caisse 3) est hors périmètre.

| Caisse | Contenu |
|---|---|
| **1 — Tour rotatif** | Cycles, cotisations, ordre de passage (tirage, vote, enchère, ancienneté), échange de tour, caution |
| **2 — Épargne & crédit** | Pool d'épargne du groupe, demandes de crédit, échéancier de remboursement, partage annuel (*la casse*) |
| **4 — Amendes** | Barème configurable, retards constatés automatiquement, recouvrement sur la caution puis exclusion |

Gouvernance : deux charges — **président** et **trésorier** — plus le membre simple,
votes et contrats signés.

Censeur, secrétaire et garant ont été supprimés. Les deux premiers n'étaient que des
étiquettes : infliger une amende et publier le règlement reviennent au bureau, et le
retard est de toute façon constaté par la règle — le planificateur lève l'amende sans
que personne ait à dénoncer. Le garant, lui, faisait reposer la défaillance d'un membre
sur le portefeuille d'un autre, et transformait une dette envers le groupe en dette
entre deux personnes que l'application n'avait aucun moyen de faire honorer. La cascade
de recours est désormais : **amende de retard → saisie de la caution → exclusion**. La
caution est de l'argent que le défaillant a lui-même immobilisé.

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
litiges, AML/anti-fraude, notifications, exports Excel — protégé par un RBAC
à 6 rôles et un journal d'audit.

**Interface : `http://localhost:3000/backoffice`** (`PayFash/backoffice/`). Les
quarante-six routes d'administration n'avaient aucune interface : le RBAC, le
maker-checker et le journal d'audit ne s'utilisaient qu'au curl. La page est servie
par Express à la **même origine que l'API**, ce qui évite d'ouvrir CORS aux jetons
d'administration. Aucune dépendance, aucun outil de compilation : trois fichiers
statiques.

La palette, les rayons et les nuances de carte sont repris tels quels de
`payfash-expo/theme.js` et `styleTontine.js` — repeindre le projet repeint les deux
interfaces.

Deux principes tenus par l'interface :

- **Le serveur reste la seule autorité.** Un bouton grisé porte en infobulle le rôle
  qui manque ; il n'est pas masqué. `requireRole` tranche, et une action interdite
  revient en 403 même si l'interface l'avait laissée passer.
- **Aucune exécution financière directe.** Rembourser une écriture ou ajuster un
  portefeuille *dépose une demande*. Les boutons disent « Demander », jamais
  « Rembourser ». L'exécution a lieu depuis l'écran Validations, sous le compte d'un
  **second** administrateur — le serveur refuse en 403 que le demandeur approuve sa
  propre demande.

| Écran | Couvre | Écriture réservée à |
|---|---|---|
| Tableau de bord | statistiques, répartitions | — |
| Tontines | santé des groupes, anomalies, gel / dégel, export | — |
| Utilisateurs | comptes clients, dossier, désactivation | `SUPER_ADMIN` (suppression, agents) |
| Vérifications KYC | file d'attente, instruction, pièce fournie | `COMPLIANCE` |
| Litiges | réclamations, résolution | — |
| Transactions | grand livre, bénéfices, export | `ADMIN_FINANCE` |
| Validations | maker-checker | `ADMIN_FINANCE` |
| Anti-fraude | montants élevés, vélocité 24 h | — |
| Plans d'abonnement | catalogue « Souscrire » | `MARKETING` |
| Notifications | historique, campagnes | `MARKETING` |
| Configuration | paramètres système | `SUPER_ADMIN` |
| Administrateurs | comptes du back-office, rôles | `SUPER_ADMIN` |

Un compte de démonstration se crée avec `node seedAdmin.js` — attention, ce script
fait un `db.sync({ alter: true })` que le reste du projet évite (voir plus haut).

Deux corrections que la construction de cette interface a rendues visibles :

- **`/api/kyc` a été supprimé.** Onze routes qui renvoyaient des chaînes en dur
  (« vous etes maintemant connecter ») et qui étaient montées **sans aucun
  middleware** — pas de jeton, pas de rôle — y compris le téléchargement d'une pièce
  d'identité. Le vrai KYC vit sous `/api/admin/kyc`, protégé, adossé à
  `Client.isVerified` et à la table `photo` ; c'est lui que sert l'écran
  Vérifications KYC.
- **Le rôle `AGENT_KYC` peut enfin travailler.** Les routes d'approbation et de rejet
  n'admettaient que `COMPLIANCE` : un compte créé par `POST /api/admin/Agentkyc`
  pouvait se connecter au back-office sans avoir le droit d'instruire quoi que ce
  soit. C'était le seul rôle de la plateforme sans une seule action permise. Les opérations financières sensibles passent par un
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
npx sequelize-cli db:migrate    # 13 migrations, toutes idempotentes
```

### Application mobile

```bash
cd payfash-expo
npm install
cp .env.example .env            # renseigner EXPO_PUBLIC_API_URL
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

La treizième migration, `20260907120000-retrait-marketplace-prets-et-roles`, **supprime
des tables et des colonnes** : `Prets`, `Produits`, `tontine_membres.garantId`,
`tontine_cotisations.garantPayeurId` et `montantAvanceGarant`. Elle reclasse d'abord les
membres `censeur` et `secretaire` en `membre`, et les administrateurs `AGENT_SELLER` en
`SUPPORT`, avant de rétrécir les ENUM — sans quoi MySQL viderait ces valeurs en silence.
Son `down` restitue la structure, jamais les données. **Faites un dump avant de la
lancer.**

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

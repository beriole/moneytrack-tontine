# MoneyTrack 💸

Application de gestion de budget, d'épargne et de finances personnelles (FCFA) — Afrique francophone.

## Structure du dépôt

| Dossier | Description |
|---|---|
| `payfash-expo/` | Application mobile **Expo SDK 54** (React Native) — client final |
| `PayFash/` | Backend **Node.js / Express / Sequelize (MySQL)** — API REST + back-office admin |
| `stage1/` | Version initiale React Native CLI (référence historique) |

## Fonctionnalités

- **Client** : portefeuilles (courant/épargne/projet), dépôts, transferts, dépenses, budgets, projets, épargne, marketplace de plans, prêts, assistant IA (Groq).
- **Admin** : tableau de bord (KPIs), gestion utilisateurs & agents, KYC, transactions & bénéfices, remboursements, litiges, prêts, configuration système, AML/anti-fraude, notifications/campagnes, validation maker-checker, exports Excel — le tout protégé par RBAC (7 rôles) + journal d'audit.

## Démarrage rapide

### Backend
```bash
cd PayFash
npm install
# Créer un fichier .env (DB MySQL, EMAIL, etc.) — voir config/index.js
# Générer une paire de clés RSA dans .private/ (private.pem + public.pem)
npm start          # http://localhost:3000
```

### Application mobile
```bash
cd payfash-expo
npm install
cp .env.example .env          # renseigner EXPO_PUBLIC_GROQ_API_KEY
# Ajuster utils/config.js avec l'IP LAN du backend
npx expo start                # scanner le QR avec Expo Go (SDK 54)
```

## ⚠️ Sécurité

Les secrets ne sont **pas** versionnés (voir `.gitignore`) :
- `**/.env` — variables d'environnement (DB, email, clé Groq)
- `PayFash/.private/*.pem` — clés de signature JWT (à générer localement)

Ne jamais committer de clés réelles.

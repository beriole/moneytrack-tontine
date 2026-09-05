# PayFash — Expo (SDK 54)

Portage du frontend `stage1` (React Native CLI 0.75) vers **Expo SDK 54 / Expo Go**.
Design **identique** à l'original ; seule la palette de couleurs a évolué vers un thème **Violet / Indigo premium**.

## Démarrer

```bash
cd payfash-expo
npm install            # déjà fait
npx expo start         # puis scanner le QR avec l'app Expo Go (SDK 54)
```

> ⚠️ Renseigner l'URL du backend dans [utils/config.js](utils/config.js).
> Sur un téléphone physique, mettez l'IP **LAN** de la machine qui héberge l'API
> (ex. `http://192.168.x.x:3000`), pas `localhost`.

## Palette (thème centralisé : [theme.js](theme.js))

| Rôle      | Avant      | Après (violet/indigo) |
|-----------|------------|------------------------|
| Base/navy | `#0D1B2A`  | `#161427` |
| Primaire  | `#2B4794`  | `#4F46E5` |
| Accent    | `#3B82F6`  | `#6366F1` |
| Accent +  | `#60A5FA`  | `#818CF8` |
| Dégradé   | `#1E90FF → #00C49A` | `#4F46E5 → #8B5CF6` |
| Succès / Danger / Warning | conservés | conservés |

## Migrations natives (RN CLI → Expo SDK 54)

| Avant | Après |
|-------|-------|
| `react-native-vector-icons/*` | `@expo/vector-icons` |
| `react-native-linear-gradient` | `expo-linear-gradient` |
| `@react-native-community/geolocation` | `expo-location` ([screens/profils/Map.js](screens/profils/Map.js)) |
| `react-native-gesture-handler/Swipeable` (sous-chemin déprécié) | `{ Swipeable }` depuis le package racine |
| React Navigation 6 | React Navigation 7 (compat React 19) |

## Bugs corrigés

- **Imports natifs** incompatibles Expo (icônes, gradient, géoloc, Swipeable).
- **Profile** : crash si ouvert sans `route.params` (`{ solde } = Route.params` → `Route.params || {}`).
- **Déconnexion** : vide désormais `token`/`user` dans AsyncStorage + `navigation.reset`.
- **Map** : la position GPS récupérée n'était jamais affichée → marqueur de position ajouté.
- `App.js` enveloppé dans `GestureHandlerRootView` + `SafeAreaProvider` (requis Expo).
- Babel configuré pour **Reanimated 4** (`react-native-worklets/plugin`).

## Chatbot Groq

L'assistant ([screens/others/ChatbotScreen.js](screens/others/ChatbotScreen.js)) est branché
directement sur l'**API Groq** (OpenAI-compatible) via [utils/groq.js](utils/groq.js) :
historique de conversation conservé, prompt système finance/FCFA, gestion d'erreurs,
auto-scroll et animation de frappe.

Configuration : copier `.env.example` en `.env` et renseigner la clé
(`EXPO_PUBLIC_GROQ_API_KEY`, depuis https://console.groq.com/keys). Modèle par défaut :
`llama-3.3-70b-versatile`.

## Vérification backend (dossier `../PayFash`)

Chaque appel API du front a été croisé avec les routes Express. Résultat : **19/19 routeurs
se chargent** (wiring route↔contrôleur valide). Bugs trouvés et corrigés :

| Côté | Bug | Correctif |
|------|-----|-----------|
| Backend | **`client.ai.js:335`** : template literal ouvert par `` ` `` mais fermé par `"` → erreur de syntaxe qui **empêchait tout le serveur de démarrer** | fermeture par `` ` `` |
| Front | `WalletContext` appelait `GET /wallet` (route inexistante) | → `GET /wallet/solde` |
| Front | `MarketPlace` appelait `POST /plan/souscrire` | → `POST /plan/plan/souscrire` (double préfixe du routeur) |

Backend = Express 5 + Sequelize/MySQL. Démarrage : `cd ../PayFash && npm start`
(nécessite une base MySQL configurée dans `PayFash/.env`).

## Notes

- Écrans `Conversation` / `Message` présents mais non branchés dans la navigation
  (code mort, déjà ainsi dans l'original) — `Conversation` pointe vers une route `Chat` inexistante.
- `react-redux` et `victory-native` étaient déclarés mais inutilisés → non réinstallés.
- Validé par bundling Metro complet (1617 modules, bundle Android 3,4 Mo, 0 erreur).

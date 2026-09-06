// =====================================================================
//  URL du backend MoneyTrack.
//
//  Elle etait codee en dur dans ce fichier, versionnee, et le commentaire
//  qui l'accompagnait annoncait deux autres adresses que celle reellement
//  utilisee : chaque changement de reseau demandait une modification du
//  depot, et le fichier arrivait faux chez le suivant.
//
//  Definissez EXPO_PUBLIC_API_URL dans payfash-expo/.env (non versionne) :
//
//    EXPO_PUBLIC_API_URL=http://192.168.1.42:3000
//
//  Reperes selon la cible :
//    - telephone physique (Expo Go) : l'IP LAN de la machine qui fait
//      tourner le backend — jamais localhost, qui designerait le telephone ;
//    - emulateur Android : http://10.0.2.2:3000 ;
//    - simulateur iOS / navigateur : http://localhost:3000.
//
//  Le repli ci-dessous ne sert qu'au simulateur : sur un telephone, il
//  echouera, et messageErreur() renvoie alors vers ce fichier.
// =====================================================================

const REPLI = 'http://localhost:3000';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || REPLI).replace(/\/+$/, '');

if (!process.env.EXPO_PUBLIC_API_URL) {
  console.warn(
    `[config] EXPO_PUBLIC_API_URL absente : repli sur ${REPLI}. ` +
    'Sur un telephone physique, renseignez l\'IP LAN du backend dans .env.'
  );
}

export default API_BASE_URL;

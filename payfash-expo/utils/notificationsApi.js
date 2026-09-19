// =====================================================================
//  Notifications du client.
//
//  Le serveur les ecrit (rappels, retards, pot verse, garantie mobilisee,
//  vote ouvert...) avec un lien { ecran, params } vers l'endroit ou agir.
//  Les routes sont nominatives : l'identifiant doit etre celui du jeton.
// =====================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './axiosApi';

async function monIdentifiant() {
  const brut = await AsyncStorage.getItem('user');
  const id = brut ? JSON.parse(brut)?.id : null;
  if (!id) throw new Error('Session introuvable : reconnectez-vous.');
  return id;
}

export const mesNotifications = async () => api.get(`/auth/notification/${await monIdentifiant()}`);
// Le nombre seul : { total }.
export const nonLues = async () => api.get(`/auth/client/${await monIdentifiant()}/nonlues`, { params: { compte: 1 } });
export const marquerLue = async (notificationId) => api.put(`/auth/${notificationId}/lire/${await monIdentifiant()}`);

import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WalletContext } from './WalletContext';
import * as T from './tontineApi';

// =====================================================================
//  Etat partage du module tontine.
//
//  Calque sur WalletContext, avec une responsabilite en plus : toute
//  operation qui touche a l'argent (cotisation, amende, apport,
//  remboursement) doit rafraichir le solde du portefeuille, sinon le
//  montant affiche en tete de l'application ment jusqu'au prochain
//  passage sur l'accueil.
// =====================================================================

export const TontineContext = createContext();

export const TontineProvider = ({ children }) => {
  const wallet = useContext(WalletContext);
  const [groupes, setGroupes] = useState([]);
  const [amendesDues, setAmendesDues] = useState(0);
  const [totalAmendes, setTotalAmendes] = useState(0);
  const [monId, setMonId] = useState(null);
  const [chargement, setChargement] = useState(false);

  const rafraichir = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      setChargement(true);

      // Mon identifiant client, pose au login. Les ecrans en ont besoin pour
      // distinguer MA ligne de cotisation de celle des autres : s'en remettre
      // au role ou au tour donne une mauvaise ligne des qu'un autre membre
      // est dans la meme situation.
      const brut = await AsyncStorage.getItem('user');
      if (brut) {
        try { setMonId(JSON.parse(brut)?.id ?? null); } catch (e) { /* stockage illisible */ }
      }

      const [g, a] = await Promise.all([
        T.mesGroupes(),
        T.mesAmendes().catch(() => ({ data: { nombreDues: 0, totalDu: 0 } })),
      ]);
      setGroupes(g.data.groupes || []);
      setAmendesDues(a.data.nombreDues || 0);
      setTotalAmendes(a.data.totalDu || 0);
    } catch (e) {
      // Silencieux : les ecrans affichent leurs propres erreurs. Ce
      // rafraichissement de fond ne doit pas interrompre l'utilisateur.
      console.log('[tontine] rafraichissement :', T.messageErreur(e));
    } finally {
      setChargement(false);
    }
  }, []);

  /** A appeler apres tout mouvement d'argent du module. */
  const apresMouvement = useCallback(async () => {
    await Promise.all([
      rafraichir(),
      wallet?.fetchSolde ? wallet.fetchSolde() : Promise.resolve(),
    ]);
  }, [rafraichir, wallet]);

  return (
    <TontineContext.Provider
      value={{ groupes, amendesDues, totalAmendes, monId, chargement, rafraichir, apresMouvement }}
    >
      {children}
    </TontineContext.Provider>
  );
};

export const useTontine = () => useContext(TontineContext);

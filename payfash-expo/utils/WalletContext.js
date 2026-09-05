import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../utils/axiosApi";

export const WalletContext = createContext();

export const WalletProvider = ({ children }) => {
  const [portefeuilles, setPortefeuilles] = useState([]);
  const [totalSolde, setTotalSolde] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSolde = async () => {
    try {
      // Ne pas appeler l'API protégée tant que l'utilisateur n'est pas connecté
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await api.get("/wallet/solde"); // route backend correcte (le routeur n'expose pas GET /wallet)
      setPortefeuilles(res.data.portefeuilles || []);
      setTotalSolde(res.data.totalSolde || 0);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSolde();
  }, []);

  return (
    <WalletContext.Provider value={{ portefeuilles, totalSolde, loading, fetchSolde }}>
      {children}
    </WalletContext.Provider>
  );
};

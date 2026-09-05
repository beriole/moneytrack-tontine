import React, { createContext, useState, useEffect } from "react";
import api from "../utils/axiosApi";

export const WalletContext = createContext();

export const WalletProvider = ({ children }) => {
  const [portefeuilles, setPortefeuilles] = useState([]);
  const [totalSolde, setTotalSolde] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSolde = async () => {
    try {
      setLoading(true);
      const res = await api.get("/wallet"); // route de ton backend
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

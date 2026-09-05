// TransactionsCategorieProjet.js
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import api from "../../utils/axiosApi"; // ton instance axios

export default function TransactionsCategorieProjet({ route }) {
  const { projetId, categorieId, nomCategorie } = route.params;
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await api.get(`/budget/projet/${projetId}/categorie/${categorieId}/transactions`);
        setTransactions(res.data.transactions || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [projetId, categorieId]);

  if (loading) {
    return <ActivityIndicator size="large" color="#36A2EB" style={{ marginTop: 50 }} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Transactions - {nomCategorie}</Text>
      {transactions.length > 0 ? (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.transactionCard}>
              <Text style={styles.desc}>{item.description || "Sans description"}</Text>
              <Text style={styles.amount}>{item.montant.toLocaleString()} FCFA</Text>
              <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
            </View>
          )}
        />
      ) : (
        <Text style={styles.noData}>Aucune transaction enregistrée</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#161427", padding: 15 },
  title: { color: "#fff", fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  transactionCard: {
    backgroundColor: "#2A2550",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  desc: { color: "#fff", fontSize: 16, fontWeight: "500" },
  amount: { color: "#36A2EB", fontSize: 16, fontWeight: "bold", marginTop: 5 },
  date: { color: "#9CA3AF", fontSize: 14, marginTop: 3 },
  noData: { color: "#9CA3AF", fontSize: 16, textAlign: "center", marginTop: 20 },
});

import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import api from "../../utils/axiosApi"; // ton axios instance

export default function CategorieDepenses({ route }) {
  const { budgetId, categorie } = route.params;
  const [depenses, setDepenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDepenses = async () => {
      try {
        const res = await api.get(`/budget/budget/${budgetId}/${categorie.id}/depenses`);
        setDepenses(res.data.depenses || []);
      } catch (error) {
        console.error("Erreur lors du fetch des dépenses :", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDepenses();
  }, [budgetId, categorie.id]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#36A2EB" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dépenses - {categorie.nomCategorie}</Text>
      {depenses.length > 0 ? (
        <FlatList
          data={depenses}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.depenseCard}>
              <Text style={styles.depenseDesc}>{item.description || "Sans description"}</Text>
              <Text style={styles.depenseAmount}>
                {Number(item.montant).toLocaleString()} FCFA
              </Text>
              <Text style={styles.depenseDate}>
                {item.date ? new Date(item.date).toLocaleDateString() : "Date inconnue"}
              </Text>
            </View>
          )}
        />
      ) : (
        <Text style={styles.noData}>Aucune dépense enregistrée</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A", padding: 15 },
  title: { color: "#fff", fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  depenseCard: {
    backgroundColor: "#1E2A47",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  depenseDesc: { color: "#fff", fontSize: 16, fontWeight: "500" },
  depenseAmount: { color: "#36A2EB", fontSize: 16, fontWeight: "bold", marginTop: 5 },
  depenseDate: { color: "#9CA3AF", fontSize: 14, marginTop: 3 },
  noData: { color: "#9CA3AF", fontSize: 16, textAlign: "center", marginTop: 20 },
});

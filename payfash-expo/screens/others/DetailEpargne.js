import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import api from "../../utils/axiosApi";

export default function DetailEpargne({ route, navigation }) {
  const { objectif } = route.params; // ⚡ recupère l’épargne envoyée
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  // Récupération des détails et transactions depuis l’API
  const fetchDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/Epargne/epargnes/${objectif.id}/statistiques`);
      setDetails(response.data);
    } catch (error) {
      console.error("Erreur récupération détails épargne:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!details) {
    return (
      <View style={styles.container}>
        <Text style={{ color: "#fff" }}>Impossible de charger les détails.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{objectif.objectif}</Text>
      <Text style={styles.description}>
        {objectif.description || "Pas de description fournie"}
      </Text>

      <View style={styles.infoGrid}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Montant total</Text>
          <Text style={styles.cardValue}>{details.objectif.toLocaleString()} FCFA</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Montant cumulé</Text>
          <Text style={styles.cardValue}>{details.cumulé.toLocaleString()} FCFA</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Restant</Text>
          <Text style={styles.cardValue}>{details.restant.toLocaleString()} FCFA</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Statut</Text>
          <Text style={styles.cardValue}>{details.statut}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Date début</Text>
          <Text style={styles.cardValue}>{objectif.date_debut}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Date fin</Text>
          <Text style={styles.cardValue}>{objectif.date_fin}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Historique des dépôts</Text>
      <View style={styles.depotList}>
        {details.transactions.length > 0 ? (
          details.transactions.map((tx) => (
            <View key={tx.id} style={styles.depotItem}>
              <Text style={styles.depotMontant}>{tx.montant.toLocaleString()} FCFA</Text>
              <Text style={styles.depotDate}>
                {new Date(tx.date_transaction).toLocaleDateString()}
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: "#bbb" }}>Aucun dépôt enregistré</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate("AjoutEpargne", { objectif })}
      >
        <Text style={styles.addButtonText}>+ Ajouter des fonds</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B223F", padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 6, color: "#fff" },
  description: { fontSize: 14, color: "#d1d1d1", marginBottom: 16 },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  card: {
    width: "48%",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
  },
  cardLabel: { fontSize: 12, color: "#555" },
  cardValue: { fontSize: 15, fontWeight: "bold", color: "#0B223F", marginTop: 4 },

  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 10, color: "#fff" },
  depotList: { marginBottom: 20 },
  depotItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    elevation: 1,
  },
  depotMontant: { fontSize: 15, fontWeight: "bold", color: "green" },
  depotDate: { fontSize: 13, color: "#444" },

  addButton: {
    backgroundColor: "#4F46E5",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  addButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

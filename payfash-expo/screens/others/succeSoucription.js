import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from '@expo/vector-icons';

export default function SuccesSouscription({ navigation, route }) {
  const { plan, numero, payToken, status } = route.params;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="checkmark" size={60} color="#fff" />
      </View>

      <Text style={styles.title}>Souscription réussie !</Text>
      <Text style={styles.subtitle}>
        Vous avez souscrit au plan{" "}
        <Text style={styles.highlight}>{plan.nom}</Text>
      </Text>

      <View style={styles.detailCard}>
        <Text style={styles.detailText}>Prix : {plan.prix} FCFA</Text>
        <Text style={styles.detailText}>{plan.description}</Text>
      </View>

      <View style={styles.paymentCard}>
        <Text style={styles.paymentTitle}>Récapitulatif du paiement</Text>
        <Text style={styles.paymentText}>Numéro : {numero}</Text>
        <Text style={styles.paymentText}>Token : {payToken}</Text>
        <Text style={styles.paymentText}>Statut : {status}</Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate("Home")}
      >
        <Text style={styles.primaryText}>Retour aux plans</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#0B223F",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  iconContainer: {
    backgroundColor: "#4F46E5",
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  title: { fontSize: 26, fontWeight: "bold", color: "#fff", marginBottom: 10, textAlign: "center" },
  subtitle: { fontSize: 16, color: "#d1d1d1", textAlign: "center", marginBottom: 20 },
  highlight: { color: "#FFD700", fontWeight: "bold" },
  detailCard: {
    backgroundColor: "#1C2A48",
    padding: 15,
    borderRadius: 10,
    width: "100%",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  detailText: { color: "#d1d1d1", fontSize: 14, marginBottom: 5 },
  paymentCard: {
    backgroundColor: "#1C2A48",
    padding: 15,
    borderRadius: 10,
    width: "100%",
    marginBottom: 30,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  paymentTitle: { color: "#FFD700", fontWeight: "bold", fontSize: 16, marginBottom: 10 },
  paymentText: { color: "#d1d1d1", fontSize: 14, marginBottom: 5 },
  primaryButton: {
    backgroundColor: "#4F46E5",
    paddingVertical: 14,
    paddingHorizontal: 50,
    borderRadius: 12,
    alignSelf: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

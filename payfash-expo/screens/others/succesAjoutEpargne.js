import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from '@expo/vector-icons';

export default function SuccesAjoutEpargne({ navigation, route }) {
  const { montant, objectif } = route.params || {
    montant: 50000,
    objectif: { title: "Épargne Construction Maison" },
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="checkmark" size={60} color="white" />
      </View>

      <Text style={styles.title}>Succès !</Text>
      <Text style={styles.subtitle}>
        Vous avez ajouté{" "}
        <Text style={styles.highlight}>{montant.toLocaleString()} FCFA</Text>{" "}
        à votre objectif :
      </Text>
      <Text style={styles.objectif}>{objectif.title}</Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate("DetailEpargne", { objectif })}
      >
        <Text style={styles.primaryText}>Voir l’épargne</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate("Home")}
      >
        <Text style={styles.secondaryText}>Retour à l’accueil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B223F",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  iconContainer: {
    backgroundColor: "green",
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    elevation: 5,
  },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 10 },
  subtitle: { fontSize: 16, color: "#d1d1d1", textAlign: "center", marginBottom: 6 },
  highlight: { color: "#4F46E5", fontWeight: "bold" },
  objectif: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
    marginBottom: 30,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#4F46E5",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 12,
    width: "80%",
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    borderColor: "#4F46E5",
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: "80%",
    alignItems: "center",
  },
  secondaryText: { color: "#4F46E5", fontSize: 15, fontWeight: "600" },
});

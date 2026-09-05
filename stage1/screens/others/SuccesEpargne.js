import React from "react";
import { View, Text, SafeAreaView, TouchableOpacity, StyleSheet } from "react-native";
import AntDesign from "react-native-vector-icons/AntDesign";

export default function SuccesEpargne({ navigation, route }) {
  const { epargne } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <AntDesign name="checkcircle" size={80} color="#16A34A" style={{ marginBottom: 20 }} />
        <Text style={styles.title}>Succès 🎉</Text>
        <Text style={styles.message}>Votre épargne "{epargne.objectif}" a été créée avec succès.</Text>

        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: "#2563EB" }]}
          onPress={() => navigation.navigate("Epargne")}
        >
          <Text style={styles.addButtonText}>Retour à mes Épargnes</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A", justifyContent: "center", alignItems: "center" },
  content: { alignItems: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 10 },
  message: { color: "#9CA3AF", fontSize: 16, textAlign: "center", marginBottom: 30 },
  addButton: {
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});

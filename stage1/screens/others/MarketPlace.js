import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import api from "../../utils/axiosApi"; // ton fichier avec axios + AsyncStorage

export default function PlansScreen({ navigation }) {
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  // Charger les plans depuis la base de données
  const fetchPlans = async () => {
    try {
      setLoading(true);
      const response = await api.get("/plan/plans"); // endpoint backend pour récupérer tous les plans
      setPlans(response.data);
      setLoading(false);
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Impossible de récupérer les plans");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  // Souscrire à un plan
  const subscribePlan = async (planId) => {
    try {
      const response = await api.post("/plan/souscrire", { planId }); // endpoint pour souscription
      Alert.alert("Succès", response.data.message);
      setCurrentPlan(planId);
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", error.response?.data?.message || "Erreur lors de la souscription");
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#1E90FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Choisissez un plan de souscription</Text>

      <ScrollView contentContainerStyle={styles.scroll}>
        {plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[styles.card, { borderColor: plan.color || "#1E90FF" }, currentPlan === plan.id && styles.activeCard]}
            onPress={() =>
              navigation.navigate("detailPlan", {
                plan,
                currentPlan,
                
              })
            }
          >
            <Text style={styles.title}>{plan.nom}</Text>
            <Text style={styles.desc}>{plan.description}</Text>
            <Text style={styles.price}>Prix: {plan.prix} FCFA</Text>
            {currentPlan === plan.id && <Text style={styles.current}>✓ Plan actuel</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B223F", padding: 20 },
  header: { fontSize: 22, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 20 },
  scroll: { paddingBottom: 20 },
  card: { backgroundColor: "#1C2A48", padding: 20, borderRadius: 14, borderWidth: 2, marginBottom: 15 },
  activeCard: { backgroundColor: "#132742" },
  title: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 8 },
  desc: { fontSize: 14, color: "#d1d1d1", marginBottom: 5 },
  price: { fontSize: 14, color: "#FFD700", marginBottom: 5 },
  current: { marginTop: 10, color: "#1E90FF", fontWeight: "bold" },
});

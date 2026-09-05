import React, { useState, useEffect, useCallback } from "react";
import { 
  View, Text, SafeAreaView, ScrollView, 
  TouchableOpacity, StyleSheet, ActivityIndicator, Alert 
} from "react-native";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import AntDesign from "react-native-vector-icons/AntDesign";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import api from "../../utils/axiosApi";
import Swipeable from "react-native-gesture-handler/Swipeable";

const Tab = createMaterialTopTabNavigator();

const StatCard = ({ label, value }) => (
  <View style={styles.statCard}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
};

// -------------------- BUDGET TAB --------------------
function BudgetTab() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  const fetchBudgets = async () => {
    try {
      setLoading(true);
      const response = await api.get("/budget/budget");
      setBudgets(response.data);
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Impossible de récupérer les budgets.");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => { fetchBudgets(); }, [])
  );

  const totalMontant = budgets.reduce((acc, b) => acc + (b.montantAllouer || 0), 0);

const supprimerBudget = async (budgetId) => {
  try {
    const response = await api.delete(`budget/budget/${budgetId}`);
    
    // Vérifie la réponse du backend
    if (response.status === 200) {
      Alert.alert("Succès", response.data.message || "Budget supprimé avec succès");
      fetchBudgets(); // rafraîchit la liste
    } else {
      Alert.alert("Erreur", response.data.message || "Impossible de supprimer le budget");
    }
  } catch (error) {
    console.error(error.response || error);
    // Si le backend renvoie un message d'erreur
    if (error.response && error.response.data && error.response.data.message) {
      Alert.alert("Erreur", error.response.data.message);
    } else {
      Alert.alert("Erreur", "Une erreur inattendue est survenue");
    }
  }
};

  const renderRightActions = (budgetId) => (
    <TouchableOpacity 
      style={styles.deleteBtn} 
      onPress={() => supprimerBudget(budgetId)}
    >
      <Text style={styles.deleteText}>Supprimer</Text>
    </TouchableOpacity>
  );

  if (loading) return <ActivityIndicator style={{ flex:1, justifyContent:'center' }} size="large" color="#fff" />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.statsContainer}>
          <StatCard label="Total Budgets" value={budgets.length} />
          <StatCard label="Montant Total" value={`${totalMontant.toLocaleString()} FCFA`} />
        </View>

        <Text style={styles.sectionTitle}>Liste des Budgets</Text>
        {budgets.map(b => (
          <Swipeable key={b.id} renderRightActions={() => renderRightActions(b.id)}>
            <TouchableOpacity
              style={styles.budgetCard}
              onPress={() => navigation.navigate("BudgetDetails", { budget: b })}
            >
              <Text style={styles.budgetTitle}>{b.nom}</Text>
              <Text style={styles.budgetAmount}>{(b.montantAllouer || 0).toLocaleString()} FCFA</Text>
              <Text style={styles.budgetPeriod}>
                {formatDate(b.periodeDebut)} → {formatDate(b.periodeFin)}
              </Text>
            </TouchableOpacity>
          </Swipeable>
        ))}

        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: "#2563EB" }]}
          onPress={() => navigation.navigate("CreateBudget")}
        >
          <AntDesign name="pluscircleo" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.addButtonText}>Créer un budget</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// -------------------- PROJET TAB --------------------
function ProjetTab() {
  const [projets, setProjets] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  const fetchProjets = async () => {
    try {
      setLoading(true);
      const response = await api.get("/budget/client/projet"); 
      setProjets(response.data);
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Impossible de récupérer les projets.");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => { fetchProjets(); }, [])
  );

  const totalBudget = projets.reduce((acc, p) => acc + (p.budgetTotall || 0), 0);

  const supprimerProjet = async (projetId) => {
    try {
      await api.delete(`/budget/${projetId}`);
      Alert.alert("Succès", "Projet supprimé avec succès");
      fetchProjets();
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Impossible de supprimer le projet");
    }
  };

  const renderRightActionsProjet = (projetId) => (
    <TouchableOpacity 
      style={styles.deleteBtn} 
      onPress={() => supprimerProjet(projetId)}
    >
      <Text style={styles.deleteText}>Supprimer</Text>
    </TouchableOpacity>
  );

  if (loading) return <ActivityIndicator style={{ flex:1, justifyContent:'center' }} size="large" color="#fff" />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.statsContainer}>
          <StatCard label="Total Projets" value={projets.length} />
          <StatCard label="Budget Total" value={`${totalBudget.toLocaleString()} FCFA`} />
        </View>

        <Text style={styles.sectionTitle}>Liste des Projets</Text>
        {projets.map(p => (
          <Swipeable key={p.id} renderRightActions={() => renderRightActionsProjet(p.id)}>
            <TouchableOpacity
              style={styles.projectCard}
              onPress={() => navigation.navigate("DetailProjet", { projet: p })}
            >
              <Text style={styles.projectTitle}>{p.nom}</Text>
              <Text style={styles.projectAmount}>{(p.budgetTotall || 0).toLocaleString()} FCFA</Text>
              <Text style={styles.projectPeriod}>
                {formatDate(p.createdAt)} → {formatDate(p.updatedAt)}
              </Text>
              <View style={[styles.projectStatus, { backgroundColor: p.etat === "en cours" ? "#3B82F6" : "#16A34A" }]}>
                <Text style={styles.statusText}>{p.etat}</Text>
              </View>
            </TouchableOpacity>
          </Swipeable>
        ))}

        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: "#2563EB" }]}
          onPress={() => navigation.navigate("CreateProjet")}
        >
          <AntDesign name="pluscircleo" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.addButtonText}>Créer un projet</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// -------------------- TABS --------------------
export default function BudgetProjetTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: { backgroundColor: "#0D1B2A" },
        tabBarIndicatorStyle: { backgroundColor: "#3B82F6" },
        tabBarLabelStyle: { color: "#fff", fontWeight: "bold" },
      }}
    >
      <Tab.Screen name="Budget" component={BudgetTab} />
      <Tab.Screen name="Projet" component={ProjetTab} />
    </Tab.Navigator>
  );
}

// -------------------- STYLES --------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  statsContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: "#1E2A47",
    marginHorizontal: 5,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  statLabel: { color: "#9CA3AF", fontSize: 14, marginBottom: 5, textAlign: "center" },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "bold", textAlign: "center" },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 15 },

  budgetCard: { backgroundColor: "#1B263B", padding: 20, borderRadius: 16, marginBottom: 15 },
  budgetTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  budgetAmount: { color: "#3B82F6", fontSize: 16, fontWeight: "600", marginBottom: 6 },
  budgetPeriod: { color: "#9CA3AF", fontSize: 14 },

  projectCard: { backgroundColor: "#1B263B", padding: 20, borderRadius: 16, marginBottom: 15 },
  projectTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  projectAmount: { color: "#3B82F6", fontSize: 16, fontWeight: "600", marginBottom: 6 },
  projectPeriod: { color: "#9CA3AF", fontSize: 14, marginBottom: 8 },
  projectStatus: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { color: "#fff", fontWeight: "bold", fontSize: 12 },

  addButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 15, borderRadius: 12, marginTop: 15, marginBottom: 60 },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  deleteBtn: { backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center", width: 100, borderRadius: 16, marginBottom: 15 },
  deleteText: { color: "#fff", fontWeight: "bold" }
});

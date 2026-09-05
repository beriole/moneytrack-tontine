// BudgetDetails.js
import React, { useState } from "react";
import { 
  View, Text, SafeAreaView, ScrollView, StyleSheet, 
  Dimensions, TouchableOpacity, Modal, TextInput, Alert 
} from "react-native";
import { PieChart } from "react-native-chart-kit";
import * as Progress from "react-native-progress";
import { useNavigation } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";
import api from "../../utils/axiosApi"; // instance axios

const screenWidth = Dimensions.get("window").width;

const COLORS = [
  "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0",
  "#9966FF", "#FF9F40", "#00C49F", "#FF6B6B",
  "#0088FE", "#FFBB28", "#FF8042", "#AF19FF"
];

function getColor(index) {
  return COLORS[index % COLORS.length];
}

export default function BudgetDetails({ route }) {
  const { budget: initialBudget } = route.params;
  const [budget, setBudget] = useState(initialBudget);
  const [modalVisible, setModalVisible] = useState(false);
  const [newCat, setNewCat] = useState({ nom: "", description: "", montant: "" });
  const navigation = useNavigation();

  const totalAmount = budget.Categories.reduce(
    (sum, cat) => sum + Number(cat.budgetCategorie.montant), 
    0
  );

  const pieData = budget.Categories
    .filter(cat => Number(cat.budgetCategorie.montant) > 0)
    .map((cat, index) => {
      const amount = Number(cat.budgetCategorie.montant);
      const percentage = totalAmount > 0 ? (amount / totalAmount * 100).toFixed(1) : 0;
      return {
        name: cat.nomCategorie,
        population: amount,
        color: getColor(index),
        legendFontColor: "#fff",
        legendFontSize: 12,
        percentage: percentage
      };
    });

  // Ajouter catégorie
  const handleAddCategory = async () => {
    if (!newCat.nom || !newCat.montant) {
      Alert.alert("Erreur", "Le nom et le montant sont obligatoires");
      return;
    }
    try {
      const res = await api.post(`/budget/budget/${budget.nom}`, newCat);
      if (res.status === 200) {
        const updatedCategories = [
          ...budget.Categories, 
          { 
            nomCategorie: newCat.nom, 
            description: newCat.description, 
            budgetCategorie: { montant: Number(newCat.montant) } 
          }
        ];
        setBudget({ ...budget, Categories: updatedCategories, montantAllouer: budget.montantAllouer + Number(newCat.montant) });
        setModalVisible(false);
        setNewCat({ nom: "", description: "", montant: "" });
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Impossible d'ajouter la catégorie");
    }
  };

  // Supprimer catégorie
  const handleDeleteCategory = async (categorie) => {
    Alert.alert(
      "Supprimer", 
      `Voulez-vous supprimer la catégorie ${categorie.nomCategorie} ?`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: async () => {
            try {
              const res = await api.delete(`/budget/budget/${budget.nom}/${categorie.nomCategorie}`);
              if (res.status === 200) {
                const updatedCategories = budget.Categories.filter(cat => cat.nomCategorie !== categorie.nomCategorie);
                const newMontantAllouer = budget.montantAllouer - categorie.budgetCategorie.montant;
                setBudget({ ...budget, Categories: updatedCategories, montantAllouer: newMontantAllouer });
              }
            } catch (error) {
              console.error(error);
              Alert.alert("Erreur", "Impossible de supprimer la catégorie");
            }
          } 
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 15 }}>
        <Text style={styles.budgetTitle}>{budget.nom}</Text>

        {/* Info Cards */}
        <View style={styles.infoCardsContainer}>
          <View style={[styles.infoCard, { width: (screenWidth - 50) / 3 }]}>
            <Text style={styles.infoLabel}>Montant Total</Text>
            <Text style={styles.infoValue}>
              {budget.montantAllouer.toLocaleString()} FCFA
            </Text>
          </View>
          <View style={[styles.infoCard, { width: (screenWidth - 50) / 3 }]}>
            <Text style={styles.infoLabel}>Date Début</Text>
            <Text style={styles.infoValue}>
              {new Date(budget.periodeDebut).toLocaleDateString()}
            </Text>
          </View>
          <View style={[styles.infoCard, { width: (screenWidth - 50) / 3 }]}>
            <Text style={styles.infoLabel}>Date de Fin</Text>
            <Text style={styles.infoValue}>
              {new Date(budget.periodeFin).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {/* Pie Chart */}
        <Text style={styles.sectionTitle}>Répartition des dépenses</Text>
        <View style={styles.chartCard}>
          {pieData.length > 0 ? (
            <>
              <PieChart
                data={pieData}
                width={screenWidth - 60}
                height={220}
                chartConfig={{
                  backgroundColor: "#161427",
                  backgroundGradientFrom: "#161427",
                  backgroundGradientTo: "#161427",
                  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                  decimalPlaces: 0,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute={false}
                hasLegend={false}
              />
              <View style={styles.legendGrid}>
                {pieData.map((item, index) => (
                  <View key={index} style={styles.legendItem}>
                    <View style={[styles.legendColorBox, { backgroundColor: item.color }]} />
                    <Text style={styles.legendLabel}>{item.name} ({item.percentage}%)</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>Aucune donnée à afficher</Text>
          )}
        </View>

        {/* Categories */}
        <Text style={styles.sectionTitle}>Dépenses par catégorie</Text>
        {budget.Categories.map((cat, index) => {
          const progress = Number(cat.budgetCategorie.montant) / Number(budget.montantAllouer);
          const percentage = (progress * 100).toFixed(1);

          return (
            <Swipeable
              key={index}
              renderRightActions={() => (
                <TouchableOpacity 
                  style={styles.deleteButton} 
                  onPress={() => handleDeleteCategory(cat)}
                >
                  <Text style={styles.deleteText}>Supprimer</Text>
                </TouchableOpacity>
              )}
            >
              <TouchableOpacity
                style={styles.categoryCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate("CategorieDepenses", { categorie: cat, budgetId: budget.id })}
              >
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryName}>{cat.nomCategorie}</Text>
                  <Text style={styles.categoryAmount}>{percentage}%</Text>
                </View>
                <Progress.Bar
                  progress={progress}
                  width={screenWidth - 60}
                  height={20}
                  color={getColor(index)}
                  borderColor="#211C3A"
                  unfilledColor="#2A2550"
                  borderRadius={10}
                />
              </TouchableOpacity>
            </Swipeable>
          );
        })}
      </ScrollView>

      {/* Floating button */}
      <TouchableOpacity 
        style={styles.floatingButton} 
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.floatingButtonText}>+</Text>
      </TouchableOpacity>

      {/* Modal Add Category */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajouter une catégorie</Text>
            <TextInput
              placeholder="Nom de la catégorie"
              style={styles.input}
              value={newCat.nom}
              onChangeText={(text) => setNewCat({ ...newCat, nom: text })}
            />
            <TextInput
              placeholder="Description"
              style={styles.input}
              value={newCat.description}
              onChangeText={(text) => setNewCat({ ...newCat, description: text })}
            />
            <TextInput
              placeholder="Montant alloué"
              style={styles.input}
              value={newCat.montant}
              keyboardType="numeric"
              onChangeText={(text) => setNewCat({ ...newCat, montant: text })}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <TouchableOpacity style={styles.modalButton} onPress={handleAddCategory}>
                <Text style={styles.modalButtonText}>Ajouter</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: "#999" }]} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalButtonText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#161427" },
  budgetTitle: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  infoCardsContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  infoCard: { backgroundColor: "#2A2550", padding: 10, borderRadius: 12, alignItems: "center", elevation: 5 },
  infoLabel: { color: "#9CA3AF", fontSize: 15, textAlign: "center" },
  infoValue: { color: "#fff", fontSize: 22, fontWeight: "bold", marginTop: 5, textAlign: "center" },
  sectionTitle: { color: "#fff", fontSize: 22, fontWeight: "bold", marginVertical: 15 },
  chartCard: { backgroundColor: "#2A2550", borderRadius: 12, padding: 15, marginBottom: 20, alignItems: "center" },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 15, width: "100%" },
  legendItem: { flexDirection: "row", alignItems: "center", width: "48%", marginBottom: 10 },
  legendColorBox: { width: 15, height: 15, borderRadius: 3, marginRight: 8 },
  legendLabel: { color: "#fff", fontSize: 12, flexShrink: 1 },
  categoryCard: { backgroundColor: "#211C3A", padding: 15, borderRadius: 12, marginBottom: 15 },
  categoryHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  categoryName: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  categoryAmount: { color: "#9CA3AF", fontSize: 14 },
  noDataText: { color: "#9CA3AF", fontSize: 16, textAlign: "center", marginVertical: 20 },
  floatingButton: { 
    position: "absolute", bottom: 30, right: 20, backgroundColor: "#36A2EB",
    width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center",
    elevation: 5
  },
  floatingButtonText: { color: "#fff", fontSize: 32, fontWeight: "bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "85%", backgroundColor: "#2A2550", borderRadius: 12, padding: 20 },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  input: { backgroundColor: "#161427", color: "#fff", padding: 10, borderRadius: 8, marginBottom: 10 },
  modalButton: { flex: 1, backgroundColor: "#36A2EB", padding: 12, borderRadius: 10, margin: 5, alignItems: "center" },
  modalButtonText: { color: "#fff", fontWeight: "bold" },
  deleteButton: { backgroundColor: "#FF3B30", justifyContent: "center", alignItems: "center", width: 100, borderRadius: 12, marginBottom: 15 },
  deleteText: { color: "#fff", fontWeight: "bold" }
});

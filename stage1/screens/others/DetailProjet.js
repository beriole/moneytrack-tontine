// DetailProjet.js
import React from "react";
import { View, Text, SafeAreaView, ScrollView, StyleSheet, Dimensions, TouchableOpacity } from "react-native";
import { PieChart } from "react-native-chart-kit";
import * as Progress from "react-native-progress";
import { useNavigation } from "@react-navigation/native";

const screenWidth = Dimensions.get("window").width;

const COLORS = ["#FF6384","#36A2EB","#FFCE56","#4BC0C0","#9966FF","#FF9F40","#00C49F","#FF6B6B","#0088FE","#FFBB28"];
function getColor(index) { return COLORS[index % COLORS.length]; }

const formatDate = dateStr => {
  const date = new Date(dateStr);
  return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
};

export default function DetailProjet({ route }) {
  const { projet } = route.params;
  const depenseProjets = projet.depenseProjets || [];
  const navigation = useNavigation();

  // Grouper les dépenses par catégorie
  const categoriesMap = {};
  depenseProjets.forEach(dep => {
    const catId = dep.Categorie.id;
    if (!categoriesMap[catId]) {
      categoriesMap[catId] = {
        id: catId,
        nomCategorie: dep.Categorie.nomCategorie,
        montantTotal: 0,
        montantDebloque: 0
      };
    }
    categoriesMap[catId].montantTotal += dep.montant;
    if (dep.statut === "bloqué") {
      categoriesMap[catId].montantDebloque += dep.montant;
    }
  });
  const categories = Object.values(categoriesMap);

  // Totaux du projet
  const totalAmount = categories.reduce((sum, cat) => sum + cat.montantTotal, 0);
  const montantDebloque = categories.reduce((sum, cat) => sum + cat.montantDebloque, 0);
  const montantRestant = projet.budgetTotall - montantDebloque;
  const progress = montantDebloque / projet.budgetTotall;

  // Données pour le camembert
  const pieData = categories.map((cat, index) => ({
    name: cat.nomCategorie,
    population: cat.montantTotal,
    color: getColor(index),
    legendFontColor: "#fff",
    legendFontSize: 12,
    percentage: ((cat.montantTotal / totalAmount) * 100).toFixed(1)
  }));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 15 }}>
        <Text style={styles.projectTitle}>{projet.nom}</Text>

        {/* Statistiques principales */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Budget Total</Text>
            <Text style={styles.statValue}>{projet.budgetTotall.toLocaleString()} FCFA</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Montant Débloqué</Text>
            <Text style={styles.statValue}>{montantDebloque.toLocaleString()} FCFA</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Montant Restant</Text>
            <Text style={styles.statValue}>{montantRestant.toLocaleString()} FCFA</Text>
          </View>
        </View>

        {/* Avancement global */}
        <Text style={styles.sectionTitle}>Avancement du projet</Text>
        <View style={styles.progressCard}>
          <Progress.Bar
            progress={progress}
            width={screenWidth - 30}
            height={25}
            color="#3B82F6"
            borderColor="#1B263B"
            unfilledColor="#1E2A47"
            borderRadius={12}
          />
          <Text style={styles.progressText}>{(progress * 100).toFixed(1)}% terminé</Text>
        </View>

        {/* Dates et état */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Date Début</Text>
            <Text style={styles.statValue}>{formatDate(projet.createdAt)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Date Fin</Text>
            <Text style={styles.statValue}>{formatDate(projet.updatedAt)}</Text>
          </View>
        </View>
        <View style={[styles.statCard, { width: "100%", marginBottom: 20 }]}>
          <Text style={styles.statLabel}>État</Text>
          <Text style={[styles.statValue, { color: projet.etat === "en cours" ? "#3B82F6" : "#16A34A" }]}>
            {projet.etat.toUpperCase()}
          </Text>
        </View>

        {/* Camembert */}
        <Text style={styles.sectionTitle}>Répartition du budget par catégorie</Text>
        <View style={styles.chartCard}>
          {pieData.length > 0 ? (
            <>
              <PieChart
                data={pieData}
                width={screenWidth - 30}
                height={220}
                chartConfig={{
                  backgroundColor: "#0D1B2A",
                  backgroundGradientFrom: "#0D1B2A",
                  backgroundGradientTo: "#0D1B2A",
                  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                  decimalPlaces: 0,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute={false}
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

        {/* Barres de progression par catégorie (cliquables) */}
        <Text style={styles.sectionTitle}>Dépenses par catégorie</Text>
        {categories.map((cat, index) => {
          const catProgress = cat.montantTotal > 0 ? cat.montantDebloque / cat.montantTotal : 0;
          return (
            <TouchableOpacity
              key={index}
              style={styles.categoryCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate("TransactionsCategorieProjet", {
                projetId: projet.id,
                categorieId: cat.id,
                nomCategorie: cat.nomCategorie
              })}
            >
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryName}>{cat.nomCategorie}</Text>
                <Text style={styles.categoryAmount}>
                  {cat.montantDebloque.toLocaleString()} / {cat.montantTotal.toLocaleString()} FCFA
                </Text>
              </View>
              <Progress.Bar
                progress={catProgress}
                width={screenWidth - 40}
                height={18}
                color={getColor(index)}
                borderColor="#1B263B"
                unfilledColor="#1E2A47"
                borderRadius={10}
              />
              <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 3 }}>
                {catProgress === 1 ? "Débloqué" : "Partiellement débloqué"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

// Les styles restent inchangés


// Les styles restent les mêmes que dans ton code actuel
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  projectTitle: { color: "#fff", fontSize: 24, fontWeight: "bold", marginBottom: 15 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  statCard: {
    backgroundColor: "#1E2A47",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
    elevation: 4
  },
  statLabel: { color: "#9CA3AF", fontSize: 14, textAlign: "center" },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "bold", marginTop: 5, textAlign: "center" },
  sectionTitle: { color: "#fff", fontSize: 20, fontWeight: "bold", marginVertical: 15 },
  progressCard: { marginBottom: 20 },
  progressText: { color: "#fff", fontSize: 14, textAlign: "right", marginTop: 5, marginBottom: 10 },
  chartCard: { backgroundColor: "#1E2A47", borderRadius: 12, padding: 15, marginBottom: 20, alignItems: "center" },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 15, width: "100%" },
  legendItem: { flexDirection: "row", alignItems: "center", width: "48%", marginBottom: 10 },
  legendColorBox: { width: 15, height: 15, borderRadius: 3, marginRight: 8 },
  legendLabel: { color: "#fff", fontSize: 12, flexShrink: 1 },
  noDataText: { color: "#9CA3AF", fontSize: 16, textAlign: "center", marginVertical: 20 },
  categoryCard: { backgroundColor: "#1B263B", padding: 15, borderRadius: 12, marginBottom: 15 },
  categoryHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  categoryName: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  categoryAmount: { color: "#9CA3AF", fontSize: 14 }
});

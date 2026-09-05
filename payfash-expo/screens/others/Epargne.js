import React, { useState, useCallback } from "react";
import { 
  View, Text, SafeAreaView, ScrollView, 
  TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Animated 
} from "react-native";
import { AntDesign } from '@expo/vector-icons';
import { useFocusEffect } from "@react-navigation/native"; 
import { Swipeable } from "react-native-gesture-handler";
import api from "../../utils/axiosApi";

export default function Epargne({ navigation }) {
  const [epargnes, setEpargnes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEpargnes = async () => {
    try {
      setLoading(true);
      const response = await api.get("/Epargne/epargnes"); 
      setEpargnes(response.data);
    } catch (error) {
      console.error("Erreur récupération épargnes:", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchEpargnes();
    }, [])
  );

  const handleSupprimer = async (id) => {
    Alert.alert(
      "Confirmer la suppression",
      "Voulez-vous vraiment supprimer cette épargne ?",
      [
        { text: "Annuler", style: "cancel" },
        { 
          text: "Supprimer", 
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/Epargne/epargnes/${id}`);
              setEpargnes(prev => prev.filter(e => e.id !== id));
            } catch (error) {
              console.error("Erreur suppression:", error);
              Alert.alert("Erreur", "Impossible de supprimer l'épargne.");
            }
          }
        }
      ]
    );
  };

  // Swipe amélioré avec icône + texte
  const renderRightActions = (progress, dragX, epargneId) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0.5],
      extrapolate: "clamp",
    });

    return (
      <TouchableOpacity
        style={styles.deleteContainer}
        onPress={() => handleSupprimer(epargneId)}
      >
        <Animated.View style={[styles.deleteButton, { transform: [{ scale }] }]}>
          <AntDesign name="delete" size={24} color="#fff" />
          <Text style={styles.deleteText}>Supprimer</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const montantCumuleTotal = epargnes.reduce((acc, obj) => acc + obj.montant_cumule, 0);
  const totalObjectifs = epargnes.length;
  const objectifsEnCours = epargnes.filter(obj => obj.statut === "en cours").length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>Mes Épargnes</Text>

        <View style={styles.recapContainer}>
          <View style={styles.recapBox}>
            <Text style={styles.recapLabel}>Montant cumulé</Text>
            <Text style={styles.recapValue}>{montantCumuleTotal.toLocaleString()} FCFA</Text>
          </View>
          <View style={styles.recapBox}>
            <Text style={styles.recapLabel}>Objectifs en cours</Text>
            <Text style={styles.recapValue}>{objectifsEnCours}</Text>
          </View>
          <View style={styles.recapBox}>
            <Text style={styles.recapLabel}>Objectifs totaux</Text>
            <Text style={styles.recapValue}>{totalObjectifs}</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>Mes objectifs</Text>
        {epargnes.map(obj => (
          <Swipeable
            key={obj.id}
            renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, obj.id)}
          >
            <TouchableOpacity
              style={styles.objectifCard}
              onPress={() => navigation.navigate("DetailEpargne", { objectif: obj })}
            >
              <Text style={styles.objectifName}>{obj.objectif}</Text>
              <Text style={styles.objectifMontant}>
                {obj.montant_cumule.toLocaleString()} / {obj.montant_total.toLocaleString()} FCFA
              </Text>
              <View
                style={[
                  styles.status,
                  { backgroundColor: obj.statut === "en cours" ? "#6366F1" : "#16A34A" }
                ]}
              >
                <Text style={styles.statusText}>{obj.statut}</Text>
              </View>
            </TouchableOpacity>
          </Swipeable>
        ))}

        <TouchableOpacity
          style={[style.addButton, { backgroundColor: "#4F46E5" }]}
          onPress={() => navigation.navigate("CreateEpargne")}
        >
          <AntDesign name="plus-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={style.addButtonText}>Planifier un Epargne</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#161427" },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 20 },
  recapContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  recapBox: {
    backgroundColor: "#211C3A",
    flex: 1,
    marginHorizontal: 5,
    padding: 15,
    borderRadius: 12,
    alignItems: "center"
  },
  recapLabel: { color: "#9CA3AF", fontSize: 14, marginBottom: 5 },
  recapValue: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  subtitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  objectifCard: {
    backgroundColor: "#211C3A",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15
  },
  objectifName: { color: "#fff", fontSize: 16, fontWeight: "bold", marginBottom: 5 },
  objectifMontant: { color: "#9CA3AF", fontSize: 14 },
  status: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10
  },
  statusText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  deleteContainer: {
    justifyContent: "center",
    alignItems: "flex-end",
    marginVertical: 7,
    borderRadius: 12,
    overflow: "hidden",
  },
  deleteButton: {
    backgroundColor: "#EF4444",
    width: 120,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    padding: 10,
  },
  deleteText: { color: "#fff", fontWeight: "bold", marginLeft: 8 }
});

const style = StyleSheet.create({
  addButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
    marginBottom: 60,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 }
});

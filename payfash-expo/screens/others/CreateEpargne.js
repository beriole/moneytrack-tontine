import React, { useState } from "react";
import { 
  View, Text, SafeAreaView, ScrollView, 
  TouchableOpacity, TextInput, StyleSheet, Alert, Platform 
} from "react-native";
import { AntDesign } from '@expo/vector-icons';
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import API_BASE_URL from "../../utils/config";
import api from "../../utils/axiosApi";

export default function CreateEpargne({ navigation }) {
  const [objectif, setObjectif] = useState("");
  const [montantTotal, setMontantTotal] = useState("");

  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());
  const [showDebut, setShowDebut] = useState(false);
  const [showFin, setShowFin] = useState(false);

  const formatDate = (date) => {
    return date.toISOString().split("T")[0]; 
  };

  const handleCreate = async () => {
    if (!objectif || !montantTotal || !dateDebut || !dateFin) {
      Alert.alert("Erreur", "Tous les champs sont obligatoires");
      return;
    }

    try {
      const response = await api.post(`${API_BASE_URL}/Epargne/epargnes`, {
        objectif,
        montant_total: parseInt(montantTotal),
        date_debut: formatDate(dateDebut),
        date_fin: formatDate(dateFin),
      });

      navigation.replace("SuccesEpargne", { epargne: response.data.epargne });

    } catch (error) {
      console.error(error);
      if (error.response) {
        Alert.alert("Erreur", error.response.data.echec || "Impossible de créer l'épargne");
      } else {
        Alert.alert("Erreur", "Problème de connexion au serveur");
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>Planifier une Épargne</Text>

        {/* Objectif */}
        <Text style={styles.label}>Nom de l'objectif</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Épargne Voiture"
          placeholderTextColor="#9CA3AF"
          value={objectif}
          onChangeText={setObjectif}
        />

        {/* Montant */}
        <Text style={styles.label}>Montant total</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 500000"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          value={montantTotal}
          onChangeText={setMontantTotal}
        />

        {/* Date Début */}
        <Text style={styles.label}>Date de début</Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowDebut(true)}
        >
          <Text style={{ color: "#fff" }}>{formatDate(dateDebut)}</Text>
        </TouchableOpacity>
        {showDebut && (
          <DateTimePicker
            value={dateDebut}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, selectedDate) => {
              setShowDebut(false);
              if (selectedDate) setDateDebut(selectedDate);
            }}
          />
        )}

        {/* Date Fin */}
        <Text style={styles.label}>Date de fin</Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowFin(true)}
        >
          <Text style={{ color: "#fff" }}>{formatDate(dateFin)}</Text>
        </TouchableOpacity>
        {showFin && (
          <DateTimePicker
            value={dateFin}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, selectedDate) => {
              setShowFin(false);
              if (selectedDate) setDateFin(selectedDate);
            }}
          />
        )}

        {/* Bouton */}
        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: "#4F46E5" }]}
          onPress={handleCreate}
        >
          <AntDesign name="check-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.addButtonText}>Valider l'Épargne</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#161427" },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 20 },
  label: { color: "#fff", fontSize: 14, marginTop: 15, marginBottom: 5 },
  input: {
    backgroundColor: "#211C3A",
    color: "#fff",
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
  },
  addButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 15,
    borderRadius: 12,
    marginTop: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});

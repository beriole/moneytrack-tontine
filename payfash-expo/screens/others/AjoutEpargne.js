import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { AntDesign } from '@expo/vector-icons';
import api from "../../utils/axiosApi"; 

export default function AjoutEpargne({ navigation, route }) {
  const { objectif } = route.params || {};

  const [source, setSource] = useState("");
  const [montant, setMontant] = useState("");
  const [loading, setLoading] = useState(false);

  const handleValidation = async () => {
    if (!source || !montant) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs.");
      return;
    }

    if (isNaN(montant) || parseFloat(montant) <= 0) {
      Alert.alert("Erreur", "Le montant doit être un nombre positif.");
      return;
    }

    try {
      setLoading(true);

      // ⚡ Appel au backend pour ajouter la transaction
      const response = await api.post(`/Epargne/epargnes/${objectif.id}/transactions`, {
        montant: parseFloat(montant),
        description: `Ajout depuis ${source}`
      });

      Alert.alert("Succès", "Transaction ajoutée avec succès !");
      // On peut renaviguer vers le détail et rafraîchir
      navigation.navigate("DetailEpargne", { objectif: response.data.epargne });
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Impossible d'ajouter la transaction.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AntDesign
          name="arrow-left"
          size={28}
          color="white"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerText}>Ajouter des fonds</Text>
      </View>

      {objectif && (
        <View style={styles.objectifCard}>
          <Text style={styles.objectifTitle}>{objectif.objectif}</Text>
          <Text style={styles.objectifMontant}>
            Objectif : {(objectif.montant_total || 0).toLocaleString()} FCFA
          </Text>
          <Text style={styles.objectifCumule}>
            Déjà épargné : {(objectif.montant_cumule || 0).toLocaleString()} FCFA
          </Text>
        </View>
      )}

      <Text style={styles.label}>Portefeuille source</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={source}
          onValueChange={(itemValue) => setSource(itemValue)}
          dropdownIconColor="#000"
          style={styles.picker}
        >
          <Picker.Item label="-- Choisir --" value="" />
          <Picker.Item label="Portefeuille Courant" value="courant" />
          <Picker.Item label="Portefeuille Épargne" value="epargne" />
          <Picker.Item label="Portefeuille Projet" value="projet" />
        </Picker>
      </View>

      <Text style={styles.label}>Montant à ajouter</Text>
      <TextInput
        style={styles.input}
        placeholder="Entrez le montant"
        keyboardType="numeric"
        value={montant}
        onChangeText={setMontant}
      />

      <TouchableOpacity style={styles.button} onPress={handleValidation} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Valider</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B223F", padding: 20 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 25, gap: 10 },
  headerText: { color: "white", fontSize: 20, fontWeight: "bold" },

  objectifCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
  },
  objectifTitle: { fontSize: 18, fontWeight: "bold", color: "#0B223F", marginBottom: 6 },
  objectifMontant: { fontSize: 14, color: "#333", marginBottom: 4 },
  objectifCumule: { fontSize: 14, color: "#4F46E5", fontWeight: "bold" },

  label: { color: "white", fontSize: 16, marginTop: 10, marginBottom: 5 },
  pickerContainer: { backgroundColor: "#fff", borderRadius: 10, marginBottom: 15 },
  picker: { height: 50, width: "100%" },
  input: {
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 20,
    color: "black",
    fontWeight: "bold",
  },

  button: {
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  buttonText: { color: "white", fontSize: 18, fontWeight: "bold" },
});

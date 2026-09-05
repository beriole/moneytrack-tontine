import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet } from "react-native";
import AntDesign from "react-native-vector-icons/AntDesign";
import axios from "axios";
import API_BASE_URL from "../../utils/config";
import api from "../../utils/axiosApi";
export default function CreateBudget({ navigation }) {
  const [nom, setNom] = useState("");
  const [montantAllouer, setMontantAllouer] = useState(""); // peut rester mais backend recalculera
  const [periodeDebut, setPeriodeDebut] = useState(new Date().toISOString().split("T")[0]);
  const [periodeFin, setPeriodeFin] = useState(new Date().toISOString().split("T")[0]);

  const [categories, setCategories] = useState([]);
  const [categorieNom, setCategorieNom] = useState("");
  const [categorieDescription, setCategorieDescription] = useState("");
  const [categorieMontant, setCategorieMontant] = useState("");

  // Ajouter une catégorie
  const ajouterCategorie = () => {
    const montantCat = parseInt(categorieMontant);
    if (!categorieNom || !montantCat) {
      Alert.alert("Erreur", "Veuillez entrer un nom et un montant valide.");
      return;
    }

    setCategories([
      ...categories,
      { nom: categorieNom, description: categorieDescription, montant: montantCat }
    ]);
    setCategorieNom("");
    setCategorieDescription("");
    setCategorieMontant("");
  };

  // Supprimer une catégorie avant validation
  const supprimerCategorie = (index) => {
    const newList = [...categories];
    newList.splice(index, 1);
    setCategories(newList);
  };

  // Soumettre le budget au backend
  const creerBudget = async () => {
    if (!nom || categories.length === 0) {
      Alert.alert("Erreur", "Veuillez remplir le nom et ajouter au moins une catégorie.");
      return;
    }

    try {
      const response = await api.post(`${API_BASE_URL}/budget/budget`, {
        nom,
        montantAllouer: parseInt(montantAllouer) || 0, 
        periodeDebut,
        periodeFin,
        categories
      });

      // Aller vers la page de succès avec les infos renvoyées
      navigation.replace("SuccessBudget", { budget: response.data });
    } catch (error) {
      console.log(error);
      if (error.response) {
        Alert.alert("Erreur", error.response.data.message || "Impossible de créer le budget.");
      } else {
        Alert.alert("Erreur", "Problème de connexion au serveur.");
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Créer un Budget</Text>

      <TextInput
        placeholder="Nom du budget"
        placeholderTextColor="#ccc"
        style={styles.input}
        value={nom}
        onChangeText={setNom}
      />
      <TextInput
        placeholder="Montant total alloué (optionnel)"
        placeholderTextColor="#ccc"
        style={styles.input}
        value={montantAllouer}
        onChangeText={setMontantAllouer}
        keyboardType="numeric"
      />

      {/* Catégories */}
      <Text style={styles.subtitle}>Ajouter des catégories</Text>
      <TextInput
        placeholder="Nom de catégorie"
        placeholderTextColor="#ccc"
        style={styles.input}
        value={categorieNom}
        onChangeText={setCategorieNom}
      />
      <TextInput
        placeholder="Description"
        placeholderTextColor="#ccc"
        style={styles.input}
        value={categorieDescription}
        onChangeText={setCategorieDescription}
      />
      <TextInput
        placeholder="Montant"
        placeholderTextColor="#ccc"
        style={styles.input}
        value={categorieMontant}
        onChangeText={setCategorieMontant}
        keyboardType="numeric"
      />
      <TouchableOpacity style={styles.addCatBtn} onPress={ajouterCategorie}>
        <AntDesign name="pluscircleo" size={18} color="#fff" />
        <Text style={styles.addCatText}>Ajouter Catégorie</Text>
      </TouchableOpacity>

      <FlatList
        data={categories}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item, index }) => (
          <View style={styles.catItem}>
            <Text style={styles.catText}>{item.nom} - {item.montant} FCFA</Text>
            <TouchableOpacity onPress={() => supprimerCategorie(index)}>
              <AntDesign name="delete" size={18} color="red" />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Soumission */}
      <TouchableOpacity style={styles.submitBtn} onPress={creerBudget}>
        <Text style={styles.submitText}>Créer Budget</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A", padding: 20 },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  input: {
    backgroundColor: "#1B263B",
    color: "#fff",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10
  },
  subtitle: { color: "#3B82F6", fontSize: 16, fontWeight: "bold", marginVertical: 10 },
  addCatBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3B82F6",
    padding: 10,
    borderRadius: 8,
    marginBottom: 15
  },
  addCatText: { color: "#fff", marginLeft: 8 },
  catItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1E2A47",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8
  },
  catText: { color: "#fff" },
  submitBtn: {
    backgroundColor: "#16A34A",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20
  },
  submitText: { color: "#fff", fontWeight: "bold", fontSize: 16 }
});

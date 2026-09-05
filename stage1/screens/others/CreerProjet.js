import React, { useState } from "react";
import { 
  View, Text, TextInput, TouchableOpacity, 
  FlatList, Alert, StyleSheet, Platform, ActivityIndicator
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import AntDesign from "react-native-vector-icons/AntDesign";
import api from "../../utils/axiosApi";
import API_BASE_URL from "../../utils/config";
export default function CreateProjet({ navigation }) {
  const [nomProjet, setNomProjet] = useState("");
  const [budgetTotal, setBudgetTotal] = useState("");

  const [categories, setCategories] = useState([]);
  const [categorieNom, setCategorieNom] = useState("");
  const [categorieDescription, setCategorieDescription] = useState("");
  const [categorieMontant, setCategorieMontant] = useState("");
  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateDeblocage, setDateDeblocage] = useState(new Date());

  const [showDateDebut, setShowDateDebut] = useState(false);
  const [showDateDeblocage, setShowDateDeblocage] = useState(false);
  const [loading, setLoading] = useState(false);

  const ajouterCategorie = () => {
    const montantCat = parseInt(categorieMontant);
    if (!categorieNom || !montantCat) {
      Alert.alert("Erreur", "Veuillez entrer un nom et un montant valide.");
      return;
    }

    const totalExist = categories.reduce((acc, cat) => acc + cat.montant, 0);
    if (totalExist + montantCat > parseInt(budgetTotal)) {
      Alert.alert("Erreur", "Le montant des catégories dépasse le budget total.");
      return;
    }

    setCategories([
      ...categories,
      { 
        nom: categorieNom, 
        description: categorieDescription, 
        montant: montantCat, 
        dateDebut, 
        dateDeblocage 
      }
    ]);

    setCategorieNom("");
    setCategorieDescription("");
    setCategorieMontant("");
    setDateDebut(new Date());
    setDateDeblocage(new Date());
  };

  const supprimerCategorie = (index) => {
    const newList = [...categories];
    newList.splice(index, 1);
    setCategories(newList);
  };

  const creerProjet = async () => {
    if (!nomProjet || !budgetTotal || categories.length === 0) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs et ajouter au moins une catégorie.");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post(`${API_BASE_URL}/budget/createProjet`, {
        nomProjet,
        budgetTotal: parseInt(budgetTotal),
        depenses: categories.map(cat => ({
          nomCategorie: cat.nom,
          description: cat.description,
          montant: cat.montant,
          dateDeblocage: cat.dateDeblocage
        }))
      });

      // Vérification réponse backend
      if (response.status === 200 || response.status === 201) {
        Alert.alert("Succès", response.data.message || "Projet créé avec succès !");
        navigation.goBack();
      } else {
        Alert.alert("Erreur", response.data.error || "Impossible de créer le projet.");
      }
    } catch (error) {
      console.error(error.response?.data || error.message);
      const msg = error.response?.data?.message || error.response?.data?.error || "Erreur lors de la création du projet.";
      Alert.alert("Erreur", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Créer un Projet</Text>

      <TextInput
        placeholder="Nom du projet"
        placeholderTextColor="#ccc"
        style={styles.input}
        value={nomProjet}
        onChangeText={setNomProjet}
      />
      <TextInput
        placeholder="Budget total"
        placeholderTextColor="#ccc"
        style={styles.input}
        value={budgetTotal}
        onChangeText={setBudgetTotal}
        keyboardType="numeric"
      />

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

      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDateDebut(true)}>
        <Text style={styles.dateText}>Date Début: {dateDebut.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showDateDebut && (
        <DateTimePicker
          value={dateDebut}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            setShowDateDebut(false);
            if (selectedDate) setDateDebut(selectedDate);
          }}
        />
      )}

      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDateDeblocage(true)}>
        <Text style={styles.dateText}>Date Déblocage: {dateDeblocage.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showDateDeblocage && (
        <DateTimePicker
          value={dateDeblocage}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            setShowDateDeblocage(false);
            if (selectedDate) setDateDeblocage(selectedDate);
          }}
        />
      )}

      <TouchableOpacity style={styles.addCatBtn} onPress={ajouterCategorie}>
        <AntDesign name="pluscircleo" size={18} color="#fff" />
        <Text style={styles.addCatText}>Ajouter Catégorie</Text>
      </TouchableOpacity>

      <FlatList
        data={categories}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item, index }) => (
          <View style={styles.catItem}>
            <Text style={styles.catText}>
              {item.nom} - {item.montant} FCFA {"\n"}
              Début: {new Date(item.dateDebut).toLocaleDateString()} | 
              Déblocage: {new Date(item.dateDeblocage).toLocaleDateString()}
            </Text>
            <TouchableOpacity onPress={() => supprimerCategorie(index)}>
              <AntDesign name="delete" size={18} color="red" />
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity 
        style={[styles.submitBtn, loading && { opacity: 0.6 }]}
        onPress={creerProjet}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Créer Projet</Text>}
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
  dateBtn: {
    backgroundColor: "#1E2A47",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10
  },
  dateText: { color: "#fff" },
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
  catText: { color: "#fff", flex: 1, marginRight: 5 },
  submitBtn: {
    backgroundColor: "#16A34A",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20
  },
  submitText: { color: "#fff", fontWeight: "bold", fontSize: 16 }
});

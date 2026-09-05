import React, { useState, useEffect } from "react";
import { 
  View, Text, SafeAreaView, ScrollView, TextInput, 
  TouchableOpacity, Alert, StyleSheet, ActivityIndicator 
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import AntDesign from "react-native-vector-icons/AntDesign";
import api from "../../utils/axiosApi";

export default function Depense() {
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [typeContexte, setTypeContexte] = useState("budget");
  const [contexte, setContexte] = useState("");
  const [categorie, setCategorie] = useState("");
  const [montant, setMontant] = useState("");
  const [numero, setNumero] = useState("");
  const [destinateur, setDestinateur] = useState("");
  const [description, setDescription] = useState("");

  const [budgets, setBudgets] = useState([]);
  const [projets, setProjets] = useState([]);
  const [categories, setCategories] = useState([]);

  // Charger les contextes utilisateur
  const fetchContextes = async () => {
    try {
      setLoading(true);
      const res = await api.get("/budget/contexte");
      setBudgets(res.data.budgets || []);
      setProjets(res.data.projets || []);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      console.error(err);
      Alert.alert("Erreur", "Impossible de récupérer les budgets et projets");
    }
  };

  useEffect(() => {
    fetchContextes();
  }, []);

  // Mettre à jour les catégories selon le contexte sélectionné
  useEffect(() => {
    if (typeContexte === "budget") {
      const budget = budgets.find(b => b.id === contexte);
      setCategories(budget && budget.Categories ? budget.Categories : []);
    } else {
      const projet = projets.find(p => p.id === contexte);
      const cats = projet && projet.depenseProjets
        ? projet.depenseProjets
            .map(d => d.Categorie)
            .filter(c => c) // enlever undefined
        : [];
      // supprimer doublons
      const uniqueCats = cats.filter(
        (v, i, a) => a.findIndex(t => t.id === v.id) === i
      );
      setCategories(uniqueCats);
    }
    setCategorie(""); // reset catégorie à chaque changement de contexte
  }, [contexte, typeContexte, budgets, projets]);

  const handleValidation = async () => {
    if (!contexte || !categorie || !montant || !numero || !destinateur) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs obligatoires");
      return;
    }

    const payload = {
      typeContexte,
      contexteId: contexte,
      categorieId: categorie,
      montant,
      numero,
      destinateur,
      description
    };

    try {
      const res = await api.post("/budget/depenses", payload);

      if (res.status === 201) {
        Alert.alert("Succès", res.data.message || "Dépense enregistrée", [
          { text: "OK", onPress: () => navigation.navigate("SuccesDepense") }
        ]);

        // reset formulaire
        setMontant("");
        setNumero("");
        setDestinateur("");
        setDescription("");
        setContexte("");
        setCategorie("");
      } else {
        Alert.alert("Erreur", res.data?.error || "Une erreur inconnue est survenue");
      }
    } catch (err) {
      if (err.response) {
        const status = err.response.status;
        let msg = "Erreur inconnue";
        if (status === 400) msg = err.response.data?.error || "Requête invalide";
        else if (status === 401) msg = "Vous n'êtes pas autorisé. Veuillez vous reconnecter";
        else if (status === 404) msg = err.response.data?.error || "Ressource introuvable";
        else if (status >= 500) msg = "Erreur serveur. Veuillez réessayer plus tard";
        Alert.alert("Erreur", msg);
      } else if (err.request) {
        Alert.alert("Erreur", "Pas de réponse du serveur. Vérifiez votre connexion");
      } else {
        Alert.alert("Erreur", "Erreur inattendue: " + err.message);
      }
      console.error(err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: "#fff", marginTop: 10 }}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <AntDesign
            name="arrowleft"
            onPress={() => navigation.goBack()}
            size={29}
            color={"white"}
          />
          <Text style={styles.title}>Nouvelle Dépense</Text>
        </View>

        <Text style={styles.label}>Type de contexte</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={typeContexte}
            onValueChange={val => {
              setTypeContexte(val);
              setContexte("");
            }}
            style={styles.picker}
          >
            <Picker.Item label="Budget" value="budget" />
            <Picker.Item label="Projet" value="projet" />
          </Picker>
        </View>

        <Text style={styles.label}>
          {typeContexte === "budget" ? "Choisir un budget" : "Choisir un projet"}
        </Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={contexte}
            onValueChange={val => setContexte(val)}
            style={styles.picker}
          >
            <Picker.Item label="Sélectionner..." value="" />
            {typeContexte === "budget"
              ? budgets.map(b => <Picker.Item key={b.id} label={b.nom} value={b.id} />)
              : projets.map(p => <Picker.Item key={p.id} label={p.nom} value={p.id} />)}
          </Picker>
        </View>

        <Text style={styles.label}>Catégorie de dépense</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={categorie}
            onValueChange={val => setCategorie(val)}
            style={styles.picker}
          >
            <Picker.Item label="Sélectionner une catégorie" value="" />
            {categories.map(c => (
              <Picker.Item key={c.id} label={c.nomCategorie || c.nom} value={c.id} />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Montant</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 25000"
          placeholderTextColor="#bbb"
          keyboardType="numeric"
          value={montant}
          onChangeText={setMontant}
        />

        <Text style={styles.label}>Numéro de paiement</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 690000000"
          placeholderTextColor="#bbb"
          keyboardType="phone-pad"
          value={numero}
          onChangeText={setNumero}
        />

        <Text style={styles.label}>Nom du destinateur</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Jean Dupont"
          placeholderTextColor="#bbb"
          value={destinateur}
          onChangeText={setDestinateur}
        />

        <Text style={styles.label}>Description (optionnelle)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Dépense pour ..."
          placeholderTextColor="#bbb"
          value={description}
          onChangeText={setDescription}
        />

        <TouchableOpacity style={styles.button} onPress={handleValidation}>
          <Text style={styles.buttonText}>Valider</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  title: { fontSize: 22, fontWeight: "bold", color: "#fff" },
  label: { color: "#fff", fontWeight: "600", marginBottom: 5, marginTop: 15 },
  input: { backgroundColor: "#1E293B", color: "#fff", padding: 12, borderRadius: 12 },
  pickerContainer: { backgroundColor: "#1E293B", borderRadius: 12, marginBottom: 10 },
  picker: { color: "#fff", height: 50 },
  button: { backgroundColor: "#3B82F6", padding: 15, borderRadius: 12, alignItems: "center", marginTop: 25 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});

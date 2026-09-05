import React, { useEffect, useState } from "react";
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, 
  ActivityIndicator, Modal, TextInput 
} from "react-native";
import api from "../../utils/axiosApi";

export default function PlanDetails({ navigation, route }) {
  const { plan } = route.params;
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [numero, setNumero] = useState("");

  // Charger les détails du plan depuis le backend
  const fetchPlanDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/plan/plan/${plan.id}`);
      setDetails(response.data.detailPlans || []);
      setLoading(false);
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Impossible de récupérer les détails du plan");
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlanDetails(); }, []);

  const handleSouscrire = () => {
    setModalVisible(true);
  };
const confirmerSouscription = async () => {
  if (!numero || numero.length < 8) {
    Alert.alert("Erreur", "Numéro invalide");
    return;
  }

  try {
    // const url = `http://mettiss.org/orange-stagiaire?montant=${plan.prix}&numero=${numero}&motif=paiement`;
    // const response = await fetch(url);

    // if (!response.ok) {
    //   Alert.alert("Erreur", `Erreur serveur paiement: ${response.status}`);
      
    // }

    // const data = await response.json();
    // if (!data || data.length === 0) {
    //   Alert.alert("Erreur", "Réponse du serveur de paiement vide");
      
    // }

    // const paiementInfo = data[0];

    // // Vérification du statut
    // if (paiementInfo.status !== "PENDING") {
    //   Alert.alert(
    //     "Paiement non initié",
    //     `Impossible d'initier le paiement. Statut reçu : ${paiementInfo.status}`
    //   );
      
    // }


    // Enregistrer le paiement côté backend
    await api.post("plan/paiement/create", {
      
      planId: plan.id,
      montant: plan.prix,
      payToken: true,
      status: "success",
      motif: "paiement"
    });

    setModalVisible(false);

    Alert.alert(
      "Succès",
      "Paiement initié avec succès ! Veuillez confirmer via Orange Money.",
      [
        {
          text: "OK",
          onPress: () =>
            navigation.navigate("SuccesSoucrire", {
              plan,
              payToken: true,
              status: "succes",
              numero:numero
            })
        }
      ]
    );
  } catch (error) {
    console.error(error);
    Alert.alert("Erreur", "Erreur lors du paiement ou de l'enregistrement du paiement");
  }
};

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{plan.nom}</Text>
      <Text style={styles.description}>{plan.description}</Text>
      <Text style={styles.price}>Prix: {plan.prix} FCFA</Text>

      <Text style={styles.subtitle}>Détails du plan :</Text>
      {details.map((d) => (
        <View key={d.id} style={styles.detailCard}>
          <Text style={styles.detailText}>• {d.detail}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.button} onPress={handleSouscrire}>
        <Text style={styles.buttonText}>Souscrire</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
        <Text style={styles.secondaryText}>Retour</Text>
      </TouchableOpacity>

      {/* Modal pour le numéro de téléphone */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Titre principal */}
            <Text style={styles.modalTitle}>Finaliser votre souscription</Text>

            {/* Texte explicatif */}
            <Text style={styles.modalDescription}>
              Pour souscrire au plan "{plan.nom}", veuillez entrer le numéro de téléphone
              à partir duquel le paiement sera effectué. 
            </Text>

            {/* Champ de saisie */}
            <TextInput
              style={styles.input}
              placeholder="Numéro de téléphone"
              placeholderTextColor={'black'}
              keyboardType="phone-pad"
              value={numero}
              onChangeText={setNumero}
            />

            {/* Bouton de validation */}
            <TouchableOpacity style={styles.modalButton} onPress={confirmerSouscription}>
              <Text style={styles.modalButtonText}>Valider et payer</Text>
            </TouchableOpacity>

            {/* Bouton annuler */}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  modalDescription: {
  fontSize: 14,
  color: "#333",
  textAlign: "center",
  marginBottom: 15,
},
  container: { flex: 1, backgroundColor: "#0B223F", padding: 20 },
  title: { fontSize: 26, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 10 },
  description: { fontSize: 16, color: "#d1d1d1", textAlign: "center", marginBottom: 15 },
  price: { fontSize: 16, color: "#FFD700", textAlign: "center", marginBottom: 20 },
  subtitle: { fontSize: 18, color: "#fff", fontWeight: "bold", marginBottom: 10 },
  detailCard: { backgroundColor: "#1C2A48", padding: 12, borderRadius: 10, marginBottom: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  detailText: { color: "#d1d1d1", fontSize: 14 },
  button: { backgroundColor: "#4F46E5", paddingVertical: 14, paddingHorizontal: 50, borderRadius: 12, marginTop: 20, marginBottom: 10, alignSelf: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { borderColor: "#4F46E5", borderWidth: 2, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 12, alignSelf: "center",marginBottom:23 },
  secondaryText: { color: "#4F46E5", fontSize: 15, fontWeight: "600" },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center' },
  modalContainer: { backgroundColor:'#fff', padding:20, borderRadius:12, width:'80%', alignItems:'center' },
  modalTitle: { fontSize:18, fontWeight:'bold', marginBottom:15 },
  input: { borderWidth:1, borderColor:'#ccc', borderRadius:8, width:'100%', padding:10, marginBottom:15,color:'black' },
  modalButton: { backgroundColor:'#4F46E5', padding:12, borderRadius:10, width:'100%', marginBottom:10, alignItems:'center' },
  modalButtonText: { color:'#fff', fontWeight:'bold', fontSize:16 },
  modalCancel: { padding:10 },
  modalCancelText: { color:'#4F46E5', fontWeight:'bold', fontSize:16 },
});

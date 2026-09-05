import { 
  View, Text, SafeAreaView, StyleSheet, TextInput, TouchableOpacity, 
  ScrollView, Alert 
} from 'react-native';
import React, { useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import AntDesign from 'react-native-vector-icons/AntDesign';
import api from "../../utils/axiosApi";  

export default function Recharge() {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [operator, setOperator] = useState('');
  const [reason, setReason] = useState('');
  const [montant, setMontant] = useState('');
  const Navigation = useNavigation();

  const handleValidation = async () => {
    if (!phone || !fullName || !operator || !reason || !montant) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    try {
      // 🔗 Appel vers ton backend
      const response = await api.post("/wallet/deposit", {
        typePortefeuille:'courant',  // ou "courant" / "epargne" si c'est ça ton modèle
        montant: parseFloat(montant),
      });

      Alert.alert(
        "Succès",
        response.data.message,
        [
          {
            text: "OK",
            onPress: () => Navigation.navigate("SuccesRecharge")
          }
        ]
      );
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Erreur",
        error.response?.data?.error || "Échec de la recharge"
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        
        {/* Header */}
        <View style={styles.header}>
          <AntDesign name="arrowleft" onPress={() => Navigation.goBack()} size={26} color={'white'} />
          <Text style={styles.title}>Recharger Mobile Money</Text>
        </View>

        {/* Numéro de téléphone */}
        <Text style={styles.label}>Numéro de téléphone</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 690000000"
          placeholderTextColor="#bbb"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        {/* Nom complet */}
        <Text style={styles.label}>Nom complet</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Jean Dupont"
          placeholderTextColor="#bbb"
          value={fullName}
          onChangeText={setFullName}
        />

        {/* Montant */}
        <Text style={styles.label}>Montant</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 5000"
          placeholderTextColor="#bbb"
          keyboardType="numeric"
          value={montant}
          onChangeText={setMontant}
        />

        {/* Opérateur */}
        <Text style={styles.label}>Opérateur</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={operator}
            onValueChange={(itemValue) => setOperator(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Sélectionner un opérateur" value="" />
            <Picker.Item label="Portefeuille courant" value="courant" />
            <Picker.Item label="Portefeuille épargne" value="epargne" />
          </Picker>
        </View>

        {/* Motif de la recharge */}
        <Text style={styles.label}>Motif de la recharge</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={reason}
            onValueChange={(itemValue) => setReason(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Sélectionner un motif" value="" />
            <Picker.Item label="Salaire" value="Salaire" />
            <Picker.Item label="Commerce" value="Commerce" />
            <Picker.Item label="Cadeau" value="Don" />
            <Picker.Item label="Autre" value="Autre" />
          </Picker>
        </View>

        {/* Bouton */}
        <TouchableOpacity style={styles.button} onPress={handleValidation}>
          <Text style={styles.buttonText}>Valider</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D1B2A' },
  header: { flexDirection:'row', alignItems:'center', marginBottom:20, gap:10 },
  title: { fontSize:20, fontWeight:'bold', color:'#fff' },
  label: { color:'#fff', fontWeight:'600', marginBottom:5, marginTop:15 },
  input: { backgroundColor:'#1E293B', color:'#fff', padding:12, borderRadius:12 },
  pickerContainer: { backgroundColor:'#1E293B', borderRadius:12, marginBottom:10 },
  picker: { color:'#fff', height:50 },
  button: { backgroundColor:'#3B82F6', padding:15, borderRadius:12, alignItems:'center', marginTop:20 },
  buttonText: { color:'#fff', fontWeight:'bold', fontSize:16 }
});

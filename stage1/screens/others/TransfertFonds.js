import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import AntDesign from 'react-native-vector-icons/AntDesign';
import axios from 'axios';
import api from '../../utils/axiosApi';
export default function TransfertFonds({ navigation }) {
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);
  const [montant, setMontant] = useState('');

  const handleValidation = async () => {
    if (!source || !destination || !montant) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }
    if (source === destination) {
      Alert.alert('Erreur', 'Le portefeuille source et destination doivent être différents.');
      return;
    }

    try {
      const response = await api.post(
        "/wallet/transfer",
        {
          fromType: source,
          toType: destination,
          montant: parseFloat(montant)
        }
      );

      if (response.status === 201) {
        Alert.alert("Succès", response.data.message, [
          { text: "OK", onPress: () => navigation.navigate("SuccesTransfert") }
        ]);
      } else {
        Alert.alert("Erreur", response.data.error || "Échec du transfert");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", error.response?.data?.error || "Problème de connexion");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AntDesign name="arrowleft" size={28} color="white" onPress={() => navigation.goBack()} />
        <Text style={styles.headerText}>Transfert de fonds</Text>
      </View>

      <Text style={styles.label}>Portefeuille source</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={source}
          onValueChange={(itemValue) => setSource(itemValue)}
          style={styles.picker}
          dropdownIconColor="#FFF"
        >
          <Picker.Item label="-- Choisir --" value={null} />
          <Picker.Item label="Portefeuille Courant" value="courant" />
          <Picker.Item label="Portefeuille Épargne" value="epargne" />
          <Picker.Item label="Portefeuille Projet" value="projet" />
        </Picker>
      </View>

      <Text style={styles.label}>Portefeuille destination</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={destination}
          onValueChange={(itemValue) => setDestination(itemValue)}
          style={styles.picker}
          dropdownIconColor="#FFF"
        >
          <Picker.Item label="-- Choisir --" value={null} />
          <Picker.Item label="Portefeuille Courant" value="courant" />
          <Picker.Item label="Portefeuille Épargne" value="epargne" />
          <Picker.Item label="Portefeuille Projet" value="projet" />
        </Picker>
      </View>

      <Text style={styles.label}>Montant à transférer</Text>
      <TextInput
        style={styles.input}
        placeholder="Entrez le montant"
        keyboardType="numeric"
        value={montant}
        onChangeText={setMontant}
      />

      <TouchableOpacity style={styles.button} onPress={handleValidation}>
        <Text style={styles.buttonText}>Valider</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B223F', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, gap: 10 },
  headerText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  label: { color: 'white', fontSize: 19, marginTop: 10, marginBottom: 5 },
  pickerContainer: { backgroundColor: '#1E293B', borderRadius: 10, marginBottom: 15 },
  picker: { height: 50, width: '100%', color: 'white' },
  input: {
    backgroundColor: 'white',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 20,
    color: 'black',
    fontWeight: 'bold'
  },
  button: { backgroundColor: '#1E90FF', borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});

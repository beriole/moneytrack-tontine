import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AntDesign from 'react-native-vector-icons/AntDesign';

export default function SuccesTransfert() {
    const Navigation=useNavigation();
  return (
    <View style={styles.container}>

      <View style={styles.iconContainer}>
        <AntDesign name="checkcircle" size={90} color="#4CAF50" />
      </View>


      <Text style={styles.title}>Transfert réussi !</Text>
      <Text style={styles.subtitle}>
        Votre transfert de fonds a été effectué avec succès.
      </Text>


      <TouchableOpacity 
        style={styles.button} 
         onPress={() => Navigation.navigate('Home')}
      >
        <Text style={styles.buttonText}>Retour à l'accueil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0B223F', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  iconContainer: { marginBottom: 30 },
  title: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: 'white', 
    marginBottom: 10,
    textAlign: 'center'
  },
  subtitle: { 
    fontSize: 16, 
    color: '#dcdcdc', 
    textAlign: 'center', 
    marginBottom: 40 
  },
  button: { 
    backgroundColor: '#1E90FF', 
    paddingVertical: 15, 
    paddingHorizontal: 30, 
    borderRadius: 12 
  },
  buttonText: { 
    color: 'white', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
});

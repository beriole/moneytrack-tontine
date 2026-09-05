import { View, Text, SafeAreaView, StyleSheet, TouchableOpacity } from 'react-native';
import React from 'react';
import { AntDesign } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function SuccesDepense() {
  const Navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        <View style={styles.iconContainer}>
          <AntDesign name="check-circle" size={100} color="#22C55E" />
        </View>

        
        <Text style={styles.title}>Dépense effectuée avec succès !</Text>
        <Text style={styles.subtitle}>Votre dépense a été enregistrée dans votre budget/projet.</Text>

        
        <TouchableOpacity style={styles.button} onPress={() => Navigation.navigate('Home')}>
          <Text style={styles.buttonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:1,
    backgroundColor:'#161427',
    justifyContent:'center',
    alignItems:'center',
    padding:20
  },
  content:{
    alignItems:'center'
  },
  iconContainer:{
    backgroundColor:'#211C3A',
    borderRadius:150,
    padding:30,
    marginBottom:30
  },
  title:{
    fontSize:22,
    fontWeight:'bold',
    color:'#fff',
    textAlign:'center',
    marginBottom:10
  },
  subtitle:{
    fontSize:16,
    color:'#bbb',
    textAlign:'center',
    marginBottom:30
  },
  button:{
    backgroundColor:'#6366F1',
    paddingVertical:15,
    paddingHorizontal:40,
    borderRadius:12
  },
  buttonText:{
    color:'#fff',
    fontWeight:'bold',
    fontSize:16
  }
});

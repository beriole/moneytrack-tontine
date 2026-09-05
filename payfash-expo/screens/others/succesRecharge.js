import { View, Text, SafeAreaView, StyleSheet, TouchableOpacity } from 'react-native';
import React from 'react';
import { FontAwesome as Icon } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function SuccessRecharge({ navigation }) {
    const Navigation=useNavigation();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Icon name="check-circle" size={100} color="#22C55E" />
        <Text style={styles.title}>Recharge effectuée avec succès !</Text>
        <TouchableOpacity style={styles.button} onPress={() => Navigation.navigate('Home')}>
          <Text style={styles.buttonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:{
    flex:1,
    backgroundColor:'#161427',
    justifyContent:'center',
    alignItems:'center'
  },
  content:{
    justifyContent:'center',
    alignItems:'center'
  },
  title:{
    color:'#fff',
    fontSize:22,
    fontWeight:'bold',
    marginVertical:20,
    textAlign:'center'
  },
  button:{
    backgroundColor:'#6366F1',
    paddingVertical:12,
    paddingHorizontal:30,
    borderRadius:12,
    marginTop:20
  },
  buttonText:{
    color:'#fff',
    fontWeight:'bold',
    fontSize:16
  }
});

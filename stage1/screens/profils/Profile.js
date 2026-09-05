import { View, Text, SafeAreaView, ScrollView, Image, StyleSheet, TouchableOpacity } from 'react-native'
import React from 'react'
import AntDesign from 'react-native-vector-icons/AntDesign';
import { useNavigation, useRoute } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Entypo from 'react-native-vector-icons/Entypo';
export default function Profile() {
  const Navigation = useNavigation();
  const Route=useRoute();
  const {solde}=Route.params;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B2A' }}>
        <View style={{position:'relative',top:10,right:-310}}>
          <TouchableOpacity onPress={()=>Navigation.navigate('Setting')} style={{zIndex:100}}>
              <Entypo name="cog" size={27} color="#fff" />
          </TouchableOpacity>
            
        </View>

      <ScrollView contentContainerStyle={style.scroll} >
        
        
        <View style={style.container}>
          <View style={style.profile}>
            <Image source={require('../../assets/logo/icon-512.png')} style={style.image} />
            <TouchableOpacity style={style.profileEdit}>
              <AntDesign name="edit" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={style.name}>Nom Utilisateur</Text>
          <Text style={style.email}>utilisateur@exemple.com</Text>
        </View>

      
        <LinearGradient colors={['#1E90FF', '#00C49A']} style={style.cardWallet}>
          <Text style={style.walletTitle}>Wallet</Text>
          <Text style={style.walletSubtitle}>Solde Principal</Text>
          <Text style={style.walletBalance}>{solde} FCFA</Text>
        </LinearGradient>

        
        <View style={style.group}>
          <Text style={style.groupTitle}>Mon Profil</Text>
          <TouchableOpacity style={style.buttonPrimary}><Text style={style.buttonText}>Modifier Profil</Text></TouchableOpacity>
          <TouchableOpacity style={style.buttonPrimary}><Text style={style.buttonText}>Mes Statistiques</Text></TouchableOpacity>
          <TouchableOpacity style={style.buttonPrimary} onPress={() => Navigation.navigate('map')}><Text style={style.buttonText} >Recommandations intelligentes</Text></TouchableOpacity>
          <TouchableOpacity style={style.buttonPrimary}><Text style={style.buttonText}>Mes Portefeuille</Text></TouchableOpacity>
        </View>

     
        <View style={style.group}>
          <Text style={style.groupTitle}>Sécurité</Text>
          <TouchableOpacity style={style.buttonPrimary}><Text style={style.buttonText}>Politique de confidentialité</Text></TouchableOpacity>
          <TouchableOpacity style={style.buttonPrimary}><Text style={style.buttonText}>Conseils & Sécurité</Text></TouchableOpacity>
          <TouchableOpacity style={style.buttonDanger} onPress={() => Navigation.navigate('HomeScreen')}>
            <Text style={style.buttonText}>Déconnexion</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[{marginBottom:50},style.buttonOutline]}><Text style={style.buttonOutlineText}>Supprimer le compte</Text></TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const style = StyleSheet.create({
  scroll: {
    paddingVertical: 20,
    alignItems: 'center'
  },
  container: {
    alignItems: 'center',
    marginBottom: 20,
  },
  profile: {
    position: 'relative',
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#00C49A',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  profileEdit: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#1E90FF',
    padding: 8,
    borderRadius: 20,
  },
  name: {
    marginTop: 15,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff'
  },
  email: {
    color: '#ccc',
    fontSize: 14,
  },
  cardWallet: {
    width: 320,
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    marginBottom: 25,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  walletTitle: {
    fontSize: 22,
    color: '#fff',
    fontWeight: 'bold',
  },
  walletSubtitle: {
    fontSize: 14,
    color: '#e0e0e0',
    marginTop: 5,
  },
  walletBalance: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
  },
  group: {
    width: '90%',
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  buttonPrimary: {
    backgroundColor: '#1B263B',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    alignItems: 'center',
  },
  buttonDanger: {
    backgroundColor: '#D72638',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    alignItems: 'center',
  },
  buttonOutline: {
    borderColor: '#D72638',
    borderWidth: 1,
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600'
  },
  buttonOutlineText: {
    color: '#D72638',
    fontWeight: '600'
  }
})

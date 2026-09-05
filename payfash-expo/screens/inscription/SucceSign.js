import { View, Text, SafeAreaView, Image, ImageBackground, Button, TouchableOpacity, TextInput,StyleSheet} from 'react-native'
import React from 'react'
import { useNavigation } from '@react-navigation/native'

export default function SucceSign() {
  const Navigation=useNavigation();
  return (
    <SafeAreaView style={{flex:1, backgroundColor:'white',padding:20}}>
        <Text style={{fontSize:33,color:'#4F46E5',fontWeight:'bold',textAlign:'left'}}>Compte créé avec succès!</Text>
        <Text style={{fontSize:19, color:'black',fontWeight:'bold',textAlign:'left'}}>Bienvenue sur MoneyTrack</Text>

      <View style={{alignItems:'center'}}>
          <Image source={require('../../assets/images/succes.png')} resizeMode='contain' style={{width:350,height:400,marginTop:28}}/>
            <Text style={{color:'black',fontSize:20}}>Votre compte est maintenant actif</Text>
            <Text style={{color:'green',fontSize:40,fontWeight:'bold'}}>Opération réussie !</Text>
            <TouchableOpacity onPress={()=>Navigation.navigate('Menu')} style={{backgroundColor:'#4F46E5',padding:15,borderRadius:15,width:300,justifyContent:'center',alignItems:'center',marginTop:40}}>
                <Text style={{color:'white',fontSize:20, fontWeight:'bold'}}>Continuer</Text>
            </TouchableOpacity>
            <View style={{flexDirection:'row',marginTop:30,gap:5}}>
              <Text onPress={()=>Navigation.navigate('HomeScreen')} style={{color:'#4F46E5',fontWeight:'bold', fontSize:15}}>Connectez-vous ultérieurement?</Text>
            </View>
            
      </View>
    </SafeAreaView>
  )
}

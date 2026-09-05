import { View, Text, SafeAreaView, Image, ImageBackground, Button, TouchableOpacity, TextInput,StyleSheet} from 'react-native'
import React from 'react'
import { useNavigation } from '@react-navigation/native'

export default function SuccesReset() {
  const Navigation=useNavigation();
  return (
    <SafeAreaView style={{flex:1, backgroundColor:'white',padding:20}}>
        <Text style={{fontSize:25,color:'#2B4794',fontWeight:'bold',textAlign:'left'}}>Mot de passe modifié avec succès !</Text>
        <Text style={{fontSize:19, color:'black',fontWeight:'bold',textAlign:'left'}}>Tout est en ordre maintenant</Text>

      <View style={{alignItems:'center'}}>
          <Image source={require('../../assets/images/succesReset.png')} resizeMode='contain' style={{width:350,height:400,marginTop:28}}/>
            <Text style={{color:'black',fontSize:20}}>Votre mot de passe a été réinitialisé</Text>
            <Text style={{color:'green',fontSize:40,fontWeight:'bold'}}>Opération réussie !</Text>
            <TouchableOpacity onPress={()=>Navigation.navigate('Menu')} style={{backgroundColor:'#2B4794',padding:15,borderRadius:15,width:300,justifyContent:'center',alignItems:'center',marginTop:40}}>
                <Text style={{color:'white',fontSize:20, fontWeight:'bold'}}>Continuer</Text>
            </TouchableOpacity>
            <View style={{flexDirection:'row',marginTop:30,gap:5}}>
              <Text  onPress={()=>Navigation.navigate('HomeScreen')}  style={{color:'#2B4794',fontWeight:'bold', fontSize:15}}>Connectez-vous ultérieurement?</Text>
            </View>
            
      </View>
    </SafeAreaView>
  )
}

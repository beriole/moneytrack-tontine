import { View, Text, SafeAreaView, Image, ImageBackground, Button, TouchableOpacity, TextInput,StyleSheet} from 'react-native'
import React, { useState } from 'react'
import { useNavigation, useRoute } from '@react-navigation/native'
import { ScrollView } from 'react-native-gesture-handler';
import AntDesign from 'react-native-vector-icons/AntDesign';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Toast from 'react-native-toast-message';
import API_BASE_URL from '../../utils/config';
import axios from 'axios';
export default function ResetPassword() {
  const route=useRoute();
  const Navigation=useNavigation();
  const[Password,setPassword]=useState("");
  const [confirPass,setConfirPass]=useState("");
  const [loading,setLoading]=useState("");
    const { email } = route.params
  const handleValidation=async ()=>{
       if (loading) return;
       setLoading(true);
        try {
          if(Password===""||confirPass===""||Password!=confirPass){
            return Toast.show({
                            type: "error",
                            text1: "echecs",
                            text2: "mot de passe ou nom d'utilisateur erroné",
                            position: "bottom",
                            visibilityTime: 2000 
                       });
          }
          const res = await axios.post(`${API_BASE_URL}/auth/reset`,{email:email, nouveauMotDePasse:Password});
       
          console.log(res.data);
         if(res.status===200){
               Toast.show({
                type: "success",
                text1: "Succès 🎉",
                text2: "votre mot de passe a ete reinitialiser",
                position: "bottom",
                visibilityTime: 2000 ,
                onHide:()=>{ Navigation.navigate("SuccesReset")}
              });
            
          }else{
               
               Toast.show({
                type: "error",
                text1: "echecs",
                text2: "echec de la reinitialisation de mot de passe",
                position: "bottom",
                visibilityTime: 2000 
              });
          }
       
        } catch (error) {
       
          console.log(error);
            Toast.show({
                type: "error",
                text1: "echecs",
                text2: "erreur serveur",
                position: "bottom",
                visibilityTime: 2000 
              });
       
        }finally{
          setLoading(false);
        }
       
  }
  return (
    <SafeAreaView style={{flex:1, backgroundColor:'white',padding:20}}>
        <ScrollView>
                <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4,marginBottom:18}}>
                    <AntDesign onPress={()=>Navigation.goBack()} name='arrowleft' size={26} color={'black'}/>
                    <FontAwesome name="moon-o" size={26} color="black" />
                </View>
                <Text style={{fontSize:27,color:'#2B4794',fontWeight:'bold',textAlign:'left'}}>Définir un nouveau mot de passe</Text>
                <Text style={{fontSize:15, color:'black',fontWeight:'bold',textAlign:'left'}}>Créer un mot de passe unique</Text>

              <View style={{alignItems:'center'}}>
                  <Image source={require('../../assets/images/reset.png')} resizeMode='contain' style={{width:350,height:200,marginTop:28}}/>
                  <View style={{marginTop:37,gap:25}}>
                      <View >
                          <Text style={{color:'black',fontWeight:'bold',fontSize:18}} >Nouveau Mot de passe</Text>
                          <TextInput placeholder='Entrer votre mot de passe' style={{width:300,backgroundColor:'#ccc',borderRadius:20,marginTop:10,paddingLeft:20, color:'black'}} placeholderTextColor='black' secureTextEntry={true} value={Password} onChangeText={setPassword} />
                      </View>
                      <View>
                          <Text style={{color:'black',fontWeight:'bold',fontSize:18}}>Confirmer le Mot de passe</Text>
                          <TextInput placeholder='Veuillez confirmer le mot de passe' style={{width:300,backgroundColor:'#ccc',borderRadius:20,marginTop:10,paddingLeft:20, color:'black'}} placeholderTextColor='black' secureTextEntry={true} value={confirPass} onChangeText={setConfirPass} />
                      </View>
                  </View>
                    <TouchableOpacity onPress={handleValidation} style={{backgroundColor:'#2B4794',padding:15,borderRadius:15,width:300,justifyContent:'center',alignItems:'center',marginTop:40}}>
                        <Text style={{color:'white',fontSize:20, fontWeight:'bold'}}>Réinitialiser</Text>
                    </TouchableOpacity>
                    <View style={{flexDirection:'row',marginTop:30,gap:5}}>
                      <Text  onPress={()=>Navigation.navigate('HomeScreen')} style={{color:'#2B4794',fontWeight:'bold', fontSize:15}}>Réinitialiser le mot de passe ultérieurement?</Text>
                    </View>
                    
              </View>
        </ScrollView>
    </SafeAreaView>
  )
}

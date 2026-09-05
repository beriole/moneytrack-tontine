import { View, Text, SafeAreaView, Image, ImageBackground, Button, TouchableOpacity, TextInput } from 'react-native'
import React, { useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { ScrollView } from 'react-native-gesture-handler';
import Toast from "react-native-toast-message";
import API_BASE_URL from '../../utils/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import api from '../../utils/axiosApi';
export default function Login() {
  const Navigation=useNavigation();
  const [Email,setEmail]=useState("");
  const [Password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading, setLoading] = useState(false);
 const handlerLog = async () => {
  if (loading) return;
  setLoading(true);
  try {
    const res = await api.post('/auth/login', {
      email: Email,
      motDePasse: Password
    });

    console.log("Réponse du serveur :", res.data);

    if (res.status === 200) {
      const { token, utilisateur, message } = res.data;

      
      await AsyncStorage.setItem("token", token);
      await AsyncStorage.setItem("user", JSON.stringify(utilisateur));

      Toast.show({
        type: "success",
        text1: "Succès 🎉",
        text2: message,
        position: "bottom",
        visibilityTime: 2000,
        onHide: () => {
          Navigation.navigate("Menu"); 
        },
      });
    } else {
      Toast.show({
        type: "error",
        text1: "Échec",
        text2: res.data.message || "Email ou mot de passe incorrect",
        position: "bottom",
        visibilityTime: 2000
      });
    }
  } catch (error) {
    console.log(error.response?.data || error.message);
    Toast.show({
      type: "error",
      text1: "Échec",
      text2: "Erreur serveur, veuillez réessayer",
      position: "bottom",
      visibilityTime: 2000
    });
  } finally {
    setLoading(false);
  }
};

  return (
    <SafeAreaView style={{flex:1}}>
        <ScrollView contentContainerStyle={{flexGrow:1}} showsVerticalScrollIndicator={false}>
              <ImageBackground source={require('../../assets/images/Bgs.png')} style={{flex:1,justifyContent:'center',alignItems:'center', width:"100%",height:"100%"} }resizeMode='cover'>
                <View style={{position:'absolute',top:0,bottom:0,left:0,right:0,width:'100%',backgroundColor:'black',opacity:0.8}}></View>
                  
              <View style={{flexDirection:'column',justifyContent:'center',alignItems:'center',gap:20}}>
                  <Image source={require('../../assets/logo/icon-512.png')} style={{width:100,height:100}} />
                  <Text style={{fontSize:30,fontWeight:'bold',color:'white'}} > Connexion</Text>
                  <Text style={{color:'#CCC',textAlign:'center',width:300}}>Rassurer vous d'entrer les bonnes informations de connexion car un email ou mot de passe rater de trop peu entrainer le blocage de votre compte</Text>

                  <View>
                      <Text style={{color:'white',fontWeight:'bold'}}>Email</Text>
                      <TextInput placeholder='Entrer votre email' style={{width:300,backgroundColor:'#ccc',borderRadius:20,marginTop:10, paddingLeft:20,color:'black'}} placeholderTextColor='black' keyboardType='email-address' value={Email} onChangeText={setEmail}/>
                  </View>
                  <View>
                      <Text  style={{color:'white',fontWeight:'bold'}}>Mot de passe</Text>
                      <TextInput placeholder='Entrer votre mot de passe' style={{width:300,backgroundColor:'#ccc',borderRadius:20,marginTop:10,paddingLeft:20, color:'black'}} placeholderTextColor='black' secureTextEntry={true} value={Password} onChangeText={setPassword} />
                  </View>
                  
              </View>
              <View style={{ flexDirection:'row',alignItems:'center',justifyContent:'space-between', marginTop:12}}>

                <Text onPress={()=>Navigation.navigate('Forgot')} style={{color:'#1fd641b8',textAlign:'right', marginLeft:19,fontWeight:'bold',marginLeft:115}}> mot de passe oublie?</Text>
              </View>
              <View style={{justifyContent:'center',alignItems:'center'}}>
                      <TouchableOpacity onPress={handlerLog}  style={{backgroundColor:'#2B4794',padding:15,borderRadius:15,width:300,justifyContent:'center',alignItems:'center',marginTop:25}}>
                        <Text style={{color:'white',fontSize:20}}> Se connecter</Text>
                      </TouchableOpacity>
                 <Text style={{marginTop:12,color:'white',fontWeight:'bold'}}>
                  pas de compte? <Text onPress={()=>Navigation.navigate('Register')} style={{color:'green',fontWeight:'bold', textDecorationStyle:'solid',textDecorationLine:'underline'}}>Inscrivez-vous </Text>
                </Text>
              </View>
              
              </ImageBackground>
        </ScrollView>
    </SafeAreaView>
  )
}
import { View, Text, SafeAreaView, Image, ImageBackground, Button, TouchableOpacity, TextInput } from 'react-native'
import React, { useState } from 'react'
import AntDesign from 'react-native-vector-icons/AntDesign';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import API_BASE_URL from '../../utils/config';
export default function Forgot() {
  const Navigation=useNavigation();
  const [Email,setEmail]=useState("");
  const [loading,setLoading]=useState(false);
  const handleValidation= async ()=>{
    if (loading) return;
    setLoading(true);
    try {
      if(Email===""){
            return Toast.show({
                type: "error",
                text1: "echec",
                text2: "veuilllez renseigner votre addresse Email",
                position: "bottom",
                visibilityTime: 2000 ,
              });
       }
      const res = await axios.post(`${API_BASE_URL}/auth/sendOtp`,{email:Email});
        if(res.status===200){

               Toast.show({
                type: "success",
                text1: "verification",
                text2: "un code de verification a ete envoyer a votre addresse Email",
                position: "bottom",
                visibilityTime: 2000 ,
                onHide:()=>{ Navigation.navigate("VerifiedOtp",{ context: "reset" ,email:Email})}
              });
            
          }else{         
               Toast.show({
                type: "error",
                text1: "echecs",
                text2: "l'addresse Email que vous avez renseigner ne posséde pas de compte sur notre plateforme",
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
      setLoading(false)
     }
  }
  return (
    <SafeAreaView style={{flex:1, backgroundColor:'white',padding:20}}>
        <TouchableOpacity  onPress={()=>Navigation.goBack()} style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-start',gap:7,marginBottom:18}}>
          <AntDesign name='arrowleft' size={26} color={'black'}/>
          <Text style={{color:'black',fontWeight:'bold',fontSize:26}}>Retour</Text>
        </TouchableOpacity>
        <Text style={{fontSize:35,color:'#2B4794',fontWeight:'bold',textAlign:'left'}}>Mot de passe Oublie?</Text>
        <Text style={{fontSize:15, color:'black',fontWeight:'bold',textAlign:'left'}}>Pas de crainte, nous vous aidons à le recuperé</Text>

      <View style={{alignItems:'center'}}>
          <Image source={require('../../assets/images/sendOtp.png')} resizeMode='contain' style={{width:350,height:250,marginTop:28}}/>
          <View style={{marginTop:60}}>
                <Text style={{color:'black', fontSize:18,fontWeight:'bold'}}>Adresse Email</Text>
                <TextInput placeholder='Entrer votre Adresse-Email' style={{width:300,backgroundColor:'#ccc',borderRadius:15,marginTop:18, paddingLeft:20,color:'black'}} placeholderTextColor='black' keyboardType='email'value={Email} onChangeText={setEmail} />
            </View>
            <TouchableOpacity onPress={handleValidation} style={{backgroundColor:'#2B4794',padding:15,borderRadius:15,width:300,justifyContent:'center',alignItems:'center',marginTop:40}}>
                <Text style={{color:'white',fontSize:20, fontWeight:'bold'}}> Envoyer un code </Text>
            </TouchableOpacity>
            
      </View>
    </SafeAreaView>
  )
}
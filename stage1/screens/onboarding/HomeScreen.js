import { View, Text, SafeAreaView, Image, ImageBackground, Button, TouchableOpacity } from 'react-native'
import React from 'react'
import { useNavigation } from '@react-navigation/native';
export default function HomeScreen() {
  const Navigation=useNavigation();
  return (
    <SafeAreaView style={{flex:1}}>
        <ImageBackground source={require('../../assets/images/Bgs.png')} style={{flex:1,alignItems:'center', width:"100%",height:"100%"} }resizeMode='cover' >
          <View style={{position:'absolute',top:0,bottom:0,left:0,right:0,width:'100%',height:'100%',backgroundColor:'black',opacity:0.7}}></View>
            
        <View style={{flexDirection:'column',justifyContent:'center',alignItems:'center'}}>
        
             <Image source={require('../../assets/logo/icon-512.png')} style={{width:120,height:120, marginTop:22}}  />
         
            <Text style={{fontSize:30,fontWeight:'bold',color:'white',marginTop:33}} > BudgetManager</Text>
            <Text style={{color:'#CCC',textAlign:'center',width:300}}>Bienvenue dans la communauté BudgetManager nous comptons à notre actif 1000 meenbres, si vous avez deja un compte, vous pouvez vous connecté sinon rejoignez notre communauté</Text>
            <View>

            </View>
        </View>
        <View style={{position:'absolute',bottom:20}}>
                <TouchableOpacity onPress={()=>Navigation.navigate('Register')} style={{backgroundColor:'#2B4794',padding:20,borderRadius:15,width:300,justifyContent:'center',alignItems:'center'}}>
                  <Text style={{color:'white',fontSize:20}}> S'inscrire</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>Navigation.navigate('Login')} style={{backgroundColor:'white',padding:20,borderRadius:15,width:300,justifyContent:'center',alignItems:'center',marginTop:20}}>
                  <Text style={{color:'black',fontSize:20}}> Se connecter</Text>
                </TouchableOpacity>
        </View>
        </ImageBackground>
    </SafeAreaView>
  )
}
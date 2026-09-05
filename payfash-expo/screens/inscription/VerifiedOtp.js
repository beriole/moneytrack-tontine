import { View, Text, SafeAreaView, Image, ImageBackground, Button, TouchableOpacity, TextInput,StyleSheet, Alert} from 'react-native'
import React, { useRef, useState }from 'react'
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScrollView } from 'react-native-gesture-handler';
import { AntDesign } from '@expo/vector-icons';
import { FontAwesome } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import axios from 'axios';
import API_BASE_URL from '../../utils/config';

export default function VerifiedOtp() {
  const Navigation=useNavigation();
  const route = useRoute();
  const inputs = useRef([]);
  const { context,email } = route.params
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const handlerValide= async()=>{
     if (loading) return;
       setLoading(true);
      try {
        const code = otp.join("");
        const res = await axios.post(`${API_BASE_URL}/auth/verifyOtp`, { email, OtpCode: code });
                console.log("Réponse du serveur :", res.data); 
                  if(res.status===200){
        
                       Toast.show({
                        type: "success",
                        text1: "Succès 🎉",
                        text2: "verification réussie",
                        position: "bottom",
                        visibilityTime: 2000 ,
                        onHide:handleContinue,
                      });
                    
                  }else{
                       setMessage(res.data.message);
                       Toast.show({
                        type: "error",
                        text1: "echecs",
                        text2: "code OTP incorrecte",
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
 const handleChange = (text, index) => {
    if (/^\d$/.test(text)) {
      const newOtp = [...otp];
      newOtp[index] = text;
      setOtp(newOtp);

      if (index < inputs.current.length - 1) {
        inputs.current[index + 1].focus();
      }
    } else if (text === "") {

      const newOtp = [...otp];
      newOtp[index] = "";
      setOtp(newOtp);

      if (index > 0) {
        inputs.current[index - 1].focus();
      }
    }
  };


  const handleContinue = () => {
    const code = otp.join("");
    if (code.length === 6) {
      if (context === "signup") {
        Navigation.navigate("SucceSign"); 
      } else if (context === "reset") {
        Navigation.navigate("ResetPassword",{email:email}); 
      }
    } else {
      Alert.alert("Veuillez entrer le code OTP complet.");
    }
  };
  const handleBack=()=>{
      if (context === "signup") {
        Navigation.goBack(); 
      } else if (context === "reset"){
        Navigation.goBack(); 
      }else{
        Alert.alert("aucun retour possile")
      }
  }
  return (
    <SafeAreaView style={{flex:1, backgroundColor:'white',padding:20}}>
      <ScrollView >
        <TouchableOpacity  onPress={()=>Navigation.goBack()} style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-start',gap:7,marginBottom:18}}>
          <AntDesign name='arrow-left' size={26} color={'black'}/>
          <Text style={{color:'black',fontWeight:'bold',fontSize:26}}>Retour</Text>
        </TouchableOpacity>
            <Text style={{fontSize:35,color:'#4F46E5',fontWeight:'bold',textAlign:'left'}}>Verification</Text>
            <Text style={{fontSize:15, color:'black',fontWeight:'bold',textAlign:'left'}}>Enter le code OTP pour continué</Text>

          <View style={{alignItems:'center'}}>
              <Image source={require('../../assets/images/Otp.png')} resizeMode='contain' style={{width:350,height:250,marginTop:28}}/>
              <View>
                  <Text style={{textAlign:'center',fontWeight:'bold',fontSize:18, color:'black'}} >Nous avons envoyer un code OTP à l'adresse </Text>
                  <Text style={{fontWeight:'bold',color:'black',fontSize:18,textAlign:'center'}}>{email}</Text>
              </View>

      
        <View style={styles.container}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              style={styles.box}
              ref={(el) => (inputs.current[index] = el)}
              keyboardType="number-pad"
              maxLength={1}
              value={digit}
              onChangeText={(text) => handleChange(text, index)}
            />
          ))}
        </View>

                <TouchableOpacity onPress={handlerValide} style={{backgroundColor:'#4F46E5',padding:15,borderRadius:15,width:300,justifyContent:'center',alignItems:'center',marginTop:40}}>
                    <Text style={{color:'white',fontSize:20, fontWeight:'bold'}}> {loading ? "Chargement..." : "Continuer"}</Text>
                </TouchableOpacity>
                <View style={{flexDirection:'row',marginTop:12,gap:5}}>
                  <Text style={{color:'black',fontWeight:'bold', fontSize:18}}>vous n'avez pas reçu de code?</Text>
                  <Text style={{color:'#4F46E5',fontWeight:'bold', fontSize:18}}>renvoyer</Text>
                </View>
          </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 36,
    gap: 10
  },
  box: {
    width: 48,
    height: 58,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: '#111827'
  },
});
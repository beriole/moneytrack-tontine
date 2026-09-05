import { View, Text, SafeAreaView, Image, ImageBackground, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import API_BASE_URL from '../../utils/config';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Register() {
  const Navigation = useNavigation();
  const [Nom, setNom] = useState("");
  const [Email, setEmail] = useState("");
  const [Telephone, setTelephone] = useState("");
  const [Password, setPassword] = useState("");
  const [confirPass, setConfirPass] = useState("");
  const [loading, setLoading] = useState(false);

  const handlerLog = async () => {
    if (loading) return;
    setLoading(true);

    if (Nom === "" || Email === "" || Telephone === "" || Password === "" || confirPass === "" || Password !== confirPass) {
      setLoading(false);
      return Toast.show({
        type: "error",
        text1: "Échec",
        text2: "Veuillez remplir correctement tous les champs",
        position: "bottom",
        visibilityTime: 2000,
      });
    }

    try {
      const res = await axios.post(`${API_BASE_URL}/auth/register`, {
        nom: Nom,
        telephone: Telephone,
        email: Email,
        motDePasse: Password
      });

      console.log("Réponse du serveur :", res.data);

      if (res.status === 200) {
        // Stocker le token dans AsyncStorage
        await AsyncStorage.setItem('token', res.data.token);

        Toast.show({
          type: "success",
          text1: "Succès 🎉",
          text2: "Inscription réussie",
          position: "bottom",
          visibilityTime: 2000,
          onHide: () => {
            // Redirection vers la page de vérification OTP
            Navigation.navigate("VerifiedOtp", { context: "signup", email: Email, token: res.data.token });
          }
        });
      } else {
        Toast.show({
          type: "error",
          text1: "Échec",
          text2: res.data.message || "Erreur lors de l'inscription",
          position: "bottom",
          visibilityTime: 2000
        });
      }

    } catch (error) {
      console.log(error);
      Toast.show({
        type: "error",
        text1: "Échec",
        text2: "Erreur serveur",
        position: "bottom",
        visibilityTime: 2000
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('../../assets/images/Bgs.png')} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: "100%", height: "100%" }} resizeMode='cover'>
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, width: '100%', height: '100%', backgroundColor: 'black', opacity: 0.8 }}></View>

          <View style={{ flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
            <Image source={require('../../assets/logo/icon-512.png')} style={{ width: 100, height: 100 }} />
            <Text style={{ fontSize: 30, fontWeight: 'bold', color: 'white' }}>Inscription</Text>
            <Text style={{ color: '#CCC', textAlign: 'center', width: 300 }}>Assurez-vous que vos identifiants sont exacts : une petite erreur peut bloquer l’accès à votre compte.</Text>

            <View>
              <Text style={{ color: 'white' }}>Nom</Text>
              <TextInput placeholder='Entrer votre nom complet' style={{ width: 300, backgroundColor: '#ccc', borderRadius: 20, marginTop: 10, paddingLeft: 20, color: 'black' }} placeholderTextColor='black' value={Nom} onChangeText={setNom} />
            </View>
            <View>
              <Text style={{ color: 'white' }}>Email</Text>
              <TextInput placeholder='Entrer votre email' style={{ width: 300, backgroundColor: '#ccc', borderRadius: 20, marginTop: 10, paddingLeft: 20, color: 'black' }} placeholderTextColor='black' keyboardType='email-address' value={Email} onChangeText={setEmail} />
            </View>
            <View>
              <Text style={{ color: 'white' }}>Téléphone</Text>
              <TextInput placeholder='Entrer votre numéro de téléphone' style={{ width: 300, backgroundColor: '#ccc', borderRadius: 20, marginTop: 10, paddingLeft: 20, color: 'black' }} placeholderTextColor='black' keyboardType='numeric' value={Telephone} onChangeText={setTelephone} />
            </View>
            <View>
              <Text style={{ color: 'white' }}>Mot de passe</Text>
              <TextInput placeholder='Entrer votre mot de passe' style={{ width: 300, backgroundColor: '#ccc', borderRadius: 20, marginTop: 10, paddingLeft: 20, color: 'black' }} placeholderTextColor='black' secureTextEntry={true} value={Password} onChangeText={setPassword} />
            </View>
            <View>
              <Text style={{ color: 'white' }}>Confirmer le mot de passe</Text>
              <TextInput placeholder='Veuillez confirmer le mot de passe' style={{ width: 300, backgroundColor: '#ccc', borderRadius: 20, marginTop: 10, paddingLeft: 20, color: 'black' }} placeholderTextColor='black' secureTextEntry={true} value={confirPass} onChangeText={setConfirPass} />
            </View>
          </View>

          <Text style={{ marginTop: 12, color: 'white', fontWeight: 'bold' }}>
            Vous avez déjà un compte? <Text style={{ color: 'green', fontWeight: 'bold', textDecorationLine: 'underline' }} onPress={() => Navigation.navigate('Login')}>Connectez-vous</Text>
          </Text>

          <View>
            <TouchableOpacity onPress={handlerLog} style={{ backgroundColor: '#2B4794', padding: 15, borderRadius: 15, width: 300, justifyContent: 'center', alignItems: 'center', marginTop: 20 }}>
              <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>S'inscrire</Text>
            </TouchableOpacity>
          </View>

        </ImageBackground>
      </ScrollView>
    </SafeAreaView>
  );
}

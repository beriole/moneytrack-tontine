import { View, Text, SafeAreaView, Image, ImageBackground, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import API_BASE_URL from '../../utils/config';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authStyles, { COLORS } from '../../components/authStyles';

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

    if (Nom === "" || Email === "" || Telephone === "" || Password === "" || confirPass === "" || Password !== confirPass) {
      return Toast.show({
        type: "error",
        text1: "Échec",
        text2: "Veuillez remplir correctement tous les champs",
        position: "bottom",
        visibilityTime: 2000,
      });
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/register`, {
        nom: Nom,
        telephone: Telephone,
        email: Email,
        motDePasse: Password
      });

      if (res.status === 200) {
        await AsyncStorage.setItem('token', res.data.token);
        Toast.show({
          type: "success",
          text1: "Succès 🎉",
          text2: "Inscription réussie",
          position: "bottom",
          visibilityTime: 2000,
          onHide: () => {
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
      console.log(error.response?.data || error.message);
      Toast.show({
        type: "error",
        text1: "Échec",
        text2: error.response?.data?.message || "Erreur serveur",
        position: "bottom",
        visibilityTime: 2000
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={authStyles.safe}>
      <ImageBackground source={require('../../assets/images/Bgs.png')} style={authStyles.bg} resizeMode='cover'>
        <View style={authStyles.overlay} />
        <ScrollView contentContainerStyle={authStyles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/logo/icon-512.png')} style={authStyles.logo} />
          <Text style={authStyles.title}>Inscription</Text>
          <Text style={authStyles.subtitle}>
            Assurez-vous que vos identifiants sont exacts : une petite erreur peut bloquer l'accès à votre compte.
          </Text>

          <View style={authStyles.field}>
            <Text style={authStyles.label}>Nom</Text>
            <TextInput placeholder='Entrer votre nom complet' style={authStyles.input} placeholderTextColor={COLORS.placeholder} value={Nom} onChangeText={setNom} />
          </View>

          <View style={authStyles.field}>
            <Text style={authStyles.label}>Email</Text>
            <TextInput placeholder='Entrer votre email' style={authStyles.input} placeholderTextColor={COLORS.placeholder} keyboardType='email-address' autoCapitalize='none' value={Email} onChangeText={setEmail} />
          </View>

          <View style={authStyles.field}>
            <Text style={authStyles.label}>Téléphone</Text>
            <TextInput placeholder='Entrer votre numéro de téléphone' style={authStyles.input} placeholderTextColor={COLORS.placeholder} keyboardType='numeric' value={Telephone} onChangeText={setTelephone} />
          </View>

          <View style={authStyles.field}>
            <Text style={authStyles.label}>Mot de passe</Text>
            <TextInput placeholder='Entrer votre mot de passe' style={authStyles.input} placeholderTextColor={COLORS.placeholder} secureTextEntry value={Password} onChangeText={setPassword} />
          </View>

          <View style={authStyles.field}>
            <Text style={authStyles.label}>Confirmer le mot de passe</Text>
            <TextInput placeholder='Veuillez confirmer le mot de passe' style={authStyles.input} placeholderTextColor={COLORS.placeholder} secureTextEntry value={confirPass} onChangeText={setConfirPass} />
          </View>

          <TouchableOpacity
            onPress={handlerLog}
            disabled={loading}
            style={[authStyles.button, loading && authStyles.buttonDisabled]}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={authStyles.buttonText}>S'inscrire</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Navigation.navigate('Login')}
            hitSlop={{ top: 14, bottom: 14, left: 20, right: 20 }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginTop: 6 }}
          >
            <Text style={authStyles.footerText}>Vous avez déjà un compte ? </Text>
            <Text style={[authStyles.link, { fontSize: 15 }]}>Connectez-vous</Text>
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
}

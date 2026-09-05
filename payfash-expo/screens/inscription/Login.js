import { View, Text, SafeAreaView, Image, ImageBackground, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native'
import React, { useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { ScrollView } from 'react-native-gesture-handler';
import Toast from "react-native-toast-message";
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../utils/axiosApi';
import authStyles, { COLORS } from '../../components/authStyles';

export default function Login() {
  const Navigation = useNavigation();
  const [Email, setEmail] = useState("");
  const [Password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handlerLog = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.post('/auth/login', {
        email: Email,
        motDePasse: Password
      });

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
          onHide: () => { Navigation.navigate("Menu"); },
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
        text2: error.response?.data?.message || "Erreur serveur, veuillez réessayer",
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
          <Text style={authStyles.title}>Connexion</Text>
          <Text style={authStyles.subtitle}>
            Entrez vos identifiants pour accéder à votre portefeuille MoneyTrack.
          </Text>

          <View style={authStyles.field}>
            <Text style={authStyles.label}>Email</Text>
            <TextInput
              placeholder='Entrer votre email'
              style={authStyles.input}
              placeholderTextColor={COLORS.placeholder}
              keyboardType='email-address'
              autoCapitalize='none'
              value={Email}
              onChangeText={setEmail}
            />
          </View>

          <View style={authStyles.field}>
            <Text style={authStyles.label}>Mot de passe</Text>
            <TextInput
              placeholder='Entrer votre mot de passe'
              style={authStyles.input}
              placeholderTextColor={COLORS.placeholder}
              secureTextEntry
              value={Password}
              onChangeText={setPassword}
            />
            <Text onPress={() => Navigation.navigate('Forgot')} style={[authStyles.forgot, { marginTop: 10 }]}>
              Mot de passe oublié ?
            </Text>
          </View>

          <TouchableOpacity
            onPress={handlerLog}
            disabled={loading}
            style={[authStyles.button, loading && authStyles.buttonDisabled]}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={authStyles.buttonText}>Se connecter</Text>}
          </TouchableOpacity>

          <Text style={authStyles.footerText}>
            Pas de compte ?{' '}
            <Text onPress={() => Navigation.navigate('Register')} style={authStyles.link}>Inscrivez-vous</Text>
          </Text>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  )
}

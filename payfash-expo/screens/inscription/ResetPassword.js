import { View, Text, SafeAreaView, Image, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native'
import React, { useState } from 'react'
import { useNavigation, useRoute } from '@react-navigation/native'
import { ScrollView } from 'react-native-gesture-handler';
import { AntDesign } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import API_BASE_URL from '../../utils/config';
import axios from 'axios';
import authStyles, { COLORS } from '../../components/authStyles';

export default function ResetPassword() {
  const route = useRoute();
  const Navigation = useNavigation();
  const [Password, setPassword] = useState("");
  const [confirPass, setConfirPass] = useState("");
  const [loading, setLoading] = useState(false);
  const { email } = route.params;

  const handleValidation = async () => {
    if (loading) return;
    if (Password === "" || confirPass === "" || Password !== confirPass) {
      return Toast.show({ type: "error", text1: "Échec", text2: "Les mots de passe ne correspondent pas", position: "bottom", visibilityTime: 2000 });
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/reset`, { email: email, nouveauMotDePasse: Password });
      if (res.status === 200) {
        Toast.show({
          type: "success", text1: "Succès 🎉", text2: "Votre mot de passe a été réinitialisé",
          position: "bottom", visibilityTime: 2000,
          onHide: () => { Navigation.navigate("SuccesReset") }
        });
      } else {
        Toast.show({ type: "error", text1: "Échec", text2: "Échec de la réinitialisation", position: "bottom", visibilityTime: 2000 });
      }
    } catch (error) {
      console.log(error.response?.data || error.message);
      Toast.show({ type: "error", text1: "Échec", text2: error.response?.data?.message || "Erreur serveur", position: "bottom", visibilityTime: 2000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={authStyles.lightSafe}>
      <ScrollView contentContainerStyle={authStyles.lightContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => Navigation.goBack()} style={authStyles.backRow}>
          <AntDesign name='arrow-left' size={24} color={'#111827'} />
          <Text style={authStyles.backText}>Retour</Text>
        </TouchableOpacity>

        <Text style={authStyles.heading}>Nouveau mot de passe</Text>
        <Text style={authStyles.headingSub}>Choisissez un mot de passe unique et sécurisé.</Text>

        <Image source={require('../../assets/images/reset.png')} resizeMode='contain' style={authStyles.illustration} />

        <View style={{ marginTop: 26 }}>
          <Text style={authStyles.lightLabel}>Nouveau mot de passe</Text>
          <TextInput placeholder='Entrer votre mot de passe' style={authStyles.lightInput} placeholderTextColor={COLORS.placeholder} secureTextEntry value={Password} onChangeText={setPassword} />
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={authStyles.lightLabel}>Confirmer le mot de passe</Text>
          <TextInput placeholder='Veuillez confirmer le mot de passe' style={authStyles.lightInput} placeholderTextColor={COLORS.placeholder} secureTextEntry value={confirPass} onChangeText={setConfirPass} />
        </View>

        <TouchableOpacity onPress={handleValidation} disabled={loading} style={[authStyles.primaryBtn, loading && authStyles.buttonDisabled]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={authStyles.primaryBtnText}>Réinitialiser</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => Navigation.navigate('HomeScreen')} style={{ marginTop: 22, alignItems: 'center' }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 15 }}>Réinitialiser plus tard ?</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

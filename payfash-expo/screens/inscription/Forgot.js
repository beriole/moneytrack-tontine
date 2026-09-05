import { View, Text, SafeAreaView, Image, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native'
import React, { useState } from 'react'
import { ScrollView } from 'react-native-gesture-handler';
import { AntDesign } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import API_BASE_URL from '../../utils/config';
import authStyles, { COLORS } from '../../components/authStyles';

export default function Forgot() {
  const Navigation = useNavigation();
  const [Email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleValidation = async () => {
    if (loading) return;
    if (Email === "") {
      return Toast.show({ type: "error", text1: "Échec", text2: "Veuillez renseigner votre adresse email", position: "bottom", visibilityTime: 2000 });
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/sendOtp`, { email: Email });
      if (res.status === 200) {
        Toast.show({
          type: "success", text1: "Vérification",
          text2: "Un code de vérification a été envoyé à votre adresse email",
          position: "bottom", visibilityTime: 2000,
          onHide: () => { Navigation.navigate("VerifiedOtp", { context: "reset", email: Email }) }
        });
      } else {
        Toast.show({ type: "error", text1: "Échec", text2: "Cette adresse email ne possède pas de compte", position: "bottom", visibilityTime: 2000 });
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

        <Text style={authStyles.heading}>Mot de passe oublié ?</Text>
        <Text style={authStyles.headingSub}>Pas de crainte, nous vous aidons à le récupérer.</Text>

        <Image source={require('../../assets/images/sendOtp.png')} resizeMode='contain' style={authStyles.illustration} />

        <View style={{ marginTop: 30 }}>
          <Text style={authStyles.lightLabel}>Adresse email</Text>
          <TextInput
            placeholder='Entrer votre adresse email'
            style={authStyles.lightInput}
            placeholderTextColor={COLORS.placeholder}
            keyboardType='email-address'
            autoCapitalize='none'
            value={Email}
            onChangeText={setEmail}
          />
        </View>

        <TouchableOpacity onPress={handleValidation} disabled={loading} style={[authStyles.primaryBtn, loading && authStyles.buttonDisabled]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={authStyles.primaryBtnText}>Envoyer un code</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

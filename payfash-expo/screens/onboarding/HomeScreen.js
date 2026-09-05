import { View, Text, SafeAreaView, Image, ImageBackground, TouchableOpacity, StyleSheet } from 'react-native'
import React from 'react'
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../components/authStyles';

export default function HomeScreen() {
  const Navigation = useNavigation();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.base }}>
      <ImageBackground
        source={require('../../assets/images/Bgs.png')}
        style={{ flex: 1, width: '100%', height: '100%' }}
        resizeMode='cover'
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: COLORS.base, opacity: 0.78 }]} />

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Image source={require('../../assets/logo/icon-512.png')} style={{ width: 130, height: 130, borderRadius: 30 }} />
          <Text style={{ fontSize: 34, fontWeight: '800', color: 'white', marginTop: 28 }}>MoneyTrack</Text>
          <Text style={{ color: '#C7C5D6', textAlign: 'center', fontSize: 15, lineHeight: 22, maxWidth: 320, marginTop: 14 }}>
            Bienvenue dans la communauté MoneyTrack. Gérez votre budget, votre épargne et vos projets en toute simplicité.
            Connectez-vous ou rejoignez-nous dès maintenant.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 36 }}>
          <TouchableOpacity
            onPress={() => Navigation.navigate('Register')}
            style={{
              backgroundColor: COLORS.primary, height: 56, borderRadius: 14,
              justifyContent: 'center', alignItems: 'center',
              shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
            }}
          >
            <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>S'inscrire</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Navigation.navigate('Login')}
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)', height: 56, borderRadius: 14,
              justifyContent: 'center', alignItems: 'center', marginTop: 14,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
            }}
          >
            <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>Se connecter</Text>
          </TouchableOpacity>
        </View>
      </ImageBackground>
    </SafeAreaView>
  )
}

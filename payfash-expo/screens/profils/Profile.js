import { View, Text, SafeAreaView, ScrollView, Image, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import React, { useState, useCallback } from 'react'
import { AntDesign, Entypo } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../utils/axiosApi';

export default function Profile() {
  const Navigation = useNavigation();
  const Route = useRoute();
  const params = Route.params || {};

  const [user, setUser] = useState(null);
  const [solde, setSolde] = useState(null);
  const [loading, setLoading] = useState(true);

  // Charge l'utilisateur (AsyncStorage) et le solde (API) à chaque focus
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('user');
          if (active && raw) setUser(JSON.parse(raw));

          const res = await api.get('/wallet/solde');
          if (active) setSolde(res.data?.totalSolde ?? 0);
        } catch (e) {
          console.log('Profil — chargement :', e.response?.data || e.message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [])
  );

  const handleLogout = async () => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion', style: 'destructive',
        onPress: async () => {
          try { await AsyncStorage.multiRemove(['token', 'user']); }
          catch (e) { console.log('Erreur déconnexion :', e); }
          Navigation.reset({ index: 0, routes: [{ name: 'HomeScreen' }] });
        }
      }
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Supprimer le compte',
      'Cette action est définitive. Cette fonctionnalité sera bientôt disponible.',
      [{ text: 'Compris' }]
    );
  };

  const soon = (label) => Alert.alert(label, 'Fonctionnalité bientôt disponible 🚧');

  // Solde affiché : API en priorité, sinon param de navigation
  const soldeAffiche =
    solde !== null
      ? Number(solde).toLocaleString('fr-FR')
      : (params.solde ?? '0');

  const initiales = (user?.nom || 'M T')
    .split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={style.safe}>
      {/* Header */}
      <View style={style.header}>
        <TouchableOpacity onPress={() => Navigation.goBack()} hitSlop={10}>
          <AntDesign name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={style.headerTitle}>Mon profil</Text>
        <TouchableOpacity onPress={() => Navigation.navigate('Setting')} hitSlop={10}>
          <Entypo name="cog" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={style.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar + identité */}
        <View style={style.container}>
          <View style={style.profile}>
            <Image source={require('../../assets/logo/icon-512.png')} style={style.image} />
            <TouchableOpacity style={style.profileEdit} onPress={() => soon('Modifier la photo')}>
              <AntDesign name="edit" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator color="#8B5CF6" style={{ marginTop: 15 }} />
          ) : (
            <>
              <Text style={style.name}>{user?.nom || 'Utilisateur MoneyTrack'}</Text>
              <Text style={style.email}>{user?.email || '—'}</Text>
              {!!user?.telephone && <Text style={style.phone}>📞 {user.telephone}</Text>}
            </>
          )}
        </View>

        {/* Carte solde */}
        <LinearGradient colors={['#4F46E5', '#8B5CF6']} style={style.cardWallet}>
          <Text style={style.walletTitle}>MoneyTrack</Text>
          <Text style={style.walletSubtitle}>Solde total</Text>
          <Text style={style.walletBalance}>{soldeAffiche} FCFA</Text>
        </LinearGradient>

        {/* Mon profil */}
        <View style={style.group}>
          <Text style={style.groupTitle}>Mon profil</Text>
          <Row label="Modifier le profil" icon="user" onPress={() => soon('Modifier le profil')} />
          <Row label="Mes statistiques" icon="bar-chart" onPress={() => soon('Mes statistiques')} />
          <Row label="Recommandations intelligentes" icon="bulb" onPress={() => Navigation.navigate('map')} />
          <Row label="Mes portefeuilles" icon="wallet" onPress={() => Navigation.navigate('Menu', { screen: 'Home' })} />
        </View>

        {/* Sécurité */}
        <View style={style.group}>
          <Text style={style.groupTitle}>Sécurité</Text>
          <Row label="Politique de confidentialité" icon="lock" onPress={() => soon('Politique de confidentialité')} />
          <Row label="Conseils & sécurité" icon="safety" onPress={() => soon('Conseils & sécurité')} />

          <TouchableOpacity style={style.buttonDanger} onPress={handleLogout}>
            <Text style={style.buttonText}>Déconnexion</Text>
          </TouchableOpacity>
          <TouchableOpacity style={style.buttonOutline} onPress={handleDelete}>
            <Text style={style.buttonOutlineText}>Supprimer le compte</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// Ligne d'option réutilisable
const Row = ({ label, icon, onPress }) => (
  <TouchableOpacity style={style.row} onPress={onPress} activeOpacity={0.7}>
    <View style={style.rowLeft}>
      <AntDesign name={icon} size={18} color="#A5B4FC" />
      <Text style={style.buttonText}>{label}</Text>
    </View>
    <AntDesign name="right" size={16} color="#6B7280" />
  </TouchableOpacity>
);

const style = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#161427' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  scroll: { paddingBottom: 90, alignItems: 'center' },
  container: { alignItems: 'center', marginBottom: 20 },
  profile: {
    position: 'relative', width: 130, height: 130, borderRadius: 65,
    overflow: 'hidden', borderWidth: 3, borderColor: '#8B5CF6',
  },
  image: { width: '100%', height: '100%' },
  profileEdit: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: '#4F46E5', padding: 8, borderRadius: 20,
  },
  name: { marginTop: 14, fontSize: 20, fontWeight: 'bold', color: '#fff' },
  email: { color: '#C7C5D6', fontSize: 14, marginTop: 2 },
  phone: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },
  cardWallet: {
    width: '90%', borderRadius: 16, padding: 22, alignItems: 'center', marginBottom: 25,
    shadowColor: '#4F46E5', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  walletTitle: { fontSize: 20, color: '#fff', fontWeight: 'bold' },
  walletSubtitle: { fontSize: 13, color: '#E0E0E0', marginTop: 5 },
  walletBalance: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  group: { width: '90%', marginBottom: 14 },
  groupTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#211C3A', paddingVertical: 16, paddingHorizontal: 16,
    borderRadius: 12, marginVertical: 5,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttonDanger: {
    backgroundColor: '#D72638', padding: 16, borderRadius: 12, marginTop: 10, alignItems: 'center',
  },
  buttonOutline: {
    borderColor: '#D72638', borderWidth: 1, padding: 16, borderRadius: 12, marginTop: 10, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  buttonOutlineText: { color: '#D72638', fontWeight: '600', fontSize: 15 },
})

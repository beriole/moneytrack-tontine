import React, { useEffect, useRef, useState } from "react";
import { 
  View, Text, SafeAreaView, Image, StyleSheet, Animated, TouchableOpacity, ScrollView, ActivityIndicator 
} from "react-native";
import Icon from 'react-native-vector-icons/FontAwesome';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from "@react-navigation/native";
import api from "../../utils/axiosApi";
import TransactionCard from "../../utils/transactionCard";

export default function Home() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [portefeuilles, setPortefeuilles] = useState([]);
  const [totalSolde, setTotalSolde] = useState(0);
  const [transactions, setTransactions] = useState([]);

  // Animations
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();
  }, []);

  // Charger portefeuilles et total
  const fetchWallets = async () => {
    try {
      setLoading(true);
      const res = await api.get("/wallet/solde");

      console.log("fetchWallets response:", res.data);

      const portefeuillesData = res.data?.portefeuilles || [];
      setPortefeuilles(portefeuillesData);
      setTotalSolde(res.data?.totalSolde || 0);

      setLoading(false);
    } catch (err) {
      console.error("Erreur fetchWallets :", err);
      setLoading(false);
    }
  };

  // Charger transactions récentes
  const fetchTransactions = async () => {
    try {
      const res = await api.get("/wallet/transactions");
      setTransactions(res.data?.transactions || []);
    } catch (err) {
      console.error("Erreur fetchTransactions :", err);
    }
  };

  useEffect(() => {
    fetchWallets();
    fetchTransactions();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color:'#000', marginTop:10 }}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Couleur selon type de portefeuille
  const getWalletColor = (type) => {
    switch(type) {
      case 'courant': return ['#3B82F6', '#60A5FA'];
      case 'projet': return ['#8B5CF6', '#A78BFA'];
      case 'epargne': return ['#10B981', '#34D399'];
      default: return ['#6B7280', '#9CA3AF'];
    }
  };

  // Icone selon type
  const getWalletIcon = (type) => {
    if (!type) return 'money';
    switch(type.toLowerCase()) {
      case 'courant': return 'credit-card';
      case 'projet': return 'bullseye';
      case 'epargne': return 'money';
      default: return 'money';
    }
  };

  // Label selon type
  const getWalletLabel = (type) => {
    switch(type) {
      case 'courant': return 'Solde Courant';
      case 'projet': return 'Solde Projets';
      case 'epargne': return 'Solde Épargne';
      default: return 'Solde';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={{backgroundColor:'#0D1B2A',borderBottomLeftRadius:25,borderBottomRightRadius:25,paddingBottom:16}}>
          <View style={styles.top}>
            <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
              <TouchableOpacity onPress={()=>navigation.navigate('Profile',{solde:totalSolde.toLocaleString('fr-FR')})}>
                <Image source={require('../../assets/logo/icon-512.png')} style={styles.avatar}/>
              </TouchableOpacity>
              <Text style={{color:'white',fontSize:22,fontWeight:'bold'}}>Bienvenue, Beriole</Text>
            </View>
            <Icon name="bell" onPress={()=>navigation.navigate('Notification')} size={28} color="white" />
          </View>

          {/* Solde Total */}
          <View style={{justifyContent:'center',alignItems:'center',marginTop:12}}>
            <LinearGradient colors={['#1E90FF', '#00C49A']} style={styles.cardWallet}>
              <Text style={styles.walletTitle}>Portefeuille</Text>
              <Text style={styles.walletSubtitle}>Solde Total</Text>
              <Text style={styles.walletBalance}>{totalSolde.toLocaleString('fr-FR')} FCFA</Text>
            </LinearGradient>
          </View>

          {/* Portefeuilles individuels */}
          <Animated.View style={[styles.walletRow, {opacity: fadeAnim, transform:[{translateY: slideAnim}]}]}>
            {portefeuilles.map((p, i) => (
              <LinearGradient key={i} colors={getWalletColor(p.typePortefeuille)} style={styles.wallet}>
                <Icon name={getWalletIcon(p.typePortefeuille)} size={24} color="#fff" />
                <Text style={styles.walletName}>{getWalletLabel(p.typePortefeuille)}</Text>
                <Text style={styles.walletAmount}>{p.solde.toLocaleString('fr-FR')} FCFA</Text>
              </LinearGradient>
            ))}
          </Animated.View>
        </View>

        {/* ACTIONS */}
        <View style={styles.actionCard}>
          <TouchableOpacity style={styles.actionItem} onPress={()=>navigation.navigate('Depense')}>
            <Icon name="shopping-cart" size={26} color="#F43F5E" />
            <Text style={styles.actionLabel}>Dépenser</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={()=>navigation.navigate('Recharge')}>
            <Icon name="plus-circle" size={26} color="#10B981" />
            <Text style={styles.actionLabel}>Déposer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={()=>navigation.navigate('TransfertFonds')}>
            <Icon name="exchange" size={26} color="#3B82F6" />
            <Text style={styles.actionLabel}>Transférer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={()=>navigation.navigate('Transaction')}>
            <Icon name="history" size={26} color="#F59E0B" />
            <Text style={styles.actionLabel}>Historique</Text>
          </TouchableOpacity>
        </View>

        {/* Transactions récentes */}
        <View style={{marginTop:12}}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginHorizontal:16}}>
            <Text style={{color:'black',fontWeight:'bold',fontSize:16}}>Transactions Récentes</Text>
            <Text style={{color:'green',fontWeight:'bold',fontSize:16}} onPress={()=>navigation.navigate('Transaction')}>
              Voir tout
            </Text>
          </View>
          <ScrollView>
            {transactions.map((tx, index) => (
              <TransactionCard key={index} transaction={tx} />
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#fff' },
  avatar:{ height:40, width:40, borderRadius:100 },
  top:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', margin:16 },
  cardWallet: {
    width: "90%",
    borderRadius:16,
    padding:12,
    alignItems:'center',
    shadowColor:'#000',
    shadowOpacity:0.1,
    shadowRadius:4,
    elevation:3,
  },
  walletTitle:{ fontSize:18, color:'#fff', fontWeight:'bold' },
  walletSubtitle:{ fontSize:13, color:'#e0e0e0', marginTop:4 },
  walletBalance:{ fontSize:20, fontWeight:'bold', color:'#fff', marginTop:6 },
  
  // Ligne contenant les cartes
  walletRow:{ 
    flexDirection:'row', 
    justifyContent:'space-between', 
    alignItems:'stretch', // <-- important pour la même hauteur
    marginTop:20, 
    paddingHorizontal:12 
  },
  wallet:{
    flex:1,               // chaque carte prend la même largeur
    borderRadius:16,
    padding:16,
    marginHorizontal:6,
    shadowColor:'#000',
    shadowOpacity:0.1,
    shadowRadius:4,
    elevation:3,
    alignItems:'center',
    justifyContent:'center',
    height:140,           // <-- hauteur fixe pour toutes les cartes
  },
  walletName:{ fontSize:16, color:'#fff', fontWeight:'600', marginTop:6 },
  walletAmount:{ fontSize:14, color:'#fff', marginTop:2 },
  
  actionCard:{
    flexDirection:'row',
    justifyContent:'space-around',
    alignItems:'center',
    backgroundColor:'#fff',
    marginTop:15,
    marginHorizontal:16,
    paddingVertical:16,
    borderRadius:16,
    shadowColor:'#000',
    shadowOpacity:0.08,
    shadowRadius:4,
    elevation:3,
  },
  actionItem:{ alignItems:'center', justifyContent:'center', flex:1 },
  actionLabel:{ fontSize:14, color:'#333', marginTop:6, fontWeight:'500' }
});

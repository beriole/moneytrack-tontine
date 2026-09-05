import { View, Text, SafeAreaView, ScrollView, StyleSheet, Image, TouchableOpacity } from 'react-native'
import React from 'react'
import AntDesign from 'react-native-vector-icons/AntDesign';
import { useNavigation } from '@react-navigation/native';

export default function Notification() {
  const Navigation = useNavigation();
  const data = [
    { id:1, titre:"Votre budget Alimentaire a dépassé 80%", times:2, type:'Budget', lu:0 },
    { id:2, titre:"Un virement de 50 000 XAF a été reçu", times:10, type:'Transaction', lu:1 },
    { id:3, titre:"Votre portefeuille Épargne a atteint 200 000 XAF", times:30, type:'Épargne', lu:0 },
    { id:4, titre:"Paiement de 15 000 XAF effectué avec succès", times:50, type:'Transaction', lu:1 },
    { id:5, titre:"Rappel : échéance de crédit dans 3 jours", times:120, type:'Crédit', lu:0 },
    { id:6, titre:"Nouvelle recommandation de gestion disponible", times:300, type:'Conseil IA', lu:1 },
    { id:7, titre:"Votre solde du portefeuille Courant est inférieur à 5 000 XAF", times:400, type:'Alerte Solde', lu:0 },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.header}>
        <AntDesign onPress={() => Navigation.goBack()} name='arrowleft' size={26} color={'white'} />
        <Text style={styles.headerText}>Notifications</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {data.map((item) => (
          <View 
            key={item.id} 
            style={[
              styles.notificationCard, 
              item.lu === 1 ? styles.read : styles.unread
            ]}
          >
            <View style={styles.left}>
              <Image source={require('../../assets/logo/icon-512.png')} style={styles.avatar} />
              <View style={{marginLeft:12, flex:1}}>
                <Text style={styles.title}>{item.titre}</Text>
                <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:6}}>
                  <Text style={styles.type}>{item.type}</Text>
                  <Text style={styles.time}>{item.times} min ago</Text>
                </View>
              </View>
            </View>
            {!item.lu && <View style={styles.unreadDot}/>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:{
    flex:1,
    backgroundColor:'#0D1B2A',
  },
  header:{
    paddingVertical:16,
    backgroundColor:'#1E293B',
    alignItems:'center',
    justifyContent:'flex-start',
    paddingHorizontal:12,
    gap:12,
    flexDirection:'row',
    marginBottom:8
  },
  headerText:{
    color:'#fff',
    fontSize:22,
    fontWeight:'bold'
  },
  notificationCard:{
    flexDirection:'row',
    alignItems:'center',
    padding:16,
    marginHorizontal:16,
    marginVertical:8,
    borderRadius:16,
    shadowColor:'#000',
    shadowOpacity:0.15,
    shadowRadius:8,
    elevation:4,
    backgroundColor:'#1E293B'
  },
  unread:{
    borderLeftWidth:5,
    borderLeftColor:'#3B82F6'
  },
  read:{
    borderLeftWidth:5,
    borderLeftColor:'transparent'
  },
  left:{
    flexDirection:'row',
    alignItems:'flex-start',
    flex:1
  },
  avatar:{
    width:40,
    height:40,
    borderRadius:20,
    marginTop:2
  },
  title:{
    color:'#fff',
    fontWeight:'600',
    fontSize:15,
    flexWrap:'wrap',   // 👉 permet d’aller à la ligne
    flexShrink:1
  },
  time:{
    color:'#94A3B8',
    fontSize:12
  },
  type:{
    color:'#FBBF24',
    fontWeight:'bold',
    fontSize:12
  },
  unreadDot:{
    width:10,
    height:10,
    borderRadius:5,
    backgroundColor:'#F43F5E',
    marginLeft:8
  }
})

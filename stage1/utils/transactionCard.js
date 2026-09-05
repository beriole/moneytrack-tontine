import { View, Text, StyleSheet } from 'react-native';
import React from 'react';
import Icon from 'react-native-vector-icons/FontAwesome';

export default function TransactionCard({ transaction }) {


  const getIcon = () => {
    switch(transaction.type){
      case 'dépense':
        return <Icon name="arrow-up" size={20} color="#F43F5E" />; 
      case 'revenu':
        return <Icon name="arrow-down" size={20} color="#10B981" />; 
      case 'transfert':
        return <Icon name="exchange" size={20} color="#3B82F6" />; 
      default:
        return null;
    }
  };


  const amountColor = transaction.type === 'dépense' ? '#F43F5E' : transaction.type === 'revenu' ? '#10B981' : '#3B82F6';

  return (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        {getIcon()}
      </View>
      <View style={styles.info}>
        <Text style={styles.description}>{transaction.description}</Text>
        <Text style={styles.date}>{transaction.date}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, {color: amountColor}]}>
          {transaction.type === 'dépense' ? '-' : '+'}{transaction.montant} FCFA
        </Text>
        <Text style={[styles.status, transaction.statut === 'terminé' ? styles.success : transaction.statut === 'en cours' ? styles.pending : styles.failed]}>
          {transaction.statut}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card:{
    flexDirection:'row',
    alignItems:'center',
    backgroundColor:'#fff',
    padding:12,
    marginVertical:6,
    marginHorizontal:16,
    borderRadius:12,
    shadowColor:'#000',
    shadowOpacity:0.05,
    shadowRadius:4,
    elevation:2,
  },
  iconContainer:{
    width:40,
    height:40,
    borderRadius:20,
    backgroundColor:'#E5E7EB',
    justifyContent:'center',
    alignItems:'center',
    marginRight:12,
  },
  info:{
    flex:1,
  },
  description:{
    fontSize:14,
    fontWeight:'600',
    color:'#111827'
  },
  date:{
    fontSize:12,
    color:'#6B7280',
    marginTop:2
  },
  right:{
    alignItems:'flex-end'
  },
  amount:{
    fontSize:14,
    fontWeight:'600'
  },
  status:{
    fontSize:12,
    marginTop:2,
    textTransform:'capitalize'
  },
  success:{
    color:'#10B981'
  },
  pending:{
    color:'#FBBF24'
  },
  failed:{
    color:'#F43F5E'
  }
})

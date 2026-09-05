import { ScrollView, View, Text, StyleSheet } from 'react-native';
import React from 'react';
import TransactionCard from './transactionCard';
import { transaction } from '../../utils/dataTrans'; 

export default function TransactionsRecent() {
  return (
    <View style={{marginTop:20}}>
      <Text style={styles.title}>Transactions récentes</Text>
      <ScrollView style={{marginTop:8}}>
        {transaction.map((tx, index) => (
          <TransactionCard key={index} transaction={tx} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title:{
    fontSize:18,
    fontWeight:'bold',
    marginHorizontal:16,
    color:'#111827'
  }
})

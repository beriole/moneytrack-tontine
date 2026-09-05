import { View, Text, SafeAreaView, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import React, { useState } from 'react'
import TransactionCard from '../../utils/transactionCard'
import { transaction } from '../../utils/dataTrans'
import DateTimePicker from '@react-native-community/datetimepicker'
import { FontAwesome as Icon } from '@expo/vector-icons';
import { AntDesign } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native'
export default function Transactions() {
  const [showPicker, setShowPicker] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [filteredTransactions, setFilteredTransactions] = useState(transaction)
  const Navigation=useNavigation();
  const handleDateChange = (event, date) => {
    setShowPicker(false) 
    if (date) {
      setSelectedDate(date)
      const filtered = transaction.filter(tx => {
        const txDate = new Date(tx.date)
        return txDate.toDateString() === date.toDateString()
      })
      setFilteredTransactions(filtered)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{justifyContent:'center',alignItems:'center',flexDirection:'row'}}>
           <AntDesign  onPress={()=>Navigation.goBack()} name='arrow-left' size={26} color={'white'} />
           <Text style={styles.headerText}>Transactions</Text>
        </View>
        <TouchableOpacity style={styles.dateSelector} onPress={() => setShowPicker(true)}>
          <Icon name="calendar" size={20} color="#fff"/>
          <Text style={styles.dateText}>
            {selectedDate ? selectedDate.toDateString() : "Sélectionner une date"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {filteredTransactions.length === 0 ? (
          <Text style={styles.noTx}>Aucune transaction pour cette date</Text>
        ) : (
          filteredTransactions.map((tx, index) => (
            <TransactionCard key={index} transaction={tx} />
          ))
        )}
      </ScrollView>

      {showPicker && (
        <DateTimePicker
          value={selectedDate || new Date()}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:{
    flex:1,
    backgroundColor:'#161427',
  },
  header:{
    paddingVertical:16,
    paddingHorizontal:16,
    backgroundColor:'#211C3A',
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between',
    marginBottom:8,
    borderRadius:12,
    marginHorizontal:16,
  },
  headerText:{
    color:'#fff',
    fontSize:20,
    fontWeight:'bold'
  },
  dateSelector:{
    flexDirection:'row',
    alignItems:'center',
    backgroundColor:'#6366F1',
    paddingHorizontal:12,
    paddingVertical:6,
    borderRadius:12,
    gap:8
  },
  dateText:{
    color:'#fff',
    fontWeight:'600'
  },
  noTx:{
    color:'#fff',
    textAlign:'center',
    marginTop:40,
    fontSize:16,
    fontStyle:'italic'
  }
})

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Entypo from 'react-native-vector-icons/Entypo';
import AntDesign from 'react-native-vector-icons/AntDesign';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';

export default function Setting() {
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [budgetAlert, setBudgetAlert] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [biometric, setBiometric] = useState(false);

  const Navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.flexRow} onPress={() => Navigation.goBack()}>
          <Entypo name='chevron-left' size={24} color="#fff" />
          <Text style={styles.headerBack}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <AntDesign name='user' size={24} color="#fff" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        
        {/* Sécurité */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sécurité</Text>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <MaterialIcons name="fingerprint" size={22} color="#3B82F6" />
              <Text style={styles.rowText}>Connexion biométrique</Text>
            </View>
            <Switch
              value={biometric}
              onValueChange={setBiometric}
              trackColor={{ false: '#767577', true: '#3B82F6' }}
              thumbColor={biometric ? '#1E40AF' : '#f4f3f4'}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <AntDesign name="lock" size={22} color="#3B82F6" />
              <Text style={styles.rowText}>Changer le mot de passe</Text>
            </View>
            <Entypo name="chevron-right" size={20} color="#94A3B8" />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <MaterialIcons name="notifications" size={22} color="#3B82F6" />
              <Text style={styles.rowText}>Activer les notifications</Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={setNotifEnabled}
              trackColor={{ false: '#767577', true: '#3B82F6' }}
              thumbColor={notifEnabled ? '#1E40AF' : '#f4f3f4'}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <MaterialIcons name="warning" size={22} color="#3B82F6" />
              <Text style={styles.rowText}>Alertes de dépassement de budget</Text>
            </View>
            <Switch
              value={budgetAlert}
              onValueChange={setBudgetAlert}
              trackColor={{ false: '#767577', true: '#3B82F6' }}
              thumbColor={budgetAlert ? '#1E40AF' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Préférences */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Préférences</Text>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <MaterialIcons name="dark-mode" size={22} color="#3B82F6" />
              <Text style={styles.rowText}>Mode sombre</Text>
            </View>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: '#767577', true: '#3B82F6' }}
              thumbColor={darkMode ? '#1E40AF' : '#f4f3f4'}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Entypo name="globe" size={22} color="#3B82F6" />
              <Text style={styles.rowText}>Langue</Text>
            </View>
            <Entypo name="chevron-right" size={20} color="#94A3B8" />
          </View>
        </View>

        {/* Politique & Confidentialité */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Confidentialité & Politique</Text>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <AntDesign name="filetext1" size={22} color="#3B82F6" />
              <Text style={styles.rowText}>Politique de confidentialité</Text>
            </View>
            <Entypo name="chevron-right" size={20} color="#94A3B8" />
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <AntDesign name="exclamationcircleo" size={22} color="#3B82F6" />
              <Text style={styles.rowText}>Conditions d’utilisation</Text>
            </View>
            <Entypo name="chevron-right" size={20} color="#94A3B8" />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{
    flex:1,
    backgroundColor:'#0D1B2A'
  },
  header:{
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between',
    padding:16,
    backgroundColor:'#1E293B',
  },
  flexRow:{
    flexDirection:'row',
    alignItems:'center',
    gap:8
  },
  headerBack:{
    color:'#fff',
    fontSize:16,
    marginLeft:6
  },
  headerTitle:{
    color:'#fff',
    fontSize:20,
    fontWeight:'bold'
  },
  card:{
    backgroundColor:'#1E293B',
    marginHorizontal:16,
    marginVertical:10,
    borderRadius:16,
    padding:16,
    shadowColor:'#000',
    shadowOpacity:0.1,
    shadowRadius:6,
    elevation:3
  },
  sectionTitle:{
    color:'#CBD5E1',
    fontSize:14,
    marginBottom:12,
    fontWeight:'bold'
  },
  row:{
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between',
    paddingVertical:12,
    borderBottomWidth:1,
    borderBottomColor:'#334155'
  },
  rowLeft:{
    flexDirection:'row',
    alignItems:'center',
    gap:10
  },
  rowText:{
    color:'#fff',
    fontSize:16
  }
});

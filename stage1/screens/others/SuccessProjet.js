import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import AntDesign from "react-native-vector-icons/AntDesign";

export default function SuccessProjet({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <AntDesign name="checkcircle" size={120} color="#16A34A" />
      </View>
      <Text style={styles.title}>Projet créé avec succès </Text>
      <Text style={styles.subtitle}>
        Votre projet et ses catégories de déblocage ont bien été enregistrés.
      </Text>

      <TouchableOpacity 
        style={styles.btn} 
        onPress={() => navigation.navigate("Home")}
      >
        <Text style={styles.btnText}>Retour à l'accueil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1B2A",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  iconWrapper: {
    backgroundColor: "#1E2A47",
    borderRadius: 100,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#16A34A",
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
    elevation: 10
  },
  title: { 
    color: "#fff", 
    fontSize: 22, 
    fontWeight: "bold", 
    textAlign: "center",
    marginBottom: 10 
  },
  subtitle: { 
    color: "#ccc", 
    fontSize: 16, 
    textAlign: "center", 
    marginBottom: 30 
  },
  btn: {
    backgroundColor: "#16A34A",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12
  },
  btnText: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "bold" 
  }
});

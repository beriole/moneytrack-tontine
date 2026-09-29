import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Info } from './composants';
import { ouvrirLitige, messageErreur } from '../../utils/tontineApi';

// Contester une operation. L'ecran n'envoie que l'operation visee et le
// recit du membre : les preuves, c'est le serveur qui les prend, telles
// qu'elles sont en base au moment de l'ouverture.
export default function Contester() {
  const navigation = useNavigation();
  const { objetType = 'autre', objetId = null, resume = null } = useRoute().params || {};
  const [description, setDescription] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const envoyer = async () => {
    const texte = description.trim();
    if (texte.length < 10) {
      Alert.alert('Precisez', 'Expliquez en quelques mots ce que vous contestez et pourquoi.');
      return;
    }
    try {
      setEnvoi(true);
      const { data } = await ouvrirLitige(objetType, objetId, texte);
      Alert.alert('Litige ouvert', data.message);
      navigation.replace('MesLitiges');
    } catch (e) {
      Alert.alert("Impossible d'ouvrir le litige", messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>{objetType === 'autre' ? 'Signaler un probleme' : 'Contester'}</Text>
        {resume ? (
          <View style={s.carte}>
            <Text style={s.carteInfo}>Operation contestee</Text>
            <Text style={[s.carteTitre, { marginTop: 4 }]}>{resume}</Text>
          </View>
        ) : null}

        <Text style={s.label}>Ce qui s'est passe</Text>
        <TextInput
          style={[s.champ, { height: 140, textAlignVertical: 'top' }]}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
          placeholder="Ce que vous contestez, et pourquoi. Dates et montants aident."
          placeholderTextColor={colors.textMuted}
        />
        <Text style={s.aide}>{`${description.trim().length} / 2000`}</Text>

        <Info texte="Les pieces de l'operation — montants, ecritures, historique — sont conservees par MoneyTrack au moment ou vous ouvrez le litige. Contester ne suspend pas l'operation : un agent l'examine et vous repond." />

        <Bouton titre="Ouvrir le litige" icone="check" charge={envoi} onPress={envoyer} />
      </ScrollView>
    </SafeAreaView>
  );
}

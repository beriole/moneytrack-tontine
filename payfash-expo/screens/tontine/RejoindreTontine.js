import React, { useState } from 'react';
import { Text, SafeAreaView, ScrollView, TextInput, Alert, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Info } from './composants';
import { rejoindreGroupe, messageErreur } from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

export default function RejoindreTontine() {
  const navigation = useNavigation();
  const { rafraichir } = useTontine();
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const valider = async () => {
    const propre = code.trim().toUpperCase();
    if (propre.length < 6) return Alert.alert('Code incomplet', "Saisissez le code d'invitation complet.");

    try {
      setEnvoi(true);
      const { data } = await rejoindreGroupe(propre);
      await rafraichir();
      navigation.replace('SuccesTontine', {
        titre: 'Bienvenue',
        message: data.message,
        groupeId: data.groupe.id,
      });
    } catch (e) {
      Alert.alert('Adhesion impossible', messageErreur(e));
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

        <Text style={s.titre}>Rejoindre une tontine</Text>
        <Text style={s.sousTitre}>Demandez son code au president du groupe</Text>

        <Text style={s.label}>Code d'invitation</Text>
        <TextInput
          style={[s.champ, { fontSize: 22, letterSpacing: 4, textAlign: 'center', fontWeight: 'bold' }]}
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          placeholder="XXXXXXXX"
          placeholderTextColor={colors.textMuted}
        />

        <Info texte="On ne rejoint une tontine qu'avant son demarrage : une fois le premier tour lance, l'ordre de passage est fige et le groupe se ferme." />

        <Bouton titre="Rejoindre" icone="login" onPress={valider} charge={envoi} inactif={code.trim().length < 6} />
      </ScrollView>
    </SafeAreaView>
  );
}

import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Ligne, Info, Segments } from './composants';
import { demanderCredit, messageErreur, fcfa } from '../../utils/tontineApi';

const DUREES = [
  { valeur: '1', libelle: '1 mois' },
  { valeur: '3', libelle: '3 mois' },
  { valeur: '6', libelle: '6 mois' },
  { valeur: '12', libelle: '12 mois' },
];

export default function DemanderCredit() {
  const navigation = useNavigation();
  const { groupeId, disponible } = useRoute().params;

  const [montant, setMontant] = useState('');
  const [duree, setDuree] = useState('3');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const m = parseFloat(montant) || 0;
  const n = parseInt(duree, 10);
  const TAUX = 5; // estimation a l'ecran ; le backend applique le taux du groupe
  const interets = Math.round(m * (TAUX / 100) * n);
  const total = m + interets;
  const mensualite = n > 0 ? Math.round(total / n) : 0;
  const trop = m > Number(disponible || 0);

  const valider = async () => {
    if (!(m > 0)) return Alert.alert('Montant invalide', 'Indiquez la somme souhaitee.');
    try {
      setEnvoi(true);
      const { data } = await demanderCredit(groupeId, { montant: m, dureeMois: n, motif: motif.trim() || undefined });
      navigation.replace('SuccesTontine', {
        titre: 'Demande deposee',
        montant: fcfa(m),
        message: data.message,
        groupeId,
      });
    } catch (e) {
      Alert.alert('Demande impossible', messageErreur(e));
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

        <Text style={s.titre}>Demander un credit</Text>
        <Text style={s.sousTitre}>Disponible dans la caisse : {fcfa(disponible)}</Text>

        <Text style={s.label}>Montant souhaite (FCFA)</Text>
        <TextInput
          style={s.champ}
          value={montant}
          onChangeText={setMontant}
          keyboardType="numeric"
          placeholder="50000"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={s.label}>Duree de remboursement</Text>
        <Segments options={DUREES} valeur={duree} onChange={setDuree} />

        <Text style={s.label}>Motif (facultatif)</Text>
        <TextInput
          style={[s.champ, { height: 72, textAlignVertical: 'top' }]}
          value={motif}
          onChangeText={setMotif}
          multiline
          placeholder="Stock pour la boutique, frais de scolarite..."
          placeholderTextColor={colors.textMuted}
        />

        {m > 0 && (
          <View style={[s.carte, { marginTop: 20 }]}>
            <Text style={s.carteTitre}>Estimation</Text>
            <Ligne label="Capital emprunte" valeur={fcfa(m)} />
            <Ligne label={`Interets (${TAUX} %/mois x ${n})`} valeur={fcfa(interets)} couleur={colors.warning} />
            <Ligne label="Total a rembourser" valeur={fcfa(total)} couleur={colors.accent} />
            <Ligne label={`Mensualite (${n} echeances)`} valeur={fcfa(mensualite)} dernier />
          </View>
        )}

        <Info texte="Interet simple : le taux s'applique au capital initial, et les echeances sont egales. Le taux reel est celui fixe par votre groupe. La demande est soumise au vote des membres avant tout decaissement." />

        {trop && (
          <Text style={[s.aide, { color: colors.danger }]}>
            La caisse ne dispose que de {fcfa(disponible)}.
          </Text>
        )}

        <Bouton titre="Soumettre au vote du groupe" icone="check" onPress={valider} charge={envoi} inactif={trop} />
      </ScrollView>
    </SafeAreaView>
  );
}

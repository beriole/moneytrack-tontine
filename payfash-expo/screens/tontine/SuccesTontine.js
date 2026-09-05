import React from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, Share, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s, { carteHaute } from './styleTontine';
import { Bouton } from './composants';

// Ecran de confirmation partage par toutes les operations du module,
// dans l'esprit des ecrans SuccesDepense / SuccesEpargne du projet.
export default function SuccesTontine() {
  const navigation = useNavigation();
  const { titre, message, code, groupeId, montant } = useRoute().params || {};

  const partager = async () => {
    try {
      await Share.share({
        message: `Rejoins ma tontine sur MoneyTrack avec le code ${code}`,
      });
    } catch (e) {
      Alert.alert('Partage impossible', e.message);
    }
  };

  return (
    <SafeAreaView style={[s.page, { justifyContent: 'center', padding: 26 }]}>
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(16,185,129,0.15)',
            justifyContent: 'center', alignItems: 'center', marginBottom: 22,
          }}
        >
          <AntDesign name="check-circle" size={46} color={colors.success} />
        </View>

        <Text style={[s.titre, { textAlign: 'center' }]}>{titre || 'Operation reussie'}</Text>
        {montant ? (
          <Text style={{ color: colors.success, fontSize: 26, fontWeight: 'bold', marginTop: 6 }}>{montant}</Text>
        ) : null}
        <Text style={[s.sousTitre, { textAlign: 'center', marginTop: 10, lineHeight: 20 }]}>{message}</Text>

        {code ? (
          <View style={{ backgroundColor: carteHaute, borderRadius: 14, padding: 18, alignItems: 'center', width: '100%', marginTop: 6 }}>
            <Text style={s.statLabel}>CODE D'INVITATION</Text>
            <Text style={{ color: colors.white, fontSize: 28, fontWeight: 'bold', letterSpacing: 5, marginTop: 6 }}>
              {code}
            </Text>
            <TouchableOpacity onPress={partager} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
              <MaterialCommunityIcons name="share-variant" size={17} color={colors.accent} />
              <Text style={{ color: colors.accent, marginLeft: 7, fontWeight: '600' }}>Partager le code</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: 18 }}>
        {groupeId ? (
          <Bouton
            titre="Ouvrir la tontine"
            icone="arrow-right"
            onPress={() => navigation.replace('DetailTontine', { groupeId })}
          />
        ) : null}
        <Bouton
          titre="Retour a l'accueil"
          variante="secondaire"
          onPress={() => navigation.navigate('Menu')}
        />
      </View>
    </SafeAreaView>
  );
}

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s, { carteHaute } from './styleTontine';
import { Pastille, Chargement, Info } from './composants';
import { detailGroupe, transmettrePresidence, messageErreur, fcfa } from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

const ICONE_ROLE = {
  president: 'crown',
  membre: 'account',
};

export default function MembresTontine() {
  const navigation = useNavigation();
  const { groupeId } = useRoute().params;
  const { monId } = useTontine();
  const [data, setData] = useState(null);

  const charger = useCallback(async () => {
    try {
      const { data: d } = await detailGroupe(groupeId);
      setData(d);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  if (!data) return <Chargement />;
  const { groupe, permissions } = data;
  const peutTransmettre = !!permissions?.actes?.transmettrePresidence;

  const transmettre = (m) => {
    Alert.alert(
      'Transmettre la presidence',
      `${m.client?.nom || 'Ce membre'} dirigera la tontine a votre place. Vous redeviendrez simple membre : `
        + 'vous ne pourrez plus demarrer un cycle, sanctionner ni verser le pot.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Transmettre',
          style: 'destructive',
          onPress: async () => {
            try {
              await transmettrePresidence(groupeId, m.clientId);
              await charger();
            } catch (e) {
              Alert.alert('Passation impossible', messageErreur(e));
            }
          },
        },
      ]
    );
  };
  const membres = [...(groupe.membres || [])].sort(
    (a, b) => (a.ordreBeneficiaire ?? 99) - (b.ordreBeneficiaire ?? 99)
  );
  const moi = membres.find((m) => m.clientId === monId);

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Membres et tours</Text>
        <Text style={s.sousTitre}>
          {groupe.membresActuels} membres · ordre par {groupe.modeOrdre}
        </Text>

        {membres.map((m) => {
          const estMoi = moi && m.id === moi.id;
          return (
            <View key={m.id} style={[s.carte, estMoi && { borderWidth: 1, borderColor: colors.accent }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 38, height: 38, borderRadius: 19, backgroundColor: carteHaute,
                    justifyContent: 'center', alignItems: 'center', marginRight: 12,
                  }}
                >
                  {m.ordreBeneficiaire ? (
                    <Text style={{ color: colors.white, fontWeight: 'bold', fontSize: 15 }}>{m.ordreBeneficiaire}</Text>
                  ) : (
                    <MaterialCommunityIcons name="minus" size={16} color={colors.textMuted} />
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.white, fontSize: 15, fontWeight: '600' }}>
                    {m.client?.nom || `Membre ${m.clientId}`}
                    {estMoi ? '  (vous)' : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                    <MaterialCommunityIcons
                      name={ICONE_ROLE[m.role] || 'account'}
                      size={13}
                      color={colors.textMuted}
                    />
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 5 }}>
                      {m.role}
                      {m.aBeneficie ? ' · a deja mange' : ''}
                    </Text>
                  </View>
                </View>

                <Pastille statut={m.statut} />
              </View>

              {peutTransmettre && !estMoi && m.statut === 'actif' && m.role !== 'president' && (
                <TouchableOpacity onPress={() => transmettre(m)} style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="crown-outline" size={14} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontSize: 12, marginLeft: 6 }}>
                      Lui transmettre la presidence
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              <View style={{ flexDirection: 'row', marginTop: 12, flexWrap: 'wrap' }}>
                <Etiquette
                  icone={m.cautionPaye || m.cautionPayee ? 'lock-check' : 'lock-open-variant'}
                  texte={m.cautionPayee ? `Caution ${fcfa(m.montantCaution)}` : 'Sans caution'}
                  couleur={m.cautionPayee ? colors.success : colors.textMuted}
                />
                {m.nbAvertissements > 0 && (
                  <Etiquette icone="alert" texte={`${m.nbAvertissements} avertissement(s)`} couleur={colors.warning} />
                )}
              </View>
            </View>
          );
        })}

        <Info texte="Le numero est l'ordre de passage. Un membre exclu sort de la file et les tours restants se resserrent : personne ne saute son tour." />
        {peutTransmettre && (
          <Info texte="La presidence se transmet a un membre actif. Elle ne se partage pas : en la donnant, vous la perdez." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Etiquette = ({ icone, texte, couleur }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 4 }}>
    <MaterialCommunityIcons name={icone} size={13} color={couleur} />
    <Text style={{ color: couleur, fontSize: 12, marginLeft: 5 }}>{texte}</Text>
  </View>
);

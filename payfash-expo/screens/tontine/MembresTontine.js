import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s, { carteHaute } from './styleTontine';
import { Pastille, Chargement, Info } from './composants';
import { detailGroupe, designerGarant, messageErreur, fcfa } from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

const ICONE_ROLE = {
  president: 'crown',
  tresorier: 'cash-register',
  censeur: 'gavel',
  secretaire: 'notebook',
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

  const choisirGarant = (membre) => {
    const candidats = data.groupe.membres.filter((m) => m.statut === 'actif' && m.clientId !== membre.clientId);
    if (!candidats.length) return Alert.alert('Aucun candidat', 'Il faut un autre membre actif pour se porter garant.');

    Alert.alert(
      'Choisir mon garant',
      "Ce membre couvrira vos cotisations en cas de defaut. C'est un engagement reel de sa part.",
      [
        ...candidats.slice(0, 3).map((c) => ({
          text: c.client?.nom || `Membre ${c.clientId}`,
          onPress: async () => {
            try {
              await designerGarant(groupeId, c.clientId);
              await charger();
              Alert.alert('Garant enregistre', `${c.client?.nom} se porte garant pour vous.`);
            } catch (e) {
              Alert.alert('Impossible', messageErreur(e));
            }
          },
        })),
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  if (!data) return <Chargement />;
  const { groupe } = data;
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

              <View style={{ flexDirection: 'row', marginTop: 12, flexWrap: 'wrap' }}>
                <Etiquette
                  icone={m.cautionPaye || m.cautionPayee ? 'lock-check' : 'lock-open-variant'}
                  texte={m.cautionPayee ? `Caution ${fcfa(m.montantCaution)}` : 'Sans caution'}
                  couleur={m.cautionPayee ? colors.success : colors.textMuted}
                />
                {m.nbAvertissements > 0 && (
                  <Etiquette icone="alert" texte={`${m.nbAvertissements} avertissement(s)`} couleur={colors.warning} />
                )}
                {m.garantId && <Etiquette icone="account-check" texte="Garant designe" couleur={colors.accent} />}
              </View>

              {estMoi && !m.garantId && (
                <TouchableOpacity onPress={() => choisirGarant(m)} style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
                    + Designer mon garant
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <Info texte="Le numero est l'ordre de passage. Un membre exclu sort de la file et les tours restants se resserrent : personne ne saute son tour." />
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

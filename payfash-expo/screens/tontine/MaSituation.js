import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Chargement, Info, Ligne } from './composants';
import { maSituation, monRisque, messageErreur, fcfa, dateCourte } from '../../utils/tontineApi';

// La couleur porte le niveau autant que le mot. Le vocabulaire est celui du
// serveur : une situation financiere, jamais un jugement.
const NIVEAU = {
  FAIBLE: { couleur: colors.success, icone: 'shield-check-outline' },
  MODERE: { couleur: colors.warning, icone: 'shield-half-full' },
  ELEVE: { couleur: colors.danger, icone: 'shield-alert-outline' },
};

const Puces = ({ titre, items, couleur, icone }) => (
  items.length > 0 ? (
    <>
      <Text style={s.section}>{titre}</Text>
      <View style={s.carte}>
        {items.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: i < items.length - 1 ? 10 : 0 }}>
            <MaterialCommunityIcons name={icone} size={18} color={couleur} style={{ marginRight: 10, marginTop: 1 }} />
            <Text style={[s.carteInfo, { flex: 1, marginTop: 0 }]}>{t}</Text>
          </View>
        ))}
      </View>
    </>
  ) : null
);

export default function MaSituation() {
  const navigation = useNavigation();
  const [situation, setSituation] = useState(null);
  const [risque, setRisque] = useState(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [{ data: sit }, { data: r }] = await Promise.all([maSituation(), monRisque()]);
      setSituation(sit);
      setRisque(r);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    } finally {
      setRafraichissement(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  if (!situation || !risque) return <Chargement />;
  const niveau = NIVEAU[risque.niveau] || NIVEAU.MODERE;
  const ind = risque.indicateurs;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={s.contenu}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={() => { setRafraichissement(true); charger(); }} tintColor={colors.white} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Ma situation</Text>
        <Text style={s.sousTitre}>Ce que MoneyTrack sait de vos engagements, et ce qui pese dessus</Text>

        <View style={[s.carte, { flexDirection: 'row', alignItems: 'center' }]}>
          <MaterialCommunityIcons name={niveau.icone} size={34} color={niveau.couleur} style={{ marginRight: 14 }} />
          <View style={{ flex: 1 }}>
            <Text style={[s.carteTitre, { color: niveau.couleur }]}>{risque.libelle}</Text>
            {!risque.donneesSuffisantes && (
              <Text style={s.carteInfo}>Encore peu d'historique : cette mesure s'affinera avec vos cotisations.</Text>
            )}
          </View>
        </View>

        <Puces titre="Points d'attention" items={risque.pointsAttention} couleur={colors.warning} icone="alert-circle-outline" />
        <Puces titre="Atouts" items={risque.atouts} couleur={colors.success} icone="check-circle-outline" />

        <Text style={s.section}>Mes engagements</Text>
        <View style={s.carte}>
          <Ligne label="Tontines, par mois" valeur={fcfa(ind.engagementMensuel)} />
          <Ligne label="Reste a verser, toutes tontines" valeur={fcfa(ind.expositionTotale)} />
          <Ligne label="Echeances sous 30 jours" valeur={fcfa(ind.echeances30j)} />
          <Ligne label="Disponible" valeur={fcfa(ind.disponible)}
            couleur={ind.disponible < ind.echeances30j ? colors.warning : undefined} />
          <Ligne label="Bloque en garantie" valeur={fcfa(ind.bloque)} dernier />
        </View>

        <Text style={s.section}>Mon compte</Text>
        <View style={s.carte}>
          <Ligne label="Verification" valeur={situation.kyc.libelle}
            dernier={situation.restrictions.length === 0} />
          {situation.restrictions.map((r, i) => (
            <Ligne
              key={r.id}
              label={r.libelle}
              valeur={r.jusqua ? `jusqu'au ${dateCourte(r.jusqua)}` : 'jusqu\'a nouvel ordre'}
              couleur={colors.danger}
              dernier={i === situation.restrictions.length - 1}
            />
          ))}
        </View>
        {situation.restrictions.map((r) => (
          <Text key={`m${r.id}`} style={s.aide}>{`${r.libelle} : ${r.motif}`}</Text>
        ))}

        <Info texte={risque.note} />
      </ScrollView>
    </SafeAreaView>
  );
}

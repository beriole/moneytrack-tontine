import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Bouton, Chargement, Vide, Info } from './composants';
import { mesLitiges, messageErreur, dateCourte } from '../../utils/tontineApi';

export default function MesLitiges() {
  const navigation = useNavigation();
  const [liste, setListe] = useState(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { data } = await mesLitiges();
      setListe(data.litiges || []);
    } catch (e) {
      setListe([]);
      Alert.alert('Chargement impossible', messageErreur(e));
    } finally {
      setRafraichissement(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  if (!liste) return <Chargement />;
  const ouverts = liste.filter((l) => ['en attente', 'en cours'].includes(l.statut)).length;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={s.contenu}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={() => { setRafraichissement(true); charger(); }} tintColor={colors.white} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Mes litiges</Text>
        <Text style={s.sousTitre}>
          {ouverts > 0 ? `${ouverts} en cours d'examen` : 'Aucun litige en attente'}
        </Text>

        {liste.length === 0 ? (
          <Vide icone="scale-balance" texte={"Aucun litige.\nVous pouvez contester une amende, une echeance ou un prelevement depuis son ecran."} />
        ) : liste.map((l) => (
          <View key={l.id} style={s.carte}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={[s.carteTitre, { flex: 1, paddingRight: 10 }]}>{l.objet || 'Signalement'}</Text>
              <Pastille statut={l.statut} />
            </View>
            <Text style={s.carteInfo}>{`N°${l.id} · ouvert le ${dateCourte(l.ouvertLe)}`}</Text>
            <Text style={[s.carteInfo, { marginTop: 8, color: colors.white }]}>{l.description}</Text>
            {l.reponse ? (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                <Text style={s.carteInfo}>{`Reponse${l.traiteLe ? ` du ${dateCourte(l.traiteLe)}` : ''}`}</Text>
                <Text style={{ color: colors.white, fontSize: 14, marginTop: 4, lineHeight: 20 }}>{l.reponse}</Text>
              </View>
            ) : null}
          </View>
        ))}

        <Bouton titre="Signaler un autre probleme" icone="plus-circle" variante="secondaire"
          onPress={() => navigation.navigate('Contester', { objetType: 'autre' })} />
        <Info texte="Pour contester une operation precise, passez par son ecran (amende, echeance, garantie) : ses pieces seront jointes automatiquement." />
      </ScrollView>
    </SafeAreaView>
  );
}

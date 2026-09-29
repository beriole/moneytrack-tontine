import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from '../tontine/styleTontine';
import { Chargement, Vide } from '../tontine/composants';
import { mesNotifications, marquerLue } from '../../utils/notificationsApi';
import { messageErreur } from '../../utils/tontineApi';

// Les notifications que le serveur envoie vraiment : rappels, retards, pot
// verse, garantie mobilisee, vote ouvert... L'ecran affichait jusqu'ici une
// liste figee, ecrite en dur, sans rapport avec le compte.

const TYPE = {
  alerte: { icone: 'alert-circle-outline', couleur: colors.warning },
  promo: { icone: 'tag-outline', couleur: colors.violetLight },
  system: { icone: 'bell-outline', couleur: colors.accentLight },
};

// Ecrans vers lesquels un lien peut mener. « Communaute » est un onglet :
// on y passe par le navigateur a onglets.
const DESTINATIONS = {
  Communaute: (nav) => nav.navigate('Menu', { screen: 'Communaute' }),
};

function ilYa(date) {
  const min = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  if (min < 1) return "a l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j < 30) return `il y a ${j} j`;
  return new Date(date).toLocaleDateString('fr-FR');
}

export default function Notification() {
  const navigation = useNavigation();
  const [liste, setListe] = useState(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { data } = await mesNotifications();
      setListe(Array.isArray(data) ? data : []);
    } catch (e) {
      setListe([]);
      Alert.alert('Chargement impossible', messageErreur(e));
    } finally {
      setRafraichissement(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const ouvrir = async (n) => {
    const lue = n.NotificationEnvoyer?.lu;
    if (!lue) {
      // Marquee lue tout de suite a l'ecran ; le serveur suit.
      setListe((l) => l.map((x) => (x.id === n.id ? { ...x, NotificationEnvoyer: { ...x.NotificationEnvoyer, lu: true } } : x)));
      marquerLue(n.id).catch(() => {});
    }
    const lien = n.lien;
    if (!lien || !lien.ecran) return;
    try {
      if (DESTINATIONS[lien.ecran]) DESTINATIONS[lien.ecran](navigation);
      else navigation.navigate(lien.ecran, lien.params || {});
    } catch (e) {
      Alert.alert('Destination indisponible', "L'ecran lie a cette notification n'existe plus.");
    }
  };

  if (!liste) return <Chargement />;
  const nonLues = liste.filter((n) => !n.NotificationEnvoyer?.lu).length;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={s.contenu}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={() => { setRafraichissement(true); charger(); }} tintColor={colors.white} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Notifications</Text>
        <Text style={s.sousTitre}>
          {nonLues > 0 ? `${nonLues} non lue${nonLues > 1 ? 's' : ''} · touchez pour ouvrir` : 'Tout est lu'}
        </Text>

        {liste.length === 0 ? (
          <Vide icone="bell-off-outline" texte={"Aucune notification pour l'instant.\nRappels, retards et versements s'afficheront ici."} />
        ) : liste.map((n) => {
          const t = TYPE[n.Type] || TYPE.system;
          const lue = n.NotificationEnvoyer?.lu;
          return (
            <TouchableOpacity
              key={n.id}
              activeOpacity={0.85}
              onPress={() => ouvrir(n)}
              style={[s.carte, { flexDirection: 'row', alignItems: 'flex-start' }, !lue && { borderLeftWidth: 4, borderLeftColor: colors.accent }]}
            >
              <MaterialCommunityIcons name={t.icone} size={22} color={t.couleur} style={{ marginRight: 12, marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: lue ? '400' : '600' }}>{n.message}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={s.carteInfo}>{n.categorie || (n.Type === 'alerte' ? 'Alerte' : 'Information')}</Text>
                  <Text style={s.carteInfo}>{ilYa(n.dateEnvoie || n.createdAt)}</Text>
                </View>
              </View>
              {n.lien?.ecran ? <AntDesign name="right" size={14} color={colors.textMuted} style={{ marginLeft: 8, marginTop: 4 }} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

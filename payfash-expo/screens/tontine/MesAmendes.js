import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Bouton, Chargement, Vide, Info, Stat } from './composants';
import { mesAmendes, payerAmende, messageErreur, fcfa, dateCourte } from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

const MOTIFS = {
  retard: 'Retard de cotisation',
  absence: 'Absence en seance',
  indiscipline: 'Indiscipline',
  autre: 'Autre',
};

export default function MesAmendes() {
  const navigation = useNavigation();
  const { groupeId } = useRoute().params || {};
  const { apresMouvement } = useTontine();

  const [data, setData] = useState(null);
  const [paiement, setPaiement] = useState(null);

  const charger = useCallback(async () => {
    try {
      const { data: d } = await mesAmendes(groupeId);
      setData(d);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const regler = async (amende) => {
    try {
      setPaiement(amende.id);
      const { data: r } = await payerAmende(amende.id);
      await apresMouvement();
      await charger();
      Alert.alert('Amende reglee', r.message);
    } catch (e) {
      Alert.alert('Paiement impossible', messageErreur(e));
    } finally {
      setPaiement(null);
    }
  };

  if (!data) return <Chargement />;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Mes amendes</Text>
        <Text style={s.sousTitre}>Une amende est une dette : elle se regle avant la cotisation suivante</Text>

        <View style={s.stats}>
          <Stat label="En cours" valeur={data.nombreDues} />
          <Stat label="Total du" valeur={fcfa(data.totalDu)} />
          <Stat label="Historique" valeur={data.amendes.length} />
        </View>

        {data.amendes.length === 0 ? (
          <Vide icone="shield-check-outline" texte={"Aucune amende.\nVous etes a jour dans toutes vos tontines."} />
        ) : (
          data.amendes.map((a) => (
            <View key={a.id} style={s.carte}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[s.carteTitre, { flex: 1, paddingRight: 10 }]}>{MOTIFS[a.motif] || a.motif}</Text>
                <Pastille statut={a.statut} />
              </View>

              <Text style={s.carteMontant}>{fcfa(a.montant)}</Text>
              <Text style={s.carteInfo}>
                {a.groupe?.nom || 'Tontine'} · {dateCourte(a.createdAt)}
                {a.auteur ? ` · infligee par ${a.auteur.nom}` : ' · levee automatiquement a l\'echeance'}
              </Text>
              {a.commentaire ? <Text style={s.carteInfo}>{a.commentaire}</Text> : null}
              <Text style={[s.carteInfo, { marginTop: 6 }]}>
                {a.cycle
                  ? `Indemnise le beneficiaire du cycle ${a.cycle.numeroCycle}`
                  : 'Grossira le premier pot verse'}
              </Text>

              {a.statut === 'due' && (
                <Bouton
                  titre={`Regler ${fcfa(a.montant)}`}
                  icone="wallet"
                  charge={paiement === a.id}
                  onPress={() => regler(a)}
                />
              )}
              {a.statut !== 'annulee' && (
                <Bouton
                  titre="Contester"
                  icone="exclamation-circle"
                  variante="secondaire"
                  onPress={() => navigation.navigate('Contester', {
                    objetType: 'amende', objetId: a.id,
                    resume: `${MOTIFS[a.motif] || a.motif} — ${fcfa(a.montant)} (${a.groupe?.nom || 'tontine'})`,
                  })}
                />
              )}
            </View>
          ))
        )}

        <Info texte="Une amende ne va jamais a la plateforme : elle indemnise le membre que le retard a lese, le beneficiaire du cycle concerne. Si son pot est deja verse, elle lui est envoyee directement." />
      </ScrollView>
    </SafeAreaView>
  );
}

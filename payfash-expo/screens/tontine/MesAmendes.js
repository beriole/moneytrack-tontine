import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
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
                {a.censeur ? ` · infligee par ${a.censeur.nom}` : ' · levee automatiquement a l\'echeance'}
              </Text>
              {a.commentaire ? <Text style={s.carteInfo}>{a.commentaire}</Text> : null}
              <Text style={[s.carteInfo, { marginTop: 6 }]}>
                Destination : {a.destination === 'epargne' ? "caisse d'epargne du groupe" : 'pot du cycle'}
              </Text>

              {a.statut === 'due' && (
                <Bouton
                  titre={`Regler ${fcfa(a.montant)}`}
                  icone="wallet"
                  charge={paiement === a.id}
                  onPress={() => regler(a)}
                />
              )}
            </View>
          ))
        )}

        <Info texte="Les amendes ne vont jamais a la plateforme. Selon la regle du groupe, elles alimentent la caisse d'epargne — redistribuee a tous lors de la casse annuelle — ou le pot du cycle, qui indemnise le beneficiaire lese par le retard." />
      </ScrollView>
    </SafeAreaView>
  );
}

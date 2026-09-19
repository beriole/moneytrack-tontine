import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Bouton, Chargement, Vide, Info, Stat } from './composants';
import { mesIncidents, regulariserCotisation, messageErreur, fcfa, dateCourte } from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

// Ce que chaque source a apporte avant l'ouverture de l'incident, en mots.
const SOURCES = {
  caution: 'caution',
  garanties: 'garanties',
  retenue_pot: 'retenue sur votre pot',
};

const REGLE_PAR = {
  membre: 'reglee par vous',
  recouvrement: 'couverte par vos garanties',
  retenue_pot: 'retenue sur votre pot',
};

const apportsEnMots = (sources) => (sources || [])
  .map((a) => (a.montant > 0
    ? `${SOURCES[a.source] || a.source} : ${fcfa(a.montant)}`
    : `${SOURCES[a.source] || a.source} : ${a.note || 'rien de disponible'}`))
  .join(' · ');

export default function MesIncidents() {
  const navigation = useNavigation();
  const { apresMouvement } = useTontine();

  const [data, setData] = useState(null);
  const [paiement, setPaiement] = useState(null);

  const charger = useCallback(async () => {
    try {
      const { data: d } = await mesIncidents();
      setData(d);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const regler = async (incident) => {
    try {
      setPaiement(incident.id);
      const { data: r } = await regulariserCotisation(incident.cotisationId);
      await apresMouvement();
      await charger();
      Alert.alert('Echeance reglee', r.message);
    } catch (e) {
      Alert.alert('Reglement impossible', messageErreur(e));
    } finally {
      setPaiement(null);
    }
  };

  if (!data) return <Chargement />;
  const tous = [...data.ouverts, ...data.regles];

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Echeances a regulariser</Text>
        <Text style={s.sousTitre}>Ce que votre caution et vos garanties n'ont pas couvert</Text>

        <View style={s.stats}>
          <Stat label="A regler" valeur={data.ouverts.length} />
          <Stat label="Reste du" valeur={fcfa(data.totalDu)} />
          <Stat label="Reglees" valeur={data.regles.length} />
        </View>

        {tous.length === 0 ? (
          <Vide icone="shield-check-outline" texte={"Aucune echeance en souffrance.\nVous etes a jour dans toutes vos tontines."} />
        ) : (
          tous.map((i) => (
            <View key={i.id} style={s.carte}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[s.carteTitre, { flex: 1, paddingRight: 10 }]}>{i.groupe || 'Tontine'}</Text>
                <Pastille statut={i.statut} />
              </View>

              <Text style={s.carteMontant}>
                {i.statut === 'ouvert' ? fcfa(i.resteDu) : fcfa(i.montantInitial)}
              </Text>
              <Text style={s.carteInfo}>
                Constate le {dateCourte(i.ouvertLe)}
                {i.statut === 'ouvert' && i.resteDu < i.montantInitial
                  ? ` · ${fcfa(i.montantInitial - i.resteDu)} deja regles`
                  : ''}
                {i.statut === 'regle' ? ` · ${REGLE_PAR[i.modeReglement] || 'reglee'} le ${dateCourte(i.regleLe)}` : ''}
              </Text>
              {i.sourcesEssayees.length > 0 && (
                <Text style={[s.carteInfo, { marginTop: 6 }]}>Avant : {apportsEnMots(i.sourcesEssayees)}</Text>
              )}

              {i.statut === 'ouvert' && (
                <Bouton
                  titre={`Regler ${fcfa(i.resteDu)}`}
                  icone="wallet"
                  charge={paiement === i.id}
                  onPress={() => regler(i)}
                />
              )}
            </View>
          ))
        )}

        <Info texte="Tant qu'une echeance reste a regler, vous ne pouvez ni recevoir de pot, ni encherir, ni rejoindre une tontine. Le montant va au membre qui a recu moins que son du, ou au pot en cours s'il n'est pas encore verse." />
      </ScrollView>
    </SafeAreaView>
  );
}

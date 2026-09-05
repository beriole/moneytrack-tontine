import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Bouton, Chargement, Vide, Info } from './composants';
import {
  echangesGroupe, detailGroupe, proposerEchange, accepterEchange, refuserEchange, annulerEchange,
  messageErreur, fcfa, dateCourte,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

// Le marche des tours : avancer son passage se negocie, et se paie.
export default function EchangeTour() {
  const navigation = useNavigation();
  const { groupeId } = useRoute().params;
  const { apresMouvement, monId } = useTontine();

  const [echanges, setEchanges] = useState(null);
  const [groupe, setGroupe] = useState(null);
  const [compensation, setCompensation] = useState('');
  const [action, setAction] = useState(null);

  const charger = useCallback(async () => {
    try {
      const [e, g] = await Promise.all([echangesGroupe(groupeId), detailGroupe(groupeId)]);
      setEchanges(e.data.echanges);
      setGroupe(g.data);
    } catch (err) {
      Alert.alert('Chargement impossible', messageErreur(err));
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const executer = async (fn, id) => {
    try {
      setAction(id);
      const { data } = await fn();
      await apresMouvement();
      await charger();
      Alert.alert('Fait', data.message);
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    } finally {
      setAction(null);
    }
  };

  const proposer = () => {
    const candidats = (groupe?.groupe.membres || []).filter(
      (m) => m.statut === 'actif' && !m.aBeneficie && m.ordreBeneficiaire && m.clientId !== monId
    );
    if (!candidats.length) {
      return Alert.alert('Aucun echange possible', "Aucun autre membre n'a de tour encore disponible.");
    }
    const somme = parseFloat(compensation) || 0;
    Alert.alert(
      'Proposer un echange',
      somme > 0
        ? `Vous offrez ${fcfa(somme)} pour echanger votre tour ${groupe.monTour}. A qui ?`
        : `Echanger votre tour ${groupe.monTour} sans compensation. Avec qui ?`,
      [
        ...candidats.slice(0, 4).map((m) => ({
          text: `${m.client?.nom || 'Membre'} (tour ${m.ordreBeneficiaire})`,
          onPress: () => executer(() => proposerEchange(groupeId, m.clientId, somme), 'nouveau'),
        })),
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  if (!echanges || !groupe) return <Chargement />;

  const monTour = groupe.monTour;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Echanges de tours</Text>
        <Text style={s.sousTitre}>{monTour ? `Votre tour : ${monTour}` : 'Tours pas encore attribues'}</Text>

        <Info texte="Avancer son tour, c'est recevoir le pot plus tot. Celui qui recule rend un service : la compensation est facultative, mais c'est l'usage. Le tour du cycle en cours n'est plus negociable." />

        <Text style={s.label}>Compensation proposee (FCFA, facultatif)</Text>
        <TextInput
          style={s.champ}
          value={compensation}
          onChangeText={setCompensation}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
        />
        <Bouton
          titre="Proposer un echange"
          icone="swap"
          onPress={proposer}
          charge={action === 'nouveau'}
          inactif={!monTour}
        />

        <Text style={s.section}>Demandes</Text>
        {echanges.length === 0 ? (
          <Vide icone="swap-horizontal" texte={"Aucune demande d'echange dans ce groupe."} />
        ) : (
          echanges.map((e) => {
            const jeSuisDestinataire = e.destinataireId === monId;
            const jeSuisDemandeur = e.demandeurId === monId;
            return (
              <View key={e.id} style={s.carte}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={[s.carteTitre, { flex: 1, paddingRight: 10 }]}>
                    {e.demandeur?.nom || 'Membre'} → {e.destinataire?.nom || 'Membre'}
                  </Text>
                  <Pastille statut={e.statut === 'en_attente' ? 'attendue' : e.statut === 'accepte' ? 'payee' : 'annulee'} />
                </View>

                <Text style={s.carteInfo}>
                  Tour {e.tourDemandeur} contre tour {e.tourDestinataire}
                  {Number(e.montantCompensation) > 0 ? `  ·  ${fcfa(e.montantCompensation)} de compensation` : ''}
                </Text>
                <Text style={s.carteInfo}>Expire le {dateCourte(e.expireLe)}</Text>

                {e.statut === 'en_attente' && jeSuisDestinataire && (
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    <View style={{ flex: 1, marginRight: 6 }}>
                      <Bouton
                        titre="Accepter"
                        variante="success"
                        charge={action === e.id}
                        onPress={() => executer(() => accepterEchange(e.id), e.id)}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Bouton
                        titre="Refuser"
                        variante="secondaire"
                        charge={action === e.id}
                        onPress={() => executer(() => refuserEchange(e.id), e.id)}
                      />
                    </View>
                  </View>
                )}

                {e.statut === 'en_attente' && jeSuisDemandeur && (
                  <Bouton
                    titre="Annuler ma demande"
                    variante="secondaire"
                    charge={action === e.id}
                    onPress={() => executer(() => annulerEchange(e.id), e.id)}
                  />
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

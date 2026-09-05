import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Bouton, Chargement, Vide, Info } from './composants';
import {
  votesGroupe, detailVote, repondreVote, depouillerVote, creerVote, detailGroupe,
  messageErreur, dateCourte,
} from '../../utils/tontineApi';

const SUJETS = {
  admettre: 'Admettre un membre',
  exclure: 'Exclure un membre',
  modifier_regles: 'Modifier les regles',
  dissoudre: 'Dissoudre la tontine',
  elire_ordre: "Elire l'ordre de passage",
  approuver_credit: 'Approuver un credit',
};
const MODES = { majorite: 'Majorite simple', qualifiee: 'Majorite des deux tiers', unanimite: 'Unanimite' };

export default function VotesTontine() {
  const navigation = useNavigation();
  const { groupeId } = useRoute().params;

  const [data, setData] = useState(null);
  const [groupe, setGroupe] = useState(null);
  const [action, setAction] = useState(null);

  const charger = useCallback(async () => {
    try {
      const [v, g] = await Promise.all([votesGroupe(groupeId), detailGroupe(groupeId)]);
      setData(v.data);
      setGroupe(g.data);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const voter = (vote) => {
    Alert.alert(
      SUJETS[vote.sujet] || vote.sujet,
      vote.description || 'Exprimez-vous sur ce scrutin.',
      [
        { text: 'Pour', onPress: () => envoyer(() => repondreVote(vote.id, 'pour'), vote.id) },
        { text: 'Contre', onPress: () => envoyer(() => repondreVote(vote.id, 'contre'), vote.id) },
        { text: 'Abstention', onPress: () => envoyer(() => repondreVote(vote.id, 'abstention'), vote.id) },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  const envoyer = async (fn, id) => {
    try {
      setAction(id);
      const { data: r } = await fn();
      await charger();
      Alert.alert('Enregistre', r.message);
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    } finally {
      setAction(null);
    }
  };

  const voirDetail = async (vote) => {
    try {
      const { data: d } = await detailVote(vote.id);
      const dep = d.depouillement;
      Alert.alert(
        SUJETS[vote.sujet] || vote.sujet,
        [
          vote.description || '',
          '',
          `${MODES[vote.mode]}`,
          `Pour : ${dep.pour}   Contre : ${dep.contre}   Abstentions : ${dep.abstentions}`,
          `Electeurs : ${dep.electeurs}`,
          `Resultat : ${dep.resultat}`,
        ].join('\n')
      );
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    }
  };

  const nouveauVote = () => {
    if (!groupe) return;
    const membres = (groupe.groupe.membres || []).filter((m) => m.statut === 'actif');
    Alert.alert('Ouvrir un scrutin', 'Sur quel sujet ?', [
      {
        text: 'Exclure un membre',
        onPress: () =>
          Alert.alert(
            'Exclure qui ?',
            'Le membre vise ne prend pas part au vote.',
            [
              ...membres.slice(0, 4).map((m) => ({
                text: m.client?.nom || `Membre ${m.clientId}`,
                onPress: () =>
                  envoyer(
                    () => creerVote(groupeId, { sujet: 'exclure', cibleId: m.clientId, mode: 'majorite' }),
                    'nouveau'
                  ),
              })),
              { text: 'Annuler', style: 'cancel' },
            ]
          ),
      },
      {
        text: 'Dissoudre la tontine',
        onPress: () => envoyer(() => creerVote(groupeId, { sujet: 'dissoudre', mode: 'unanimite' }), 'nouveau'),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  if (!data) return <Chargement />;

  const estBureau = groupe && ['president', 'secretaire'].includes(groupe.monRole);

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Votes et decisions</Text>
        <Text style={s.sousTitre}>
          {data.enCours} scrutin{data.enCours > 1 ? 's' : ''} en cours
        </Text>

        <Info texte="Un scrutin adopte s'applique reellement : l'exclusion retire le membre et resserre les tours, une modification de regle change le groupe, un credit approuve devient decaissable." />

        {data.votes.length === 0 ? (
          <Vide icone="gavel" texte={"Aucun scrutin.\nLe groupe n'a encore rien mis aux voix."} />
        ) : (
          data.votes.map((v) => (
            <TouchableOpacity key={v.id} style={s.carte} activeOpacity={0.85} onPress={() => voirDetail(v)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[s.carteTitre, { flex: 1, paddingRight: 10 }]}>{SUJETS[v.sujet] || v.sujet}</Text>
                <Pastille statut={v.resultat} />
              </View>

              {v.description ? <Text style={s.carteInfo}>{v.description}</Text> : null}
              <Text style={s.carteInfo}>
                {MODES[v.mode]} · ouvert par {v.auteur?.nom || '—'} · cloture le {dateCourte(v.dateLimite)}
              </Text>

              {v.resultat === 'en_attente' && (
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Bouton titre="Voter" icone="edit" charge={action === v.id} onPress={() => voter(v)} />
                  </View>
                  {estBureau && (
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Bouton
                        titre="Depouiller"
                        variante="secondaire"
                        charge={action === v.id}
                        onPress={() => envoyer(() => depouillerVote(v.id), v.id)}
                      />
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        <Bouton titre="Ouvrir un scrutin" icone="plus-circle" onPress={nouveauVote} />
      </ScrollView>
    </SafeAreaView>
  );
}

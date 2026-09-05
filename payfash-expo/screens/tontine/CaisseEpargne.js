import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../../theme';
import s from './styleTontine';
import { Pastille, Ligne, Bouton, Chargement, Info, Alerte, Stat } from './composants';
import {
  etatEpargne, apporterEpargne, creditsGroupe, simulationPartage, cloturerExercice,
  messageErreur, fcfa,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

export default function CaisseEpargne() {
  const navigation = useNavigation();
  const { groupeId } = useRoute().params;
  const { apresMouvement } = useTontine();

  const [etat, setEtat] = useState(null);
  const [credits, setCredits] = useState([]);
  const [simulation, setSimulation] = useState(null);
  const [montant, setMontant] = useState('');
  const [action, setAction] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([etatEpargne(groupeId), creditsGroupe(groupeId)]);
      setEtat(e.data);
      setCredits(c.data.demandes || []);
      try {
        const { data: sim } = await simulationPartage(groupeId);
        setSimulation(sim);
      } catch { setSimulation(null); }
    } catch (err) {
      Alert.alert('Chargement impossible', messageErreur(err));
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const apporter = async () => {
    const m = parseFloat(montant) || 0;
    if (!(m > 0)) return Alert.alert('Montant invalide', 'Indiquez le montant a deposer.');
    try {
      setAction(true);
      const { data } = await apporterEpargne(groupeId, m);
      await apresMouvement();
      await charger();
      setMontant('');
      Alert.alert('Apport enregistre', data.message);
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    } finally {
      setAction(false);
    }
  };

  const cloturer = () => {
    Alert.alert(
      "Clore l'exercice",
      `La caisse sera entierement repartie : chacun reprend son apport, et le produit de l'annee se partage au prorata. ${simulation ? `\n\nA repartir : ${fcfa(simulation.soldeCaisse)}\nDont produit : ${fcfa(simulation.produit)}` : ''}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Clore',
          onPress: async () => {
            try {
              setAction(true);
              const { data } = await cloturerExercice(groupeId, new Date().getFullYear());
              await apresMouvement();
              await charger();
              navigation.navigate('SuccesTontine', {
                titre: 'Exercice cloture',
                montant: fcfa(data.totalDistribue),
                message: data.message,
                groupeId,
              });
            } catch (e) {
              Alert.alert('Cloture impossible', messageErreur(e));
            } finally {
              setAction(false);
            }
          },
        },
      ]
    );
  };

  if (!etat) return <Chargement />;

  const c = etat.composition;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Caisse d'epargne</Text>
        <Text style={s.sousTitre}>Elle prete aux membres, et se partage en fin d'exercice</Text>

        <LinearGradient colors={gradients.epargne} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 20, marginBottom: 16 }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>
            CAISSE DU GROUPE
          </Text>
          <Text style={{ color: colors.white, fontSize: 30, fontWeight: 'bold', marginTop: 6 }}>
            {fcfa(etat.soldeCaisse)}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 4 }}>
            Votre apport : {fcfa(etat.monApport)}
          </Text>
        </LinearGradient>

        <Text style={s.section}>Composition</Text>
        <View style={s.carte}>
          <Ligne label="Apports des membres" valeur={fcfa(c.apports)} />
          <Ligne label="Interets des credits" valeur={fcfa(c.interets)} couleur={colors.success} />
          <Ligne label="Amendes reversees" valeur={fcfa(c.amendes)} couleur={colors.warning} />
          <Ligne label="Engage en credits" valeur={fcfa(c.engage)} couleur={colors.accent} />
          <Ligne label="Disponible a preter" valeur={fcfa(c.disponible)} dernier />
        </View>

        <Text style={s.label}>Deposer a la caisse (FCFA)</Text>
        <TextInput
          style={s.champ}
          value={montant}
          onChangeText={setMontant}
          keyboardType="numeric"
          placeholder="10000"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={s.aide}>
          Votre apport determine votre part du produit lors de la casse annuelle. Il vous est rendu integralement a la
          cloture.
        </Text>
        <Bouton titre="Deposer" icone="plus" onPress={apporter} charge={action} />

        <Text style={s.section}>Repartition des parts</Text>
        <View style={s.carte}>
          {etat.membres.map((m, i) => (
            <Ligne
              key={m.clientId}
              label={`${m.nom}  ·  ${m.quotePart} %`}
              valeur={`${fcfa(m.apports)}  (+${fcfa(m.gainEstime)})`}
              dernier={i === etat.membres.length - 1}
            />
          ))}
        </View>

        <Text style={s.section}>Credits du groupe</Text>
        {credits.length === 0 ? (
          <Info texte="Aucune demande de credit pour le moment." />
        ) : (
          credits.map((d) => (
            <TouchableOpacity
              key={d.id}
              style={s.carte}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('RemboursementCredit', { demandeId: d.id, groupeId })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[s.carteTitre, { flex: 1, paddingRight: 10 }]}>
                  {d.emprunteur?.nom || 'Membre'}
                </Text>
                <Pastille statut={d.statut} />
              </View>
              <Text style={s.carteMontant}>{fcfa(d.montant)}</Text>
              <Text style={s.carteInfo}>
                {d.dureeMois} mois a {Number(d.tauxInteret)} %/mois · a rembourser {fcfa(d.totalARembourser)}
              </Text>
            </TouchableOpacity>
          ))
        )}

        <Bouton
          titre="Demander un credit"
          icone="creditcard"
          variante="secondaire"
          onPress={() => navigation.navigate('DemanderCredit', { groupeId, disponible: c.disponible })}
        />

        <Text style={s.section}>Casse annuelle</Text>
        {simulation && !simulation.cloturePossible ? (
          <Alerte titre="Cloture impossible pour l'instant" texte={simulation.bloquants.join(' ; ')} />
        ) : (
          <Info texte={`Tout est rentre : la caisse peut etre partagee. ${simulation ? `${fcfa(simulation.produit)} de produit a repartir au prorata des apports.` : ''}`} />
        )}
        <Bouton
          titre="Clore l'exercice et partager"
          icone="gift"
          variante="success"
          inactif={!simulation?.cloturePossible || etat.soldeCaisse <= 0}
          charge={action}
          onPress={cloturer}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

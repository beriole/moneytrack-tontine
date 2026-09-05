import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Chargement, Info, Progression, Ligne } from './composants';
import {
  cotisationsCycle, etatRecouvrement, saisirCaution, appelerGarant,
  messageErreur, fcfa, dateCourte,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

// Qui a paye, qui doit — et, pour le bureau, les crans de recours
// actionnables sur chaque retardataire.
export default function CotisationsCycle() {
  const navigation = useNavigation();
  const { cycleId, groupeId } = useRoute().params;
  const { apresMouvement } = useTontine();

  const [etat, setEtat] = useState(null);
  const [action, setAction] = useState(null);

  const charger = useCallback(async () => {
    try {
      const { data } = await cotisationsCycle(cycleId);
      setEtat(data);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    }
  }, [cycleId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const ouvrirRecouvrement = async (cotisation) => {
    try {
      setAction(cotisation.id);
      const { data } = await etatRecouvrement(cotisation.id);
      const c = data.crans;

      const options = [];
      if (c.cautionDisponible > 0) {
        options.push({
          text: `Saisir la caution (${fcfa(c.cautionDisponible)})`,
          onPress: () => executer(() => saisirCaution(cotisation.id)),
        });
      }
      if (c.garant) {
        options.push({
          text: `Appeler le garant (${c.garant.nom})`,
          onPress: () => executer(() => appelerGarant(cotisation.id)),
        });
      }
      options.push({ text: 'Fermer', style: 'cancel' });

      const lignes = [
        `Reste du : ${fcfa(data.resteADevoir)}`,
        c.amendeLevee ? `Amende de retard : ${c.amendeStatut}` : 'Aucune amende levee',
        c.cautionDisponible > 0 ? `Caution disponible : ${fcfa(c.cautionDisponible)}` : 'Caution epuisee ou absente',
        c.garant ? `Garant : ${c.garant.nom}` : 'Aucun garant designe',
      ];
      Alert.alert(
        `Recouvrement — ${cotisation.client?.nom || 'membre'}`,
        lignes.join('\n'),
        options
      );
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    } finally {
      setAction(null);
    }
  };

  const executer = async (fn) => {
    try {
      const { data } = await fn();
      await apresMouvement();
      await charger();
      Alert.alert('Fait', data.message);
    } catch (e) {
      Alert.alert('Operation impossible', messageErreur(e));
    }
  };

  if (!etat) return <Chargement />;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Cotisations</Text>
        <Text style={s.sousTitre}>Cycle {etat.cycle.numeroCycle} · echeance {dateCourte(etat.cycle.dateFinPrevue)}</Text>

        <View style={s.carte}>
          <Ligne label="Pot attendu" valeur={fcfa(etat.attendu)} />
          <Ligne label="Collecte" valeur={fcfa(etat.collecte)} couleur={colors.success} />
          <Ligne
            label="Avancement"
            valeur={etat.avancement}
            couleur={etat.potComplet ? colors.success : colors.warning}
            dernier
          />
          <Progression valeur={Number(etat.collecte)} total={Number(etat.attendu)} />
        </View>

        {etat.potComplet ? (
          <Info texte="Le pot est complet : le president ou le tresorier peut declencher le versement." />
        ) : (
          <Info texte="Le versement reste bloque tant qu'une cotisation n'est pas soldee. Touchez un retardataire pour voir les recours disponibles : caution, garant." />
        )}

        {etat.cotisations.map((c) => {
          const reste = Number(c.montantDu) - Number(c.montantPaye);
          const enRetard = c.statut !== 'payee';
          return (
            <TouchableOpacity
              key={c.id}
              style={s.carte}
              activeOpacity={enRetard ? 0.8 : 1}
              onPress={() => enRetard && ouvrirRecouvrement(c)}
              disabled={!enRetard || action === c.id}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ color: colors.white, fontSize: 15, fontWeight: '600' }}>
                    {c.client?.nom || `Membre ${c.clientId}`}
                  </Text>
                  <Text style={s.carteInfo}>
                    {fcfa(c.montantPaye)} verses sur {fcfa(c.montantDu)}
                    {enRetard ? `  ·  reste ${fcfa(reste)}` : ''}
                  </Text>
                </View>
                <Pastille statut={c.statut} />
              </View>

              {enRetard && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <MaterialCommunityIcons name="gesture-tap" size={14} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontSize: 12, marginLeft: 6 }}>
                    Voir les recours
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

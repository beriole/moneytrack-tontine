import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Ligne, Bouton, Chargement, Info, Progression } from './composants';
import {
  echeancierCredit, rembourserEcheance, decaisserCredit, detailGroupe,
  messageErreur, fcfa, dateCourte,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

export default function RemboursementCredit() {
  const navigation = useNavigation();
  const { demandeId, groupeId } = useRoute().params;
  const { apresMouvement } = useTontine();

  const [data, setData] = useState(null);
  const [role, setRole] = useState(null);
  const [action, setAction] = useState(null);

  const charger = useCallback(async () => {
    try {
      const [e, g] = await Promise.all([echeancierCredit(demandeId), detailGroupe(groupeId)]);
      setData(e.data);
      setRole(g.data.monRole);
    } catch (err) {
      Alert.alert('Chargement impossible', messageErreur(err));
    }
  }, [demandeId, groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const executer = async (fn, id, titre) => {
    try {
      setAction(id);
      const { data: r } = await fn();
      await apresMouvement();
      await charger();
      Alert.alert(titre, r.message);
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    } finally {
      setAction(null);
    }
  };

  if (!data) return <Chargement />;

  const d = data.demande;
  const estBureau = ['president', 'tresorier'].includes(role);

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={[s.titre, { flex: 1, paddingRight: 10 }]}>Credit</Text>
          <Pastille statut={d.statut} />
        </View>
        <Text style={s.sousTitre}>{d.motif || 'Sans motif precise'}</Text>

        <View style={s.carte}>
          <Ligne label="Capital emprunte" valeur={fcfa(d.montant)} />
          <Ligne label="Taux" valeur={`${Number(d.tauxInteret)} % par mois`} />
          <Ligne label="Duree" valeur={`${d.dureeMois} mois`} />
          <Ligne label="Total a rembourser" valeur={fcfa(data.totalARembourser)} couleur={colors.accent} />
          <Ligne label="Deja rembourse" valeur={fcfa(data.dejaRembourse)} couleur={colors.success} />
          <Ligne label="Reste a devoir" valeur={fcfa(data.resteADevoir)} dernier />
          <Progression valeur={Number(data.dejaRembourse)} total={Number(data.totalARembourser)} />
        </View>

        {d.statut === 'en_attente' && (
          <Info texte="La demande est soumise au vote du groupe. Le decaissement n'est possible qu'une fois le scrutin adopte." />
        )}

        {d.statut === 'approuvee' && estBureau && (
          <Bouton
            titre={`Decaisser ${fcfa(d.montant)}`}
            icone="download"
            variante="success"
            charge={action === 'dec'}
            onPress={() => executer(() => decaisserCredit(demandeId), 'dec', 'Credit decaisse')}
          />
        )}
        {d.statut === 'approuvee' && !estBureau && (
          <Info texte="Credit approuve par le groupe. Le tresorier doit maintenant le decaisser." />
        )}

        {data.echeances.length > 0 && (
          <>
            <Text style={s.section}>Echeancier</Text>
            {data.echeances.map((e) => {
              const reste = Number(e.montantDu) - Number(e.montantPaye);
              return (
                <View key={e.id} style={s.carte}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={s.carteTitre}>
                      Echeance {e.numeroEcheance} / {d.dureeMois}
                    </Text>
                    <Pastille statut={e.statut} />
                  </View>
                  <Text style={s.carteMontant}>{fcfa(e.montantDu)}</Text>
                  <Text style={s.carteInfo}>
                    dont {fcfa(e.partCapital)} de capital et {fcfa(e.partInteret)} d'interets
                  </Text>
                  <Text style={s.carteInfo}>Echeance du {dateCourte(e.dateEcheance)}</Text>

                  {e.statut !== 'paye' && (
                    <Bouton
                      titre={`Rembourser ${fcfa(reste)}`}
                      icone="wallet"
                      charge={action === e.id}
                      onPress={() => executer(() => rembourserEcheance(e.id), e.id, 'Echeance reglee')}
                    />
                  )}
                </View>
              );
            })}
            <Info texte="Le capital rembourse redevient pretable, et les interets grossissent le produit partage entre tous a la fin de l'exercice." />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

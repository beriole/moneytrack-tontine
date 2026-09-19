import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Chargement, Vide, Info, Stat, Ligne, Progression } from './composants';
import {
  mesGaranties, detailGarantie, libererGarantie, messageErreur, fcfa, dateCourte,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

// =====================================================================
//  Mes garanties — pourquoi mon argent est bloque.
//
//  Une garantie est une part de l'epargne, d'un projet ou du portefeuille
//  d'un membre, bloquee pour couvrir ses cotisations futures dans une
//  tontine. L'argent reste chez lui ; il ne peut simplement plus le
//  depenser. Cet ecran doit dire, sans jargon : combien est bloque, ou,
//  pour quelle tontine, ce qui a deja servi, et quand le reste reviendra.
// =====================================================================

const TYPES = {
  EPARGNE: { icone: 'piggy-bank', libelle: 'Epargne' },
  PROJET: { icone: 'hammer-wrench', libelle: 'Projet' },
  PORTEFEUILLE: { icone: 'wallet', libelle: 'Portefeuille' },
};

const STATUTS = {
  active: { libelle: 'Bloquee', couleur: colors.accent },
  partiellement_utilisee: { libelle: 'En partie utilisee', couleur: colors.warning },
  utilisee: { libelle: 'Entierement utilisee', couleur: colors.danger },
  liberee: { libelle: 'Rendue', couleur: colors.success },
  annulee: { libelle: 'Annulee', couleur: colors.textMuted },
};

const SENS = {
  blocage: 'Bloque',
  mobilisation: 'Preleve pour une cotisation impayee',
  liberation: 'Rendu a votre disponible',
};

export default function MesGaranties() {
  const navigation = useNavigation();
  const { apresMouvement } = useTontine();
  const [data, setData] = useState(null);
  const [action, setAction] = useState(null);

  const charger = useCallback(async () => {
    try {
      const { data: d } = await mesGaranties();
      setData(d);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const voirDetail = async (g) => {
    try {
      const { data: d } = await detailGarantie(g.id);
      const historique = (d.mouvements || [])
        .map((m) => `${dateCourte(m.date)} — ${SENS[m.sens] || m.sens} : ${fcfa(m.montant)}${m.motif ? `\n   ${m.motif}` : ''}`)
        .join('\n');
      Alert.alert(
        `Garantie — ${fcfa(d.montantInitial)}`,
        `${historique}\n\n— Ce que vous avez accepte —\n${d.consentement ? d.consentement.texte : 'texte indisponible'}`
      );
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    }
  };

  const liberer = (g) => {
    Alert.alert(
      'Recuperer cette garantie',
      `${fcfa(g.restant)} redeviendront disponibles sur votre ${TYPES[g.type]?.libelle.toLowerCase() || 'portefeuille'}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Recuperer',
          onPress: async () => {
            try {
              setAction(g.id);
              const { data: r } = await libererGarantie(g.id);
              await apresMouvement();
              await charger();
              Alert.alert('Garantie rendue', r.message);
            } catch (e) {
              Alert.alert('Pas encore', messageErreur(e));
            } finally {
              setAction(null);
            }
          },
        },
      ]
    );
  };

  if (!data) return <Chargement />;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Mes garanties</Text>
        <Text style={s.sousTitre}>L'argent que vous avez mis en garantie de vos cotisations</Text>

        <View style={s.stats}>
          <Stat label="Bloque en garantie" valeur={fcfa(data.totalBloque)} />
          <Stat label="Tontines" valeur={`${data.groupes.length}`} />
        </View>

        {data.groupes.length === 0 ? (
          <Vide
            icone="shield-check-outline"
            texte={"Aucune garantie.\nDepuis une tontine, vous pouvez bloquer une part de votre epargne pour couvrir vos cotisations futures."}
          />
        ) : (
          data.groupes.map((bloc) => (
            <View key={bloc.groupeId} style={{ marginBottom: 10 }}>
              <Text style={s.section}>{bloc.nom}</Text>

              {bloc.exposition !== null && bloc.exposition !== undefined && (
                <View style={s.carte}>
                  <Ligne label="Il vous reste a cotiser" valeur={fcfa(bloc.exposition)} />
                  <Ligne label="Caution" valeur={fcfa(bloc.caution)} />
                  <Ligne label="Garanties bloquees" valeur={fcfa(bloc.bloque)} />
                  <Ligne
                    label="Couverture"
                    valeur={`${bloc.couverture} %`}
                    couleur={bloc.couverture >= 100 ? colors.success : colors.warning}
                    dernier
                  />
                  <Progression valeur={bloc.couvert} total={bloc.exposition} />
                  {bloc.tauxExige > 0 && (
                    <Text style={[s.aide, { color: bloc.suffisant ? colors.success : colors.warning }]}>
                      {bloc.suffisant
                        ? `Le reglement exige ${bloc.tauxExige} % : vous etes en regle.`
                        : `Le reglement exige ${bloc.tauxExige} % (${fcfa(bloc.montantExige)}) : il manque ${fcfa(bloc.manqueExige)}, sans quoi votre pot sera suspendu.`}
                    </Text>
                  )}
                  {bloc.manque > 0 && bloc.statutGroupe !== 'termine' && (
                    <Bouton
                      titre={`Completer la couverture (${fcfa(bloc.manque)})`}
                      icone="shield-plus-outline"
                      variante="secondaire"
                      onPress={() => navigation.navigate('AffecterGarantie', { groupeId: bloc.groupeId, montant: bloc.manque })}
                    />
                  )}
                </View>
              )}

              {bloc.garanties.map((g) => {
                const type = TYPES[g.type] || TYPES.PORTEFEUILLE;
                const statut = STATUTS[g.statut] || { libelle: g.statut, couleur: colors.textMuted };
                const rendable = g.restant > 0 && bloc.statutGroupe === 'termine';
                return (
                  <TouchableOpacity key={g.id} style={s.carte} onPress={() => voirDetail(g)} activeOpacity={0.85}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <MaterialCommunityIcons name={type.icone} size={18} color={colors.accent} />
                        <Text style={[s.carteTitre, { marginBottom: 0, marginLeft: 8, flexShrink: 1 }]}>
                          {type.libelle}{g.source ? ` · ${g.source}` : ''}
                        </Text>
                      </View>
                      <Text style={{ color: statut.couleur, fontSize: 12, fontWeight: '600' }}>{statut.libelle}</Text>
                    </View>

                    <Text style={[s.carteMontant, { marginTop: 10 }]}>{fcfa(g.restant)} encore bloques</Text>
                    <Text style={s.carteInfo}>
                      {fcfa(g.montantInitial)} affectes le {dateCourte(g.affecteeLe)}
                      {g.montantUtilise > 0 ? ` · ${fcfa(g.montantUtilise)} preleves` : ''}
                      {g.montantLibere > 0 ? ` · ${fcfa(g.montantLibere)} rendus` : ''}
                    </Text>
                    <Text style={[s.carteInfo, { fontSize: 12 }]}>Touchez pour l'historique et le texte accepte</Text>

                    {rendable && (
                      <Bouton
                        titre={`Recuperer ${fcfa(g.restant)}`}
                        icone="lock-open-variant-outline"
                        charge={action === g.id}
                        onPress={() => liberer(g)}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}

        <Info texte="Une garantie ne quitte pas votre compte : elle cesse seulement d'etre depensable. Si une cotisation reste impayee a l'echeance, seul le montant manquant y est preleve. Le reste vous revient a la fin de la rotation." />
      </ScrollView>
    </SafeAreaView>
  );
}

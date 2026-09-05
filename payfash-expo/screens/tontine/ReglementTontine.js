import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s, { carteHaute } from './styleTontine';
import { Pastille, Bouton, Chargement, Info, Vide } from './composants';
import {
  reglementCourant, genererReglement, signerReglement, detailGroupe,
  messageErreur, dateCourte,
} from '../../utils/tontineApi';

// Le reglement interieur : ce sur quoi les membres s'engagent, hache et
// signe nominativement. C'est la piece qui tranche un litige.
export default function ReglementTontine() {
  const navigation = useNavigation();
  const { groupeId } = useRoute().params;

  const [data, setData] = useState(null);
  const [absent, setAbsent] = useState(false);
  const [role, setRole] = useState(null);
  const [action, setAction] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { data: g } = await detailGroupe(groupeId);
      setRole(g.monRole);
      const { data: d } = await reglementCourant(groupeId);
      setData(d);
      setAbsent(false);
    } catch (e) {
      if (e?.response?.status === 404) { setAbsent(true); setData(null); }
      else Alert.alert('Chargement impossible', messageErreur(e));
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const executer = async (fn, titre) => {
    try {
      setAction(true);
      const { data: r } = await fn();
      await charger();
      Alert.alert(titre, r.message);
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    } finally {
      setAction(false);
    }
  };

  if (!data && !absent) return <Chargement />;

  const peutRediger = ['president', 'secretaire'].includes(role);

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Reglement interieur</Text>

        {absent ? (
          <>
            <Vide
              icone="file-document-outline"
              texte={"Ce groupe n'a pas encore de reglement.\nLe president peut en generer un a partir des regles reelles du groupe."}
            />
            {peutRediger && (
              <Bouton
                titre="Generer le reglement"
                icone="filetext1"
                charge={action}
                onPress={() => executer(() => genererReglement(groupeId), 'Reglement genere')}
              />
            )}
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Pastille statut={data.contrat.statut === 'signe' ? 'payee' : 'attendue'} />
              <Text style={{ color: colors.textMuted, fontSize: 13, marginLeft: 10 }}>
                Version {data.contrat.version} · {data.avancement} signatures
              </Text>
            </View>

            <View style={[s.carte, { backgroundColor: carteHaute }]}>
              <Text style={{ color: colors.white, fontSize: 13, lineHeight: 21 }}>{data.contrat.contenu}</Text>
            </View>

            <View style={s.carte}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="fingerprint" size={16} color={colors.accent} />
                <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 8, flex: 1 }}>
                  Empreinte SHA-256
                </Text>
              </View>
              <Text selectable style={{ color: colors.white, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                {data.contrat.hashContenu}
              </Text>
              <Text style={s.carteInfo}>
                Genere le {dateCourte(data.contrat.dateGeneration)}
                {data.contrat.dateSignatureComplete ? ` · signe le ${dateCourte(data.contrat.dateSignatureComplete)}` : ''}
              </Text>
            </View>

            <Text style={s.section}>Signataires</Text>
            <View style={s.carte}>
              {data.contrat.signatures.map((sig, i) => (
                <View key={sig.id} style={[s.ligne, i < data.contrat.signatures.length - 1 && s.ligneSeparee]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <AntDesign name="check-circle" size={15} color={colors.success} />
                    <Text style={{ color: colors.white, fontSize: 14, marginLeft: 10 }}>
                      {sig.signataire?.nom || 'Membre'}
                    </Text>
                  </View>
                  <Text style={s.ligneLabel}>{dateCourte(sig.signeLe)}</Text>
                </View>
              ))}
              {data.manquants.map((m, i) => (
                <View key={m.clientId} style={[s.ligne, i < data.manquants.length - 1 && s.ligneSeparee]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <AntDesign name="clock-circle" size={14} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 14, marginLeft: 10 }}>{m.nom}</Text>
                  </View>
                  <Text style={s.ligneLabel}>en attente</Text>
                </View>
              ))}
            </View>

            <Info texte="Modifier le texte produit une nouvelle version a faire resigner : on ne change pas les regles sous des signatures deja recueillies." />

            <Bouton
              titre="Signer le reglement"
              icone="edit"
              charge={action}
              onPress={() =>
                Alert.alert('Signer', 'Vous vous engagez sur ce texte. Votre signature est horodatee et nominative.', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Signer', onPress: () => executer(() => signerReglement(data.contrat.id), 'Signature enregistree') },
                ])
              }
            />
            {peutRediger && (
              <Bouton
                titre="Regenerer depuis les regles du groupe"
                variante="secondaire"
                charge={action}
                onPress={() => executer(() => genererReglement(groupeId), 'Reglement mis a jour')}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

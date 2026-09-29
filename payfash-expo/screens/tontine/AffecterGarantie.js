import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Chargement, Info, Ligne, Segments, Alerte } from './composants';
import {
  expositionGroupe, sourcesGarantie, simulerGarantie, affecterGarantie, messageErreur, fcfa,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

// =====================================================================
//  Affecter une garantie.
//
//  Trois temps, et l'ordre compte :
//    1. choisir d'ou vient l'argent, et combien ;
//    2. LIRE le texte qui dit ce que cela implique ;
//    3. accepter ce texte-la.
//
//  Le bouton d'acceptation n'existe qu'une fois le texte affiche, et il
//  renvoie l'empreinte de ce texte precis : si le montant ou la source
//  change apres coup, il faut relire. Rien n'est bloque sans cela.
// =====================================================================

export default function AffecterGarantie() {
  const navigation = useNavigation();
  const { groupeId, montant: suggere } = useRoute().params;
  const { apresMouvement } = useTontine();

  const [exposition, setExposition] = useState(null);
  const [sources, setSources] = useState(null);
  const [source, setSource] = useState(null);
  const [montant, setMontant] = useState(suggere ? String(Math.round(suggere)) : '');
  const [apercu, setApercu] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [e, sr] = await Promise.all([expositionGroupe(groupeId), sourcesGarantie(groupeId)]);
      setExposition(e.data);
      const liste = sr.data.sources;
      setSources(liste);
      // Par defaut, la source qui a le plus de disponible : l'epargne en general.
      const meilleure = [...liste].sort((a, b) => b.disponible - a.disponible)[0];
      if (meilleure && !source) setSource(meilleure.portefeuilleId);
    } catch (err) {
      Alert.alert('Chargement impossible', messageErreur(err));
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  // Toute modification invalide le texte deja lu.
  const changerSource = (v) => { setSource(v); setApercu(null); };
  const changerMontant = (v) => { setMontant(v.replace(/[^0-9]/g, '')); setApercu(null); };

  const lire = async () => {
    const m = parseInt(montant, 10);
    if (!(m > 0)) return Alert.alert('Montant', 'Indiquez le montant a bloquer.');
    try {
      setEnvoi(true);
      const { data } = await simulerGarantie(groupeId, source, m);
      setApercu(data);
    } catch (err) {
      Alert.alert('Impossible', messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const accepter = async () => {
    try {
      setEnvoi(true);
      const { data } = await affecterGarantie(groupeId, source, apercu.montant, apercu.hashTexte);
      await apresMouvement();
      Alert.alert('Garantie en place', data.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      setApercu(null);
      Alert.alert('Garantie refusee', messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  if (!exposition || !sources) return <Chargement />;

  const choix = sources.map((x) => ({
    valeur: x.portefeuilleId,
    libelle: `${x.nom} · ${fcfa(x.disponible)}`,
  }));
  const selection = sources.find((x) => x.portefeuilleId === source);

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Garantir mes cotisations</Text>
        <Text style={s.sousTitre}>{exposition.explication}</Text>

        <View style={s.carte}>
          <Ligne label={exposition.potentielle ? 'Engagement maximal' : 'Il vous reste a cotiser'} valeur={fcfa(exposition.exposition)} dernier />
        </View>

        <Text style={s.label}>D'ou vient l'argent ?</Text>
        <Segments options={choix} valeur={source} onChange={changerSource} />
        {selection && selection.bloque > 0 && (
          <Text style={s.aide}>{fcfa(selection.bloque)} y sont deja bloques.</Text>
        )}

        <Text style={s.label}>Montant a bloquer (FCFA)</Text>
        <TextInput
          style={s.champ}
          value={montant}
          onChangeText={changerMontant}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={s.aide}>
          L'argent reste sur votre compte. Il n'est preleve que si une cotisation reste impayee, et seulement le
          montant manquant.
        </Text>

        {!apercu && (
          <Bouton titre="Lire les conditions" icone="file-text" charge={envoi} onPress={lire} />
        )}

        {apercu && (
          <>
            {!apercu.possible && <Alerte titre="Montant indisponible" texte={apercu.raison} />}

            <Text style={s.section}>Ce que vous acceptez</Text>
            <View style={[s.carte, { borderWidth: 1, borderColor: colors.accent }]}>
              <Text style={{ color: colors.white, fontSize: 13, lineHeight: 20 }}>{apercu.texte}</Text>
            </View>

            <View style={s.carte}>
              {apercu.tauxExige > 0 && (
                <Ligne
                  label={`Exige par le reglement (${apercu.tauxExige} %)`}
                  valeur={apercu.manqueApres > 0 ? `il manquera ${fcfa(apercu.manqueApres)}` : 'atteint'}
                  couleur={apercu.manqueApres > 0 ? colors.warning : colors.success}
                />
              )}
              <Ligne label="Couverture actuelle" valeur={`${apercu.couvertureAvant} %`} />
              <Ligne
                label="Apres cette garantie"
                valeur={`${apercu.couvertureApres} %`}
                couleur={apercu.couvertureApres >= 100 ? colors.success : colors.warning}
                dernier
              />
            </View>

            <Bouton
              titre={`J'accepte et je bloque ${fcfa(apercu.montant)}`}
              icone="safety"
              variante="success"
              inactif={!apercu.possible}
              charge={envoi}
              onPress={accepter}
            />
          </>
        )}

        <Info texte="Vous retrouvez a tout moment vos garanties, ce qui en a ete preleve et le texte accepte, dans « Mes garanties »." />
      </ScrollView>
    </SafeAreaView>
  );
}

import React, { useState, useEffect, useContext } from 'react';
import { View, Text, SafeAreaView, ScrollView, TextInput, Alert, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Ligne, Chargement, Info, Alerte } from './composants';
import { cotisationsCycle, cotiser, messageErreur, fcfa, dateCourte } from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';
import { WalletContext } from '../../utils/WalletContext';

export default function Cotiser() {
  const navigation = useNavigation();
  const { cycleId, groupeId } = useRoute().params;
  const { apresMouvement, amendesDues, totalAmendes, monId } = useTontine();
  const wallet = useContext(WalletContext);

  const [etat, setEtat] = useState(null);
  const [maLigne, setMaLigne] = useState(null);
  const [montant, setMontant] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await cotisationsCycle(cycleId);
        setEtat(data);
        // Ma ligne, identifiee par mon id client. Prendre la premiere
        // cotisation non soldee afficherait celle d'un autre retardataire.
        const mienne = data.cotisations.find((c) => c.clientId === monId && c.statut !== 'payee');
        setMaLigne(mienne || null);
        if (mienne) setMontant(String(Math.round(Number(mienne.montantDu) - Number(mienne.montantPaye))));
      } catch (e) {
        Alert.alert('Chargement impossible', messageErreur(e));
      }
    })();
  }, [cycleId, monId]);

  const valider = async () => {
    const m = parseFloat(montant) || 0;
    if (!(m > 0)) return Alert.alert('Montant invalide', 'Indiquez le montant a verser.');

    try {
      setEnvoi(true);
      const { data } = await cotiser(cycleId, m);
      await apresMouvement();
      navigation.replace('SuccesTontine', {
        titre: 'Cotisation enregistree',
        montant: fcfa(m),
        message: data.message,
        groupeId,
      });
    } catch (e) {
      Alert.alert('Cotisation impossible', messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  if (!etat) return <Chargement />;

  const reste = maLigne ? Number(maLigne.montantDu) - Number(maLigne.montantPaye) : 0;
  const solde = wallet?.totalSolde || 0;
  const insuffisant = (parseFloat(montant) || 0) > solde;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Cotiser</Text>
        <Text style={s.sousTitre}>Cycle {etat.cycle.numeroCycle}</Text>

        {amendesDues > 0 && (
          <Alerte
            titre="Amendes impayees"
            texte={`${fcfa(totalAmendes)} a regler avant de pouvoir cotiser. Le versement sera refuse tant que la dette est ouverte.`}
          />
        )}

        <View style={s.carte}>
          <Ligne label="Pot attendu" valeur={fcfa(etat.attendu)} />
          <Ligne label="Deja collecte" valeur={fcfa(etat.collecte)} couleur={colors.success} />
          <Ligne label="Avancement" valeur={etat.avancement} />
          <Ligne label="Echeance" valeur={dateCourte(etat.cycle.dateFinPrevue)} dernier />
        </View>

        {!maLigne ? (
          <Info texte="Vous n'avez aucune cotisation ouverte sur ce cycle. Si vous en etes le beneficiaire, c'est normal : on ne cotise pas pour son propre tour." />
        ) : (
          <>
            <Text style={s.label}>Montant a verser (FCFA)</Text>
            <TextInput
              style={s.champ}
              value={montant}
              onChangeText={setMontant}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={s.aide}>
              Reste du sur ce cycle : {fcfa(reste)}. Un versement partiel est accepte, la cotisation reste alors ouverte.
            </Text>

            <View style={[s.carte, { marginTop: 18 }]}>
              <Ligne label="Solde de votre portefeuille" valeur={fcfa(solde)} />
              <Ligne
                label="Apres cotisation"
                valeur={fcfa(solde - (parseFloat(montant) || 0))}
                couleur={insuffisant ? colors.danger : colors.white}
                dernier
              />
            </View>

            {insuffisant && (
              <TouchableOpacity onPress={() => navigation.navigate('Recharge')}>
                <Alerte titre="Solde insuffisant" texte="Touchez ici pour recharger votre portefeuille avant de cotiser." />
              </TouchableOpacity>
            )}

            <Bouton
              titre="Verser ma cotisation"
              icone="check"
              onPress={valider}
              charge={envoi}
              inactif={insuffisant || amendesDues > 0}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

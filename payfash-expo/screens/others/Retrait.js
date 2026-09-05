import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from '../tontine/styleTontine';
import { Bouton, Segments, Info, Ligne, Alerte } from '../tontine/composants';
import {
  initierRetrait, verifierPaiement, soldeReel, messageErreur, fcfa,
} from '../../utils/tontineApi';
import { WalletContext } from '../../utils/WalletContext';

// =====================================================================
//  Retrait vers Mobile Money.
//
//  L'ancienne route /wallet/withdraw diminuait le solde sans qu'aucun
//  argent ne sorte : l'utilisateur perdait son argent. Ici Fapshi verse
//  reellement sur le telephone.
//
//  Le montant retirable n'est pas le solde brut mais le solde DISPONIBLE :
//  retirer ce qui est deja promis a une cotisation, c'est se garantir une
//  amende la semaine suivante.
// =====================================================================

const OPERATEURS = [
  { valeur: 'mobile money', libelle: 'MTN MoMo' },
  { valeur: 'orange money', libelle: 'Orange Money' },
];

export default function Retrait() {
  const navigation = useNavigation();
  const wallet = useContext(WalletContext);

  const [montant, setMontant] = useState('');
  const [operateur, setOperateur] = useState('mobile money');
  const [telephone, setTelephone] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState(null);
  const [solde, setSolde] = useState(null);
  const minuterie = useRef(null);

  useEffect(() => {
    soldeReel().then(({ data }) => setSolde(data)).catch(() => setSolde(null));
    return () => { if (minuterie.current) clearInterval(minuterie.current); };
  }, []);

  const somme = parseInt(montant, 10) || 0;
  const brut = solde ? solde.brut : (wallet?.totalSolde || 0);
  const disponible = solde ? solde.disponible : brut;
  const depasse = somme > disponible;

  const lancer = async () => {
    if (somme < 100) return Alert.alert('Montant invalide', 'Le minimum est de 100 FCFA.');
    if (telephone.replace(/\D/g, '').length < 9) {
      return Alert.alert('Numéro requis', 'Saisissez le numéro qui recevra le montant.');
    }

    const confirmer = async () => {
      try {
        setEnvoi(true);
        const { data } = await initierRetrait({ montant: somme, telephone, medium: operateur });
        setAttente({ reference: data.reference, montant: somme });
        if (wallet?.fetchSolde) await wallet.fetchSolde();
        minuterie.current = setInterval(() => sonder(data.reference), 6000);
      } catch (e) {
        Alert.alert('Retrait impossible', messageErreur(e));
      } finally {
        setEnvoi(false);
      }
    };

    if (depasse) {
      Alert.alert(
        'Au-delà de votre disponible',
        `${fcfa(somme)} dépasse votre solde disponible de ${fcfa(disponible)}. Le reste est engagé dans vos cotisations à venir : le retirer vous exposerait à une amende.`,
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Retirer quand même', style: 'destructive', onPress: confirmer }]
      );
    } else {
      confirmer();
    }
  };

  const sonder = async (reference) => {
    try {
      const { data } = await verifierPaiement(reference);
      if (data.statut === 'SUCCESSFUL') {
        clearInterval(minuterie.current);
        setAttente(null);
        if (wallet?.fetchSolde) await wallet.fetchSolde();
        navigation.replace('SuccesTontine', {
          titre: 'Retrait effectué',
          montant: fcfa(data.montant),
          message: `Le montant a été envoyé sur ${telephone}.`,
        });
      } else if (['FAILED', 'EXPIRED', 'REFUNDED'].includes(data.statut)) {
        clearInterval(minuterie.current);
        setAttente(null);
        if (wallet?.fetchSolde) await wallet.fetchSolde();
        Alert.alert('Retrait non abouti', 'Votre solde vous a été restitué. Vous pouvez réessayer.');
      }
    } catch (e) { /* un sondage rate n'est pas un echec de retrait */ }
  };

  if (attente) {
    return (
      <SafeAreaView style={[s.page, { justifyContent: 'center', padding: 28 }]}>
        <View style={{ alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[s.titre, { textAlign: 'center', marginTop: 24 }]}>Retrait en cours</Text>
          <Text style={[s.sousTitre, { textAlign: 'center', lineHeight: 21 }]}>
            {fcfa(attente.montant)} en route vers {telephone}. Le montant a déjà été réservé sur votre solde ; si
            l'opérateur refuse, il vous est restitué automatiquement.
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 14 }}>
            Référence {attente.reference}
          </Text>
        </View>
        <View style={{ marginTop: 26 }}>
          <Bouton titre="Vérifier maintenant" icone="reload1" variante="secondaire"
            onPress={() => sonder(attente.reference)} />
          <TouchableOpacity onPress={() => { clearInterval(minuterie.current); setAttente(null); }}
            style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Retirer</Text>
        <Text style={s.sousTitre}>Vers votre compte Mobile Money</Text>

        <View style={s.carte}>
          <Ligne label="Solde total" valeur={fcfa(brut)} />
          {solde && <Ligne label="Engagé sous 30 jours" valeur={fcfa(solde.engage30j)} couleur={colors.warning} />}
          {solde && <Ligne label="Immobilisé (cautions)" valeur={fcfa(solde.immobilise)} couleur={colors.accent} />}
          <Ligne label="Retirable sans risque" valeur={fcfa(disponible)} couleur={colors.success} dernier />
        </View>

        <Text style={s.label}>Montant (FCFA)</Text>
        <TextInput
          style={[s.champ, { fontSize: 20, fontWeight: '700' }]}
          value={montant}
          onChangeText={setMontant}
          keyboardType="numeric"
          placeholder="5000"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity onPress={() => setMontant(String(Math.max(0, Math.floor(disponible))))}>
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600', marginTop: 8 }}>
            Retirer tout le disponible ({fcfa(disponible)})
          </Text>
        </TouchableOpacity>

        <Text style={s.label}>Opérateur</Text>
        <Segments options={OPERATEURS} valeur={operateur} onChange={setOperateur} />

        <Text style={s.label}>Numéro à créditer</Text>
        <TextInput
          style={s.champ}
          value={telephone}
          onChangeText={setTelephone}
          keyboardType="phone-pad"
          placeholder="670 00 00 00"
          placeholderTextColor={colors.textMuted}
        />

        {depasse && somme > 0 && (
          <Alerte
            titre="Au-delà de votre disponible"
            texte={`${fcfa(somme - disponible)} de plus que ce que vous pouvez retirer sans compromettre vos cotisations à venir.`}
          />
        )}

        <Info texte="Le montant est réservé sur votre solde puis envoyé à l'opérateur. En cas de refus, il vous est restitué automatiquement — vous ne perdez jamais votre argent." />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <MaterialCommunityIcons name="shield-check" size={15} color={colors.success} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 7, flex: 1 }}>
            Versement traité par Fapshi, agrégateur agréé.
          </Text>
        </View>

        <Bouton
          titre={`Retirer ${somme > 0 ? fcfa(somme) : ''}`.trim()}
          icone="upload"
          onPress={lancer}
          charge={envoi}
          inactif={somme < 100}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

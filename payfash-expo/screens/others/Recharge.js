import React, { useState, useRef, useEffect, useContext } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TextInput, TouchableOpacity,
  Alert, Linking, ActivityIndicator, AppState,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../../theme';
import s from '../tontine/styleTontine';
import { Bouton, Segments, Info, Ligne } from '../tontine/composants';
import {
  initierRecharge, verifierPaiement, etatPaiement,
  messageErreur, fcfa,
} from '../../utils/tontineApi';
import { WalletContext } from '../../utils/WalletContext';

// =====================================================================
//  Recharge du portefeuille — paiement reel via Fapshi.
//
//  L'ecran precedent appelait /wallet/deposit, qui creditait le solde
//  sans qu'aucun argent ne change de main : un simulacre. Ici l'argent
//  entre vraiment, et le solde ne bouge qu'une fois Fapshi confirme.
//
//  Deux chemins, selon ce qui marche chez l'utilisateur :
//    - Mobile Money direct : il valide sur son telephone ;
//    - page de paiement : on ouvre le lien Fapshi dans le navigateur.
//
//  Dans les deux cas, on interroge ensuite le serveur jusqu'a obtenir le
//  statut. C'est ce chemin qui credite en developpement, ou Fapshi ne
//  peut pas joindre une machine sur un reseau local.
// =====================================================================

const MONTANTS = [1000, 2000, 5000, 10000, 25000];
const METHODES = [
  { valeur: 'direct', libelle: 'Mobile Money' },
  { valeur: 'lien', libelle: 'Page de paiement' },
];
const OPERATEURS = [
  { valeur: 'mobile money', libelle: 'MTN MoMo' },
  { valeur: 'orange money', libelle: 'Orange Money' },
];

export default function Recharge() {
  const navigation = useNavigation();
  const wallet = useContext(WalletContext);

  const [montant, setMontant] = useState('');
  const [methode, setMethode] = useState('direct');
  const [operateur, setOperateur] = useState('mobile money');
  const [telephone, setTelephone] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState(null);   // { reference, lien }
  const [service, setService] = useState(null);

  const minuterie = useRef(null);
  const essais = useRef(0);

  useEffect(() => {
    etatPaiement().then(({ data }) => setService(data)).catch(() => setService({ disponible: false }));
    return () => { if (minuterie.current) clearInterval(minuterie.current); };
  }, []);

  // Au retour du navigateur, on verifie tout de suite : c'est en general
  // le moment ou le paiement vient d'aboutir.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active' && attente) sonder(attente.reference, true);
    });
    return () => abonnement.remove();
  }, [attente]);

  const somme = parseInt(montant, 10) || 0;

  const lancer = async () => {
    if (somme < 100) return Alert.alert('Montant invalide', 'Le minimum est de 100 FCFA.');
    if (methode === 'direct' && telephone.replace(/\D/g, '').length < 9) {
      return Alert.alert('Numéro requis', 'Saisissez le numéro Mobile Money à débiter.');
    }

    try {
      setEnvoi(true);
      const { data } = await initierRecharge({
        montant: somme,
        methode,
        medium: methode === 'direct' ? operateur : undefined,
        telephone: methode === 'direct' ? telephone : undefined,
      });

      setAttente({ reference: data.reference, lien: data.lien });
      essais.current = 0;

      if (data.lien) {
        const ouvrable = await Linking.canOpenURL(data.lien);
        if (ouvrable) await Linking.openURL(data.lien);
        else Alert.alert('Lien de paiement', data.lien);
      } else {
        Alert.alert('Validez sur votre téléphone', data.message);
      }
      demarrerSondage(data.reference);
    } catch (e) {
      Alert.alert('Recharge impossible', messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  const demarrerSondage = (reference) => {
    if (minuterie.current) clearInterval(minuterie.current);
    minuterie.current = setInterval(() => sonder(reference), 5000);
  };

  const sonder = async (reference, immediat = false) => {
    essais.current += 1;
    // Cinq minutes de sondage : au-dela, l'utilisateur a probablement
    // abandonne. Le paiement n'est pas perdu pour autant — la
    // reconciliation du serveur le rattrapera.
    if (essais.current > 60 && !immediat) {
      clearInterval(minuterie.current);
      setAttente(null);
      return;
    }

    try {
      const { data } = await verifierPaiement(reference);
      if (data.creedite || data.deja) {
        clearInterval(minuterie.current);
        setAttente(null);
        if (wallet?.fetchSolde) await wallet.fetchSolde();
        navigation.replace('SuccesRecharge', {
          montant: fcfa(data.montant || somme),
          reference,
        });
      } else if (['FAILED', 'EXPIRED'].includes(data.statut)) {
        clearInterval(minuterie.current);
        setAttente(null);
        Alert.alert(
          data.statut === 'EXPIRED' ? 'Paiement expiré' : 'Paiement refusé',
          "Aucun montant n'a été débité. Vous pouvez réessayer."
        );
      }
    } catch (e) {
      // Un sondage qui echoue n'est pas un echec de paiement : on retente.
    }
  };

  const annulerAttente = () => {
    if (minuterie.current) clearInterval(minuterie.current);
    setAttente(null);
  };

  // ---- Ecran d'attente ----
  if (attente) {
    return (
      <SafeAreaView style={[s.page, { justifyContent: 'center', padding: 28 }]}>
        <View style={{ alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[s.titre, { textAlign: 'center', marginTop: 24 }]}>Paiement en cours</Text>
          <Text style={[s.sousTitre, { textAlign: 'center', lineHeight: 21 }]}>
            {methode === 'direct'
              ? 'Validez la demande sur votre téléphone. Votre solde sera crédité dès confirmation.'
              : 'Terminez le paiement dans la page ouverte. Revenez ici ensuite : la vérification est automatique.'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 14 }}>
            Référence {attente.reference}
          </Text>
        </View>

        <View style={{ marginTop: 26 }}>
          {attente.lien ? (
            <Bouton titre="Rouvrir la page de paiement" icone="link" onPress={() => Linking.openURL(attente.lien)} />
          ) : null}
          <Bouton titre="Vérifier maintenant" icone="reload1" variante="secondaire"
            onPress={() => sonder(attente.reference, true)} />
          <TouchableOpacity onPress={annulerAttente} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Arrêter l'attente</Text>
          </TouchableOpacity>
        </View>

        <Info texte="Si vous quittez maintenant, un paiement déjà abouti sera rattrapé automatiquement par le serveur — rien n'est perdu." />
      </SafeAreaView>
    );
  }

  // ---- Formulaire ----
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Recharger</Text>
        <Text style={s.sousTitre}>Alimentez votre portefeuille par Mobile Money</Text>

        {service && !service.disponible && (
          <View style={s.alerte}>
            <Text style={s.alerteTitre}>Paiement indisponible</Text>
            <Text style={s.alerteTexte}>{service.motif || 'Le service de paiement ne répond pas.'}</Text>
          </View>
        )}

        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 18, padding: 20, marginBottom: 18 }}>
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 }}>
            SOLDE ACTUEL
          </Text>
          <Text style={{ color: colors.white, fontSize: 28, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] }}>
            {fcfa(wallet?.totalSolde || 0)}
          </Text>
          {somme > 0 && (
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 8 }}>
              Après recharge : {fcfa((wallet?.totalSolde || 0) + somme)}
            </Text>
          )}
        </LinearGradient>

        <Text style={s.label}>Montant (FCFA)</Text>
        <TextInput
          style={[s.champ, { fontSize: 20, fontWeight: '700' }]}
          value={montant}
          onChangeText={setMontant}
          keyboardType="numeric"
          placeholder="5000"
          placeholderTextColor={colors.textMuted}
        />
        <View style={s.segments}>
          {MONTANTS.map((m) => (
            <TouchableOpacity key={m} style={[s.segment, somme === m && s.segmentActif]}
              onPress={() => setMontant(String(m))} activeOpacity={0.8}>
              <Text style={[s.segmentTexte, somme === m && s.segmentTexteActif]}>
                {m.toLocaleString('fr-FR')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Méthode</Text>
        <Segments options={METHODES} valeur={methode} onChange={setMethode} />

        {methode === 'direct' ? (
          <>
            <Text style={s.label}>Opérateur</Text>
            <Segments options={OPERATEURS} valeur={operateur} onChange={setOperateur} />

            <Text style={s.label}>Numéro à débiter</Text>
            <TextInput
              style={s.champ}
              value={telephone}
              onChangeText={setTelephone}
              keyboardType="phone-pad"
              placeholder="670 00 00 00"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={s.aide}>
              Vous recevrez une demande de validation sur ce numéro. Aucun montant n'est débité avant votre accord.
            </Text>
          </>
        ) : (
          <Info texte="Une page de paiement Fapshi s'ouvrira dans votre navigateur. Revenez ensuite dans l'application : le crédit est vérifié automatiquement." />
        )}

        {somme > 0 && (
          <View style={[s.carte, { marginTop: 18 }]}>
            <Ligne label="Montant" valeur={fcfa(somme)} />
            <Ligne label="Frais MoneyTrack" valeur="Aucun" couleur={colors.success} />
            <Ligne label="Crédité sur" valeur="Portefeuille courant" dernier />
          </View>
        )}

        <Bouton
          titre={`Recharger ${somme > 0 ? fcfa(somme) : ''}`.trim()}
          icone="creditcard"
          onPress={lancer}
          charge={envoi}
          inactif={somme < 100 || (service && !service.disponible)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

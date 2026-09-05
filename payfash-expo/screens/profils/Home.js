import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, SafeAreaView, Image, StyleSheet, Animated,
  TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome as Icon, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../../utils/axiosApi';
import TransactionCard from '../../utils/transactionCard';
import CourbeTresorerie from '../../components/Tresorerie';
import { synthese, tresorerie as apiTresorerie, fcfa, dateCourte } from '../../utils/tontineApi';
import { colors, gradients } from '../../theme';

// =====================================================================
//  L'accueil.
//
//  Il affichait le solde BRUT : 150 000, alors que 30 000 partent dans
//  trois jours en cotisation et 20 000 dorment en caution. Il montre
//  desormais le solde DISPONIBLE, et rend le reste lisible plutot que de
//  le cacher.
//
//  C'est ici que les deux domaines se rejoignent : portefeuilles, budget
//  et tontine sur une seule ligne de temps.
// =====================================================================

const NUANCE_PORTEFEUILLE = {
  courant: gradients.courant,
  projet: gradients.projet,
  epargne: gradients.epargne,
  tontine: gradients.brand,
};
const ICONE_PORTEFEUILLE = {
  courant: 'credit-card', projet: 'bullseye', epargne: 'money', tontine: 'users',
};
const NOM_PORTEFEUILLE = {
  courant: 'Courant', projet: 'Projets', epargne: 'Épargne',
  personnel: 'Personnel', affaires: 'Affaires', tontine: 'Tontine',
};

export default function Home() {
  const navigation = useNavigation();
  const apparition = useRef(new Animated.Value(0)).current;
  const montee = useRef(new Animated.Value(18)).current;

  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [portefeuilles, setPortefeuilles] = useState([]);
  const [totalSolde, setTotalSolde] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [vue, setVue] = useState(null);       // synthese tontine
  const [courbe, setCourbe] = useState(null); // projection de tresorerie

  useEffect(() => {
    Animated.parallel([
      Animated.timing(apparition, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(montee, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start();
  }, []);

  const charger = useCallback(async () => {
    try {
      // Le nom vient du compte, pas d'une constante : l'accueil saluait
      // « Beriole » quel que soit l'utilisateur connecte.
      const brut = await AsyncStorage.getItem('user');
      if (brut) {
        try { setPrenom((JSON.parse(brut)?.nom || '').split(' ')[0]); } catch (e) { /* stockage illisible */ }
      }

      const [w, tx] = await Promise.all([
        api.get('/wallet/solde'),
        api.get('/wallet/transactions').catch(() => ({ data: {} })),
      ]);
      setPortefeuilles(w.data?.portefeuilles || []);
      setTotalSolde(w.data?.totalSolde || 0);
      setTransactions((tx.data?.transactions || []).slice(0, 5));

      // La synthese peut manquer (aucune tontine) : l'accueil doit rester
      // parfaitement utilisable sans elle.
      const [s, t] = await Promise.all([
        synthese().catch(() => null),
        apiTresorerie(120).catch(() => null),
      ]);
      setVue(s?.data || null);
      setCourbe(t?.data || null);
    } catch (e) {
      console.log('Accueil — chargement :', e?.response?.data || e.message);
    } finally {
      setChargement(false);
      setRafraichissement(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  if (chargement) {
    return (
      <SafeAreaView style={[st.page, st.centre]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  const solde = vue?.solde;
  const disponible = solde ? solde.disponible : totalSolde;
  const aDesEngagements = !!solde && (solde.engage30j > 0 || solde.immobilise > 0);

  return (
    <SafeAreaView style={st.page}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={rafraichissement}
            onRefresh={() => { setRafraichissement(true); charger(); }}
            tintColor={colors.accent}
          />
        }
      >
        {/* ---- Barre du haut ---- */}
        <View style={st.barre}>
          <TouchableOpacity
            style={st.identite}
            onPress={() => navigation.navigate('Profile', { solde: disponible })}
            activeOpacity={0.8}
          >
            <Image source={require('../../assets/logo/icon-512.png')} style={st.avatar} />
            <View>
              <Text style={st.salutation}>Bonjour</Text>
              <Text style={st.prenom}>{prenom || 'bienvenue'}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Notification')} style={st.cloche}>
            <Icon name="bell" size={19} color={colors.white} />
            {vue?.solde?.exigible > 0 && <View style={st.pastilleAlerte} />}
          </TouchableOpacity>
        </View>

        {/* ---- Le chiffre qui compte ---- */}
        <Animated.View style={{ opacity: apparition, transform: [{ translateY: montee }] }}>
          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={st.hero}
          >
            <Text style={st.heroLabel}>DISPONIBLE</Text>
            <Text style={st.heroMontant}>{fcfa(disponible)}</Text>

            {aDesEngagements ? (
              <View style={st.heroDetail}>
                <Detail label="Solde total" valeur={fcfa(solde.brut)} />
                <Detail label="Engagé 30 j" valeur={fcfa(solde.engage30j)} />
                <Detail label="Immobilisé" valeur={fcfa(solde.immobilise)} />
              </View>
            ) : (
              <Text style={st.heroNote}>Aucun engagement à venir</Text>
            )}
          </LinearGradient>
        </Animated.View>

        {/* ---- Ce qui presse ---- */}
        {solde?.alerte ? (
          <View style={st.alerte}>
            <MaterialCommunityIcons name="alert-decagram" size={17} color={colors.danger} />
            <Text style={st.alerteTexte}>{solde.alerte}</Text>
          </View>
        ) : null}

        {(vue?.prochaineEcheance || vue?.prochainTour) && (
          <View style={st.duo}>
            {vue.prochaineEcheance && (
              <Echeance
                icone="arrow-top-right"
                teinte={vue.prochaineEcheance.enRetard ? colors.danger : colors.warning}
                titre={vue.prochaineEcheance.enRetard ? 'En retard' : 'À payer'}
                montant={fcfa(vue.prochaineEcheance.montant)}
                detail={vue.prochaineEcheance.libelle}
                date={dateCourte(vue.prochaineEcheance.date)}
                onPress={() => navigation.navigate('Communaute')}
              />
            )}
            {vue.prochainTour && (
              <Echeance
                icone="arrow-bottom-left"
                teinte={colors.success}
                titre="Votre tour"
                montant={fcfa(vue.prochainTour.montant)}
                detail={vue.prochainTour.libelle}
                date={dateCourte(vue.prochainTour.date)}
                onPress={() => navigation.navigate('DetailTontine', { groupeId: vue.prochainTour.groupeId })}
              />
            )}
          </View>
        )}

        {/* ---- La projection ---- */}
        {courbe?.evenements?.length ? (
          <TouchableOpacity
            style={st.bloc}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('PlanTresorerie')}
          >
            <View style={st.blocEntete}>
              <Text style={st.blocTitre}>Prochains 4 mois</Text>
              <Text style={[st.blocEtat, { color: courbe.tiendra ? colors.success : colors.danger }]}>
                {courbe.tiendra ? 'le solde tient' : 'point bas négatif'}
              </Text>
            </View>
            <CourbeTresorerie
              evenements={courbe.evenements}
              soldeDepart={courbe.soldeDepart}
              largeur={300}
            />
            <Text style={st.blocPied}>
              {courbe.evenements.length} mouvements prévus · point bas {fcfa(courbe.creux.montant)}
              {courbe.creux.date ? ` le ${dateCourte(courbe.creux.date)}` : ''}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* ---- Mes portefeuilles ---- */}
        <Text style={st.section}>Mes portefeuilles</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingRight: 6 }}
        >
          {portefeuilles.map((p) => (
            <LinearGradient
              key={p.id}
              colors={NUANCE_PORTEFEUILLE[p.typePortefeuille] || gradients.neutral}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={st.pf}
            >
              <Icon name={ICONE_PORTEFEUILLE[p.typePortefeuille] || 'money'} size={19} color="#fff" />
              <Text style={st.pfNom} numberOfLines={1}>
                {p.nom || NOM_PORTEFEUILLE[p.typePortefeuille] || p.typePortefeuille}
              </Text>
              <Text style={st.pfMontant}>{fcfa(p.solde)}</Text>
              {p.objectifMontant ? (
                <View style={st.jauge}>
                  <View
                    style={[
                      st.jaugeRemplie,
                      { width: `${Math.min(100, Math.round((Number(p.solde) / Number(p.objectifMontant)) * 100))}%` },
                    ]}
                  />
                </View>
              ) : null}
            </LinearGradient>
          ))}
        </ScrollView>

        {/* ---- Actions ---- */}
        <View style={st.actions}>
          <Action icone="plus-circle" teinte={colors.success} label="Déposer" onPress={() => navigation.navigate('Recharge')} />
          <Action icone="shopping-cart" teinte={colors.danger} label="Dépenser" onPress={() => navigation.navigate('Depense')} />
          <Action icone="upload" teinte={colors.accent} label="Retirer" onPress={() => navigation.navigate('Retrait')} />
          <Action icone="users" teinte={colors.violetLight} label="Tontine" onPress={() => navigation.navigate('Communaute')} />
        </View>

        {/* ---- Dernières transactions ---- */}
        <View style={st.blocEntete}>
          <Text style={[st.section, { marginBottom: 0, paddingHorizontal: 0 }]}>Dernières opérations</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Transaction')}>
            <Text style={st.lien}>Tout voir</Text>
          </TouchableOpacity>
        </View>
        {transactions.length === 0 ? (
          <Text style={st.videTexte}>Aucune opération pour l'instant.</Text>
        ) : (
          transactions.map((tx, i) => <TransactionCard key={tx.id || i} transaction={tx} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
//  Briques
// ---------------------------------------------------------------
const Detail = ({ label, valeur }) => (
  <View style={{ flex: 1 }}>
    <Text style={st.detailLabel}>{label}</Text>
    <Text style={st.detailValeur}>{valeur}</Text>
  </View>
);

const Echeance = ({ icone, teinte, titre, montant, detail, date, onPress }) => (
  <TouchableOpacity style={st.echeance} activeOpacity={0.85} onPress={onPress}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <MaterialCommunityIcons name={icone} size={15} color={teinte} />
      <Text style={[st.echeanceTitre, { color: teinte }]}>{titre}</Text>
    </View>
    <Text style={st.echeanceMontant}>{montant}</Text>
    <Text style={st.echeanceDetail} numberOfLines={2}>{detail}</Text>
    <Text style={st.echeanceDate}>{date}</Text>
  </TouchableOpacity>
);

const Action = ({ icone, teinte, label, onPress }) => (
  <TouchableOpacity style={st.action} onPress={onPress} activeOpacity={0.75}>
    <View style={[st.actionRond, { backgroundColor: teinte + '22' }]}>
      <Icon name={icone} size={19} color={teinte} />
    </View>
    <Text style={st.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

// ---------------------------------------------------------------
const CARTE = '#211C3A';
const BORDURE = '#332C5C';

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.base },
  centre: { justifyContent: 'center', alignItems: 'center' },

  barre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16 },
  identite: { flexDirection: 'row', alignItems: 'center' },
  avatar: { height: 42, width: 42, borderRadius: 21, marginRight: 11 },
  salutation: { color: colors.textMuted, fontSize: 12 },
  prenom: { color: colors.white, fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  cloche: { width: 38, height: 38, borderRadius: 19, backgroundColor: CARTE, justifyContent: 'center', alignItems: 'center' },
  pastilleAlerte: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: CARTE },

  hero: { marginHorizontal: 18, borderRadius: 22, padding: 22, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
  heroLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  heroMontant: { color: colors.white, fontSize: 34, fontWeight: '800', marginTop: 7, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  heroNote: { color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 10 },
  heroDetail: { flexDirection: 'row', marginTop: 18, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  detailLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 10.5, marginBottom: 3 },
  detailValeur: { color: colors.white, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] },

  alerte: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(244,63,94,0.13)', borderLeftWidth: 3, borderLeftColor: colors.danger, marginHorizontal: 18, marginTop: 14, padding: 13, borderRadius: 10 },
  alerteTexte: { color: colors.white, fontSize: 12.5, marginLeft: 9, flex: 1, lineHeight: 18 },

  duo: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 14 },
  echeance: { flex: 1, backgroundColor: CARTE, borderRadius: 15, padding: 15, marginHorizontal: 6, borderWidth: 1, borderColor: BORDURE },
  echeanceTitre: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginLeft: 6, textTransform: 'uppercase' },
  echeanceMontant: { color: colors.white, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  echeanceDetail: { color: colors.textMuted, fontSize: 11.5, marginTop: 4, lineHeight: 16 },
  echeanceDate: { color: colors.accentLight, fontSize: 11, marginTop: 6, fontWeight: '600' },

  bloc: { backgroundColor: CARTE, borderRadius: 16, marginHorizontal: 18, marginTop: 16, padding: 16, borderWidth: 1, borderColor: BORDURE },
  blocEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 18 },
  blocTitre: { color: colors.white, fontSize: 14.5, fontWeight: '700' },
  blocEtat: { fontSize: 11.5, fontWeight: '700' },
  blocPied: { color: colors.textMuted, fontSize: 11.5, marginTop: 8, lineHeight: 16 },

  section: { color: colors.white, fontSize: 16, fontWeight: '700', paddingHorizontal: 18, marginTop: 24, marginBottom: 12 },

  pf: { width: 152, borderRadius: 16, padding: 15, marginRight: 11, minHeight: 118, justifyContent: 'space-between' },
  pfNom: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 10 },
  pfMontant: { color: '#fff', fontSize: 15.5, fontWeight: '700', marginTop: 3, fontVariant: ['tabular-nums'] },
  jauge: { height: 4, backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 2, marginTop: 9, overflow: 'hidden' },
  jaugeRemplie: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },

  actions: { flexDirection: 'row', backgroundColor: CARTE, marginHorizontal: 18, marginTop: 22, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: BORDURE },
  action: { flex: 1, alignItems: 'center' },
  actionRond: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginBottom: 7 },
  actionLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },

  lien: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  videTexte: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 26 },
});

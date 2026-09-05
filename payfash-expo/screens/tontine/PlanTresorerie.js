import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s, { carte, bordure } from './styleTontine';
import { Chargement, Info, Segments } from './composants';
import CourbeTresorerie from '../../components/Tresorerie';
import { tresorerie, soldeReel, messageErreur, fcfa, dateCourte } from '../../utils/tontineApi';

// =====================================================================
//  Le plan de tresorerie.
//
//  Une seule ligne de temps ou se melangent tout ce qui sort — cotisations,
//  amendes, echeances de credit — et tout ce qui rentre — les tours.
//  C'est la vue qui repond a « est-ce que je tiens jusqu'a mon tour ? »,
//  question qu'aucun ecran ne savait traiter tant que la tontine et le
//  portefeuille vivaient chacun de leur cote.
// =====================================================================

const HORIZONS = [
  { valeur: '30', libelle: '1 mois' },
  { valeur: '90', libelle: '3 mois' },
  { valeur: '180', libelle: '6 mois' },
  { valeur: '365', libelle: '1 an' },
];

const NATURE = {
  cotisation: { icone: 'account-cash', libelle: 'Cotisation' },
  amende: { icone: 'gavel', libelle: 'Amende' },
  credit: { icone: 'credit-card-clock', libelle: 'Échéance de crédit' },
  tour: { icone: 'gift', libelle: 'Votre tour' },
};

export default function PlanTresorerie() {
  const navigation = useNavigation();
  const [horizon, setHorizon] = useState('90');
  const [plan, setPlan] = useState(null);
  const [solde, setSolde] = useState(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [t, sd] = await Promise.all([tresorerie(parseInt(horizon, 10)), soldeReel()]);
      setPlan(t.data);
      setSolde(sd.data);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    } finally {
      setRafraichissement(false);
    }
  }, [horizon]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  if (!plan || !solde) return <Chargement />;

  // Regroupement par mois : une liste plate de 40 lignes ne se lit pas.
  const parMois = {};
  for (const e of plan.evenements) {
    const d = new Date(e.date);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (parMois[cle] = parMois[cle] || []).push(e);
  }
  const mois = Object.keys(parMois).sort();
  const nomMois = (cle) => {
    const [a, m] = cle.split('-');
    return new Date(Number(a), Number(m) - 1, 1)
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={s.contenu}
        refreshControl={
          <RefreshControl
            refreshing={rafraichissement}
            onRefresh={() => { setRafraichissement(true); charger(); }}
            tintColor={colors.accent}
          />
        }
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Plan de trésorerie</Text>
        <Text style={s.sousTitre}>Ce qui sort, ce qui rentre, et si le solde tient</Text>

        <Segments options={HORIZONS} valeur={horizon} onChange={setHorizon} />

        {/* La courbe */}
        <View style={[s.carte, { marginTop: 18, alignItems: 'center' }]}>
          <CourbeTresorerie
            evenements={plan.evenements}
            soldeDepart={plan.soldeDepart}
            largeur={290}
            hauteur={110}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 12 }}>
            <Bornes label="Aujourd'hui" valeur={fcfa(plan.soldeDepart)} />
            <Bornes
              label="Point bas"
              valeur={fcfa(plan.creux.montant)}
              teinte={plan.tiendra ? colors.accentLight : colors.danger}
              aligne="center"
            />
            <Bornes label="Fin de période" valeur={fcfa(plan.soldeFin)} aligne="right" />
          </View>
        </View>

        {plan.tiendra ? (
          <Info texte={`Votre solde reste positif sur toute la période. Le point bas est de ${fcfa(plan.creux.montant)}${plan.creux.date ? ` le ${dateCourte(plan.creux.date)}` : ''}.`} />
        ) : (
          <View style={s.alerte}>
            <Text style={s.alerteTitre}>Le solde passe dans le rouge</Text>
            <Text style={s.alerteTexte}>
              Point bas à {fcfa(plan.creux.montant)}
              {plan.creux.date ? ` le ${dateCourte(plan.creux.date)}` : ''}. Rechargez avant cette date, ou
              négociez un échange de tour pour être servi plus tôt.
            </Text>
          </View>
        )}

        {/* Répartition du solde */}
        <Text style={s.section}>Où est mon argent</Text>
        <View style={s.carte}>
          <Barre label="Disponible" montant={solde.disponible} total={solde.brut} teinte={colors.success} />
          <Barre label="Engagé sous 30 jours" montant={solde.engage30j} total={solde.brut} teinte={colors.warning} />
          <Barre label="Immobilisé (cautions, caisse)" montant={solde.immobilise} total={solde.brut} teinte={colors.accent} dernier />
        </View>

        {/* Le détail, mois par mois */}
        <Text style={s.section}>Le détail</Text>
        {mois.length === 0 ? (
          <Info texte="Aucun mouvement prévu sur cette période." />
        ) : (
          mois.map((cle) => {
            const evts = parMois[cle];
            const net = evts.reduce((t, e) => t + e.signe * e.montant, 0);
            return (
              <View key={cle} style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <Text style={{ color: colors.white, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }}>
                    {nomMois(cle)}
                  </Text>
                  <Text style={{ color: net >= 0 ? colors.success : colors.warning, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {net >= 0 ? '+' : ''}{fcfa(net)}
                  </Text>
                </View>

                <View style={[s.carte, { paddingVertical: 4 }]}>
                  {evts.map((e, i) => {
                    const n = NATURE[e.nature] || { icone: 'circle-small', libelle: e.nature };
                    const entree = e.sens === 'entree';
                    return (
                      <View
                        key={i}
                        style={[
                          { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
                          i < evts.length - 1 && { borderBottomWidth: 1, borderBottomColor: bordure },
                        ]}
                      >
                        <View
                          style={{
                            width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
                            backgroundColor: (entree ? colors.success : e.enRetard ? colors.danger : colors.textMuted) + '22',
                            marginRight: 12,
                          }}
                        >
                          <MaterialCommunityIcons
                            name={n.icone}
                            size={16}
                            color={entree ? colors.success : e.enRetard ? colors.danger : colors.textMuted}
                          />
                        </View>

                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: colors.white, fontSize: 13.5 }} numberOfLines={1}>
                            {e.libelle}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>
                            {dateCourte(e.date)}
                            {e.enRetard ? '  ·  en retard' : ''}
                            {e.projete ? '  ·  prévu' : ''}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={{
                              color: entree ? colors.success : colors.white,
                              fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'],
                            }}
                          >
                            {entree ? '+' : '−'}{fcfa(e.montant)}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                            {fcfa(e.soldeApres)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}

        <Info texte="Les cotisations des cycles à venir sont marquées « prévu » : elles n'existent pas encore en base, mais vous vous y êtes engagé en rejoignant la tontine." />
      </ScrollView>
    </SafeAreaView>
  );
}

const Bornes = ({ label, valeur, teinte, aligne = 'left' }) => (
  <View style={{ flex: 1, alignItems: aligne === 'center' ? 'center' : aligne === 'right' ? 'flex-end' : 'flex-start' }}>
    <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{label}</Text>
    <Text style={{ color: teinte || colors.white, fontSize: 12.5, fontWeight: '700', marginTop: 3, fontVariant: ['tabular-nums'] }}>
      {valeur}
    </Text>
  </View>
);

const Barre = ({ label, montant, total, teinte, dernier }) => {
  const part = total > 0 ? Math.min(100, Math.max(0, (montant / total) * 100)) : 0;
  return (
    <View style={[{ paddingVertical: 11 }, !dernier && { borderBottomWidth: 1, borderBottomColor: bordure }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1, paddingRight: 10 }}>{label}</Text>
        <Text style={{ color: colors.white, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {fcfa(montant)}
        </Text>
      </View>
      <View style={{ height: 5, backgroundColor: bordure, borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${part}%`, backgroundColor: teinte, borderRadius: 3 }} />
      </View>
    </View>
  );
};

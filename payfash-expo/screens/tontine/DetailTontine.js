import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../../theme';
import s, { carte } from './styleTontine';
import { Pastille, Ligne, Bouton, Chargement, Alerte, Info, Progression } from './composants';
import {
  detailGroupe, cotisationsCycle, demarrerGroupe, verserPot,
  mesAmendes, bloquerCaution, etatLiens, lierBudget, destinationsTour, routerTour,
  etatPrelevement, activerPrelevement, desactiverPrelevement,
  messageErreur, fcfa, dateCourte,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

const ROLES_BUREAU = ['president', 'tresorier'];

export default function DetailTontine() {
  const navigation = useNavigation();
  const { groupeId } = useRoute().params;
  const { apresMouvement, monId } = useTontine();

  const [data, setData] = useState(null);
  const [cotisations, setCotisations] = useState(null);
  const [mesDettes, setMesDettes] = useState({ nombreDues: 0, totalDu: 0 });
  const [liens, setLiens] = useState(null);
  const [mandat, setMandat] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [action, setAction] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { data: d } = await detailGroupe(groupeId);
      setData(d);
      if (d.cycleEnCours) {
        const { data: c } = await cotisationsCycle(d.cycleEnCours.id);
        setCotisations(c);
      } else {
        setCotisations(null);
      }
      const { data: a } = await mesAmendes(groupeId);
      setMesDettes(a);
      const { data: l } = await etatLiens(groupeId);
      setLiens(l);
      const { data: p } = await etatPrelevement(groupeId);
      setMandat(p);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    } finally {
      setChargement(false);
      setRafraichissement(false);
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const executer = async (fn, succes) => {
    try {
      setAction(true);
      const { data: r } = await fn();
      await apresMouvement();
      await charger();
      Alert.alert(succes, r.message);
    } catch (e) {
      Alert.alert('Operation impossible', messageErreur(e));
    } finally {
      setAction(false);
    }
  };

  if (chargement) return <Chargement />;
  if (!data) return null;

  const { groupe, cycleEnCours, monRole, monTour } = data;
  const estBureau = ROLES_BUREAU.includes(monRole);
  const moi = groupe.membres?.find((m) => m.clientId === monId);
  const maCaution = moi?.cautionPayee;
  const potComplet = cotisations?.potComplet;

  // Ma ligne de cotisation sur le cycle en cours, si j'en ai une.
  const maCotisation = cotisations?.cotisations?.find((c) => c.clientId === monId);
  const jeSuisBeneficiaire = cycleEnCours && cycleEnCours.beneficiaireId === monId;

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

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={[s.titre, { flex: 1, paddingRight: 10 }]}>{groupe.nom}</Text>
          <Pastille statut={groupe.statut} />
        </View>
        <Text style={s.sousTitre}>
          {fcfa(groupe.montantParPeriode)} / {groupe.frequence} · code {groupe.codeInvitation}
        </Text>

        {/* Une dette doit se voir avant tout le reste. */}
        {mesDettes.nombreDues > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate('MesAmendes', { groupeId })} activeOpacity={0.85}>
            <Alerte
              titre={`${mesDettes.nombreDues} amende${mesDettes.nombreDues > 1 ? 's' : ''} a regler`}
              texte={`${fcfa(mesDettes.totalDu)} dus. Tant qu'elles ne sont pas payees, vous ne pouvez pas cotiser. Touchez pour regler.`}
            />
          </TouchableOpacity>
        )}

        {/* Le pot du cycle en cours */}
        {cycleEnCours ? (
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 20, marginBottom: 16 }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>
              CYCLE {cycleEnCours.numeroCycle}
            </Text>
            <Text style={{ color: colors.white, fontSize: 30, fontWeight: 'bold', marginTop: 6 }}>
              {fcfa(cycleEnCours.montantCollecte)}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 }}>
              sur {fcfa(cycleEnCours.montantAttendu)} attendus
            </Text>
            <Progression valeur={Number(cycleEnCours.montantCollecte)} total={Number(cycleEnCours.montantAttendu)} />
            <Text style={{ color: colors.white, fontSize: 14, marginTop: 12, fontWeight: '600' }}>
              {jeSuisBeneficiaire ? 'Ce tour est le votre' : `Beneficiaire : ${cycleEnCours.beneficiaire?.nom || '—'}`}
            </Text>
            {cotisations && (
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 3 }}>
                {cotisations.avancement} cotisations soldees · echeance {dateCourte(cycleEnCours.dateFinPrevue)}
              </Text>
            )}
          </LinearGradient>
        ) : (
          <Info
            texte={
              groupe.statut === 'en_attente'
                ? `La tontine n'a pas encore demarre. ${groupe.membresActuels}/${groupe.membresMax} membres ont rejoint.`
                : 'Aucun cycle en cours.'
            }
          />
        )}

        {/* Mes actions du moment */}
        {maCotisation && maCotisation.statut !== 'payee' && (
          <Bouton
            titre={`Cotiser ${fcfa(Number(maCotisation.montantDu) - Number(maCotisation.montantPaye))}`}
            icone="wallet"
            onPress={() => navigation.navigate('Cotiser', { groupeId, cycleId: cycleEnCours.id })}
          />
        )}

        {groupe.statut === 'en_attente' && !maCaution && Number(groupe.pourcentageCaution) > 0 && (
          <Bouton
            titre={`Bloquer ma caution (${fcfa((Number(groupe.montantParPeriode) * Number(groupe.pourcentageCaution)) / 100)})`}
            icone="lock"
            variante="secondaire"
            charge={action}
            onPress={() =>
              Alert.alert(
                'Bloquer la caution',
                "Cette somme quitte votre portefeuille et reste au sequestre du groupe. Elle vous est rendue en fin de tontine, si vous n'avez plus de dette.",
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Bloquer', onPress: () => executer(() => bloquerCaution(groupeId), 'Caution bloquee') },
                ]
              )
            }
          />
        )}

        {estBureau && groupe.statut === 'en_attente' && (
          <Bouton
            titre="Demarrer la tontine"
            icone="play-circle"
            variante="success"
            charge={action}
            onPress={() =>
              Alert.alert(
                'Demarrer',
                `L'ordre de passage sera fige (${groupe.modeOrdre}) et le groupe se fermera aux nouvelles adhesions. Continuer ?`,
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Demarrer', onPress: () => executer(() => demarrerGroupe(groupeId), 'Tontine demarree') },
                ]
              )
            }
          />
        )}

        {estBureau && cycleEnCours && (
          <Bouton
            titre={potComplet ? 'Verser le pot au beneficiaire' : 'Verser le pot (incomplet)'}
            icone="swap"
            variante={potComplet ? 'success' : 'secondaire'}
            inactif={!potComplet}
            charge={action}
            onPress={() => executer(() => verserPot(cycleEnCours.id), 'Pot verse')}
          />
        )}
        {estBureau && cycleEnCours && !potComplet && (
          <Text style={s.aide}>
            Le versement n'est possible que lorsque toutes les cotisations du cycle sont soldees. Utilisez la caution ou
            le garant d'un retardataire depuis la liste des cotisations.
          </Text>
        )}

        {/* La tontine dans le reste de l'application. Sans ces deux liens,
            le module reste juxtapose : le budget ignore la cotisation, et
            le tour se dilue dans le portefeuille courant. */}
        {liens && (
          <>
            <Text style={s.section}>Dans mes finances</Text>
            <View style={[s.carte, { paddingVertical: 4 }]}>
              <Lien
                icone="wallet-outline"
                titre="Cotisation dans mon budget"
                etat={liens.budget.lie ? `${liens.budget.nom} · ${liens.budget.categorie || 'catégorie dédiée'}` : liens.budget.pourquoi}
                actif={liens.budget.lie}
                charge={action}
                onPress={() =>
                  liens.budget.lie
                    ? Alert.alert('Déjà relié', `Vos cotisations sont imputées au budget « ${liens.budget.nom} ».`)
                    : executer(() => lierBudget(groupeId), 'Budget relié')
                }
              />
              {mandat && (
                <Lien
                  icone={mandat.actif ? 'calendar-check' : 'calendar-clock'}
                  titre="Régler ma cotisation automatiquement"
                  etat={
                    mandat.actif
                      ? mandat.couvert
                        ? `Prélèvement ${mandat.joursAvant} j avant l'échéance · solde suffisant`
                        : mandat.avertissement
                      : "Une amende évitée vaut mieux qu'une amende notifiée. Le prélèvement règle la cotisation avant l'échéance."
                  }
                  actif={mandat.actif}
                  charge={action}
                  onPress={() =>
                    mandat.actif
                      ? Alert.alert('Mandat actif', mandat.avertissement || 'Vos cotisations sont réglées automatiquement.', [
                          { text: 'Garder', style: 'cancel' },
                          { text: 'Retirer le mandat', style: 'destructive', onPress: () => executer(() => desactiverPrelevement(groupeId), 'Mandat retiré') },
                        ])
                      : Alert.alert(
                          'Régler automatiquement',
                          'Combien de jours avant l’échéance ?\n\nSi le solde ne suffit pas, rien n’est prélevé et vous êtes alerté — jamais de découvert.',
                          [
                            { text: 'Le jour même', onPress: () => executer(() => activerPrelevement(groupeId, 0), 'Mandat enregistré') },
                            { text: '2 jours avant', onPress: () => executer(() => activerPrelevement(groupeId, 2), 'Mandat enregistré') },
                            { text: '5 jours avant', onPress: () => executer(() => activerPrelevement(groupeId, 5), 'Mandat enregistré') },
                            { text: 'Annuler', style: 'cancel' },
                          ]
                        )
                  }
                />
              )}
              <Lien
                icone="target-arrow"
                titre="Destination de mon tour"
                etat={liens.destinationTour.definie
                  ? `${liens.destinationTour.nom || liens.destinationTour.type}`
                  : liens.destinationTour.pourquoi}
                actif={liens.destinationTour.definie}
                charge={action}
                dernier
                onPress={async () => {
                  try {
                    const { data } = await destinationsTour(groupeId);
                    if (!data.options.length) return Alert.alert('Aucune destination', 'Créez un portefeuille projet ou épargne.');
                    Alert.alert(
                      'Où verser votre tour ?',
                      'Le pot ira directement là, sans passer par votre courant.',
                      [
                        ...data.options.slice(0, 4).map((o) => ({
                          text: `${o.nom} (${fcfa(o.solde)})`,
                          onPress: () => executer(() => routerTour(groupeId, o.id), 'Destination enregistrée'),
                        })),
                        { text: 'Annuler', style: 'cancel' },
                      ]
                    );
                  } catch (e) {
                    Alert.alert('Impossible', messageErreur(e));
                  }
                }}
              />
            </View>

            <TouchableOpacity
              style={[s.carte, { flexDirection: 'row', alignItems: 'center' }]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PlanTresorerie')}
            >
              <MaterialCommunityIcons name="chart-timeline-variant" size={20} color={colors.accent} />
              <Text style={{ color: colors.white, fontSize: 14, marginLeft: 12, flex: 1 }}>
                Voir mon plan de trésorerie
              </Text>
              <AntDesign name="right" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}

        {/* Navigation interne */}
        <Text style={s.section}>Le groupe</Text>
        <Menu
          items={[
            { icone: 'account-group', label: 'Membres et tours', ecran: 'MembresTontine' },
            ...(cycleEnCours ? [{ icone: 'cash-multiple', label: 'Cotisations du cycle', ecran: 'CotisationsCycle', params: { cycleId: cycleEnCours.id } }] : []),
            { icone: 'gavel', label: 'Votes et decisions', ecran: 'VotesTontine' },
            { icone: 'swap-horizontal', label: 'Echanges de tours', ecran: 'EchangeTour' },
            { icone: 'alert-octagon', label: 'Mes amendes', ecran: 'MesAmendes' },
            ...(groupe.type !== 'rotative'
              ? [{ icone: 'piggy-bank', label: "Caisse d'epargne et credit", ecran: 'CaisseEpargne' }]
              : []),
            { icone: 'file-document-outline', label: 'Reglement interieur', ecran: 'ReglementTontine' },
          ]}
          groupeId={groupeId}
          navigation={navigation}
        />

        <Text style={s.section}>Regles</Text>
        <View style={s.carte}>
          <Ligne label="Type de caisse" valeur={groupe.type} />
          <Ligne label="Ordre de passage" valeur={groupe.modeOrdre} />
          <Ligne label="Membres" valeur={`${groupe.membresActuels} / ${groupe.membresMax}`} />
          <Ligne label="Caution a l'entree" valeur={`${Number(groupe.pourcentageCaution)} %`} />
          <Ligne
            label="Destination des amendes"
            valeur={groupe.destinationAmendes === 'epargne' ? "Caisse d'epargne" : 'Pot du cycle'}
          />
          <Ligne label="Mon role" valeur={monRole} />
          <Ligne label="Mon tour" valeur={monTour ? `${monTour}` : 'non attribue'} dernier />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Une ligne de liaison : elle dit ce qui est branche, ou pourquoi ca vaut
 * la peine de le brancher. L'etat non branche n'est pas une erreur, c'est
 * une occasion — le texte l'explique plutot que de se contenter d'un vide.
 */
const Lien = ({ icone, titre, etat, actif, onPress, charge, dernier }) => (
  <TouchableOpacity
    style={[s.ligne, !dernier && s.ligneSeparee, { alignItems: 'flex-start' }]}
    onPress={onPress}
    disabled={charge}
    activeOpacity={0.75}
  >
    <View style={{ flexDirection: 'row', flex: 1, paddingRight: 10 }}>
      <MaterialCommunityIcons
        name={icone}
        size={19}
        color={actif ? colors.success : colors.textMuted}
        style={{ marginRight: 12, marginTop: 2 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.white, fontSize: 14, fontWeight: '600' }}>{titre}</Text>
        <Text style={{ color: actif ? colors.success : colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
          {etat}
        </Text>
      </View>
    </View>
    {actif ? (
      <AntDesign name="check-circle" size={16} color={colors.success} />
    ) : (
      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.primary }}>
        <Text style={{ color: colors.white, fontSize: 11, fontWeight: '700' }}>Relier</Text>
      </View>
    )}
  </TouchableOpacity>
);

const Menu = ({ items, groupeId, navigation }) => (
  <View style={[s.carte, { paddingVertical: 4 }]}>
    {items.map((it, i) => (
      <TouchableOpacity
        key={it.ecran + i}
        style={[s.ligne, i < items.length - 1 && s.ligneSeparee]}
        onPress={() => navigation.navigate(it.ecran, { groupeId, ...(it.params || {}) })}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name={it.icone} size={19} color={colors.accent} style={{ marginRight: 12 }} />
          <Text style={{ color: colors.white, fontSize: 14 }}>{it.label}</Text>
        </View>
        <AntDesign name="right" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    ))}
  </View>
);

import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Stat, Bouton, Chargement, Vide, Alerte, Progression } from './composants';
import { useTontine } from '../../utils/TontineContext';
import { fcfa } from '../../utils/tontineApi';

// Ecran d'entree du module : mes tontines, et ce qu'elles attendent de moi.
export default function Tontines() {
  const navigation = useNavigation();
  const { groupes, amendesDues, totalAmendes, rafraichir } = useTontine();
  const [premierChargement, setPremierChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await rafraichir();
        setPremierChargement(false);
      })();
    }, [rafraichir])
  );

  const recharger = async () => {
    setEnCours(true);
    await rafraichir();
    setEnCours(false);
  };

  if (premierChargement) return <Chargement />;

  const actives = groupes.filter((g) => g.groupe.statut === 'actif').length;
  // Ce que je dois maintenant : la somme des cotisations ouvertes.
  const aPayer = groupes.reduce((total, g) => {
    const c = g.maCotisation;
    if (!c || c.statut === 'payee') return total;
    return total + (Number(c.montantDu) - Number(c.montantPaye));
  }, 0);

  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={s.contenu}
        refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} tintColor={colors.accent} />}
      >
        <Text style={s.titre}>Mes tontines</Text>
        <Text style={s.sousTitre}>Njangi, epargne et credit entre membres</Text>

        {amendesDues > 0 && (
          <Alerte
            titre={`${amendesDues} amende${amendesDues > 1 ? 's' : ''} a regler`}
            texte={`${fcfa(totalAmendes)} a payer. Tant qu'une amende est due, vous ne pouvez pas cotiser.`}
          />
        )}

        <View style={s.stats}>
          <Stat label="Tontines" valeur={groupes.length} />
          <Stat label="En cours" valeur={actives} />
          <Stat label="A verser" valeur={fcfa(aPayer)} />
        </View>

        {groupes.length === 0 ? (
          <Vide texte={"Vous n'appartenez encore a aucune tontine.\nCreez la votre ou rejoignez celle d'un proche avec son code d'invitation."} />
        ) : (
          groupes.map((g) => {
            const cycle = g.cycleEnCours;
            const cot = g.maCotisation;
            const doitPayer = cot && cot.statut !== 'payee';
            return (
              <TouchableOpacity
                key={g.groupe.id}
                style={s.carte}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('DetailTontine', { groupeId: g.groupe.id })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={[s.carteTitre, { flex: 1, paddingRight: 10 }]}>{g.groupe.nom}</Text>
                  <Pastille statut={g.groupe.statut} />
                </View>

                <Text style={s.carteMontant}>
                  {fcfa(g.groupe.montantParPeriode)} / {g.groupe.frequence}
                </Text>

                <Text style={s.carteInfo}>
                  {g.groupe.membresActuels}/{g.groupe.membresMax} membres
                  {g.monTour ? `  ·  votre tour : ${g.monTour}${g.aiBeneficie ? ' (deja mange)' : ''}` : ''}
                  {`  ·  ${g.monRole}`}
                </Text>

                {cycle && (
                  <>
                    <Text style={[s.carteInfo, { marginTop: 8 }]}>
                      Cycle {cycle.numeroCycle} — pot {fcfa(cycle.montantCollecte)} sur {fcfa(cycle.montantAttendu)}
                    </Text>
                    <Progression valeur={Number(cycle.montantCollecte)} total={Number(cycle.montantAttendu)} />
                  </>
                )}

                {doitPayer && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                    <MaterialCommunityIcons name="alert-circle" size={15} color={colors.warning} />
                    <Text style={{ color: colors.warning, fontSize: 13, marginLeft: 6, fontWeight: '600' }}>
                      {fcfa(Number(cot.montantDu) - Number(cot.montantPaye))} a cotiser
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <Bouton titre="Creer une tontine" icone="plus-circle" onPress={() => navigation.navigate('CreerTontine')} />
        <Bouton
          titre="Rejoindre avec un code"
          icone="qrcode"
          variante="secondaire"
          onPress={() => navigation.navigate('RejoindreTontine')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

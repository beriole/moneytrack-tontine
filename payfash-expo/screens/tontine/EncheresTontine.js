import React, { useState, useCallback } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TextInput, TouchableOpacity, Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Chargement, Info, Ligne, Alerte, Pastille, Vide } from './composants';
import {
  offresEnchere, ouvrirEnchere, offrirEnchere, adjugerEnchere, retirerEnchere,
  messageErreur, fcfa, dateCourte,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

// =====================================================================
//  L'enchere sur le pot.
//
//  La creation de tontine proposait « Enchere » comme mode d'attribution
//  des tours, avec son explication — et aucun ecran ne permettait
//  d'encherir. Le mode existait, la mecanique du backend aussi, les
//  membres n'avaient simplement aucun moyen de s'en servir.
//
//  Le principe, en une phrase : celui qui a besoin du pot tout de suite
//  accepte d'en abandonner une part ; cette decote revient a ceux qui ont
//  paye leur cotisation, en echange de leur patience.
// =====================================================================

export default function EncheresTontine() {
  const navigation = useNavigation();
  const { cycleId, groupeId, monRole } = useRoute().params;
  const { apresMouvement } = useTontine();

  const [etat, setEtat] = useState(null);
  const [decote, setDecote] = useState('');
  const [action, setAction] = useState(null);

  const charger = useCallback(async () => {
    try {
      const { data } = await offresEnchere(cycleId);
      setEtat(data);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    }
  }, [cycleId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const agir = async (nom, appel, succes) => {
    setAction(nom);
    try {
      const { data } = await appel();
      await charger();
      if (apresMouvement) await apresMouvement();
      Alert.alert('C\'est fait', succes(data));
    } catch (e) {
      Alert.alert('Impossible', messageErreur(e));
    } finally {
      setAction(null);
    }
  };

  if (!etat) return <SafeAreaView style={s.page}><Chargement /></SafeAreaView>;

  const cycle = etat.cycle || {};
  const pot = Number(cycle.montantAttendu) || 0;
  const limite = cycle.enchereOuverteJusqu ? new Date(cycle.enchereOuverteJusqu) : null;
  const ouverte = !!limite && limite > new Date();
  const montant = parseInt(decote, 10) || 0;
  const president = monRole === 'president';

  const actives = (etat.encheres || []).filter((e) => e.statut === 'active');

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Enchère sur le pot</Text>
        <Text style={s.sousTitre}>Cycle {cycle.numeroCycle}</Text>

        <View style={s.carte}>
          <Ligne label="Pot du cycle" valeur={fcfa(pot)} />
          <Ligne
            label="Meilleure offre"
            valeur={etat.meilleure ? fcfa(etat.meilleure.montantDecote) : '—'}
            couleur={etat.meilleure ? colors.accent : undefined}
          />
          <Ligne
            label="Le gagnant recevrait"
            valeur={fcfa(etat.potApresDecote)}
            couleur={colors.success}
          />
          <Ligne
            label="Offres ouvertes jusqu'au"
            valeur={limite ? `${dateCourte(limite)} ${limite.toLocaleTimeString('fr-FR').slice(0, 5)}` : '—'}
            couleur={ouverte ? colors.success : colors.warning}
            dernier
          />
        </View>

        {!limite && (
          <Info texte="Aucune enchère n'est ouverte sur ce cycle. Le président peut en ouvrir une tant qu'aucune cotisation n'a été versée." />
        )}
        {limite && !ouverte && (
          <Alerte
            titre="Offres closes"
            texte="La fenêtre est fermée. L'adjudication se fait automatiquement à la prochaine passe, ou tout de suite par le président."
          />
        )}

        {/* --- Déposer une offre ------------------------------------ */}
        {ouverte && (
          <>
            <Text style={s.label}>Décote que vous acceptez d'abandonner</Text>
            <TextInput
              style={[s.champ, { fontSize: 20, fontWeight: '700' }]}
              value={decote}
              onChangeText={setDecote}
              keyboardType="numeric"
              placeholder="5000"
              placeholderTextColor={colors.textMuted}
            />
            {montant > 0 && montant < pot && (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
                Vous recevriez {fcfa(pot - montant)} au lieu de {fcfa(pot)}. Les cotisants se
                partagent les {fcfa(montant)} abandonnés.
              </Text>
            )}
            {montant >= pot && pot > 0 && (
              <Text style={{ color: colors.warning, fontSize: 13, marginTop: 8 }}>
                La décote doit rester inférieure au pot.
              </Text>
            )}
            <View style={{ marginTop: 14 }}>
              <Bouton
                titre="Déposer mon offre"
                icone="up"
                inactif={!(montant > 0 && montant < pot)}
                charge={action === 'offrir'}
                onPress={() => agir('offrir', () => offrirEnchere(cycleId, montant),
                  () => `Offre de ${fcfa(montant)} déposée. Elle remplace la précédente si vous en aviez une.`)}
              />
            </View>
          </>
        )}

        {/* --- Le bureau -------------------------------------------- */}
        {president && !ouverte && (
          <View style={{ marginTop: 16 }}>
            <Bouton
              titre="Ouvrir une enchère (24 h)"
              icone="clock-circle"
              variante="secondaire"
              charge={action === 'ouvrir'}
              onPress={() => agir('ouvrir', () => ouvrirEnchere(cycleId),
                (d) => d.message)}
            />
          </View>
        )}
        {president && actives.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Bouton
              titre="Adjuger maintenant"
              icone="check-circle"
              variante="success"
              charge={action === 'adjuger'}
              onPress={() => Alert.alert(
                'Adjuger le pot',
                `La plus forte décote l'emporte. Le bénéficiaire du cycle change et les cotisations sont régénérées.`,
                [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Adjuger',
                    onPress: () => agir('adjuger', () => adjugerEnchere(cycleId),
                      (d) => `Pot adjugé avec une décote de ${fcfa(d.decote)}. ${d.cotisationsRegenerees} cotisation(s) régénérée(s).`),
                  },
                ]
              )}
            />
          </View>
        )}

        {/* --- Les offres ------------------------------------------- */}
        <Text style={[s.label, { marginTop: 22 }]}>Offres déposées</Text>
        {(etat.encheres || []).length === 0 ? (
          <Vide icone="gavel" texte="Aucune offre pour l'instant." />
        ) : (
          etat.encheres.map((e) => (
            <View key={e.id} style={[s.carte, { marginTop: 10 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.white, fontWeight: '600' }}>
                  {e.encherisseur ? e.encherisseur.nom : `Membre ${e.clientId}`}
                </Text>
                <Pastille statut={e.statut} />
              </View>
              <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '700', marginTop: 6 }}>
                {fcfa(e.montantDecote)} abandonnés
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Déposée le {dateCourte(e.dateOffre)}
              </Text>
              {e.statut === 'active' && (
                <TouchableOpacity
                  style={{ marginTop: 10 }}
                  onPress={() => agir('retirer', () => retirerEnchere(e.id), () => 'Offre retirée.')}
                >
                  <Text style={{ color: colors.warning, fontSize: 13, fontWeight: '600' }}>
                    Retirer mon offre
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        <View style={{ marginTop: 22 }}>
          <Info texte="Prendre le pot en avance se paie : la part abandonnée revient à ceux qui ont réellement cotisé. C'est le rendement de leur patience." />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

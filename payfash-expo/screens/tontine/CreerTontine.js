import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TextInput, Alert, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Segments, Info } from './composants';
import { creerGroupe, messageErreur, fcfa } from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

const TYPES = [
  { valeur: 'rotative', libelle: 'Tour seul' },
  { valeur: 'credit', libelle: 'Epargne seule' },
  { valeur: 'mixte', libelle: 'Les deux' },
];
const FREQUENCES = [
  { valeur: 'hebdomadaire', libelle: 'Chaque semaine' },
  { valeur: 'quinzaine', libelle: 'Quinzaine' },
  { valeur: 'mensuelle', libelle: 'Chaque mois' },
  { valeur: 'trimestrielle', libelle: 'Trimestre' },
];
const ORDRES = [
  { valeur: 'tirage', libelle: 'Tirage au sort' },
  { valeur: 'anciennete', libelle: 'Anciennete' },
  { valeur: 'enchere', libelle: 'Enchere' },
];

const EXPLICATION_TYPE = {
  rotative: "Le tour classique : chacun cotise, le pot entier revient a un membre par periode, jusqu'a ce que tout le monde ait mange.",
  credit: "Une caisse commune qui prete aux membres avec interet. Les interets sont partages a la fin de l'exercice.",
  mixte: 'Le tour et la caisse de credit en parallele, comme dans la plupart des njangis.',
};

const EXPLICATION_ORDRE = {
  tirage: "L'ordre de passage est tire au sort de facon verifiable au demarrage.",
  anciennete: "L'ordre suit la date d'adhesion : le premier arrive passe le premier.",
  enchere: 'A chaque tour, celui qui accepte la plus forte decote prend le pot. La decote est partagee entre les autres.',
};

export default function CreerTontine() {
  const navigation = useNavigation();
  const { rafraichir } = useTontine();

  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [montant, setMontant] = useState('');
  const [membresMax, setMembresMax] = useState('');
  const [caution, setCaution] = useState('10');
  const [type, setType] = useState('rotative');
  const [frequence, setFrequence] = useState('mensuelle');
  const [modeOrdre, setModeOrdre] = useState('tirage');
  const [envoi, setEnvoi] = useState(false);

  const nb = parseInt(membresMax, 10) || 0;
  const mnt = parseFloat(montant) || 0;
  const potEstime = nb > 1 ? mnt * (nb - 1) : 0;
  const cautionEstimee = (mnt * (parseFloat(caution) || 0)) / 100;

  const valider = async () => {
    if (!nom.trim()) return Alert.alert('Nom manquant', 'Donnez un nom a votre tontine.');
    if (!(mnt > 0)) return Alert.alert('Montant invalide', 'Indiquez la cotisation par periode.');
    if (!(nb >= 2)) return Alert.alert('Membres', 'Une tontine compte au minimum 2 membres.');

    try {
      setEnvoi(true);
      const { data } = await creerGroupe({
        nom: nom.trim(),
        description: description.trim() || undefined,
        type,
        montantParPeriode: mnt,
        frequence,
        membresMax: nb,
        modeOrdre,
        pourcentageCaution: parseFloat(caution) || 0,
      });
      await rafraichir();
      navigation.replace('SuccesTontine', {
        titre: 'Tontine creee',
        message: data.message,
        code: data.groupe.codeInvitation,
        groupeId: data.groupe.id,
      });
    } catch (e) {
      Alert.alert('Creation impossible', messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Creer une tontine</Text>
        <Text style={s.sousTitre}>Vous en serez le president</Text>

        <Text style={s.label}>Nom</Text>
        <TextInput
          style={s.champ}
          value={nom}
          onChangeText={setNom}
          placeholder="Njangi des collegues"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={s.label}>Description (facultatif)</Text>
        <TextInput
          style={[s.champ, { height: 76, textAlignVertical: 'top' }]}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Objet du groupe, regles particulieres..."
          placeholderTextColor={colors.textMuted}
        />

        <Text style={s.label}>Type de caisse</Text>
        <Segments options={TYPES} valeur={type} onChange={setType} />
        <Text style={s.aide}>{EXPLICATION_TYPE[type]}</Text>

        <Text style={s.label}>Cotisation par periode (FCFA)</Text>
        <TextInput
          style={s.champ}
          value={montant}
          onChangeText={setMontant}
          keyboardType="numeric"
          placeholder="25000"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={s.label}>Rythme</Text>
        <Segments options={FREQUENCES} valeur={frequence} onChange={setFrequence} />

        <Text style={s.label}>Nombre de membres</Text>
        <TextInput
          style={s.champ}
          value={membresMax}
          onChangeText={setMembresMax}
          keyboardType="numeric"
          placeholder="6"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={s.label}>Ordre de passage</Text>
        <Segments options={ORDRES} valeur={modeOrdre} onChange={setModeOrdre} />
        <Text style={s.aide}>{EXPLICATION_ORDRE[modeOrdre]}</Text>

        <Text style={s.label}>Caution a l'entree (% de la cotisation)</Text>
        <TextInput
          style={s.champ}
          value={caution}
          onChangeText={setCaution}
          keyboardType="numeric"
          placeholder="10"
          placeholderTextColor={colors.textMuted}
        />

        {potEstime > 0 && (
          <View style={{ marginTop: 18 }}>
            <Info
              texte={`Avec ${nb} membres, le pot vaudra ${fcfa(potEstime)} par tour : le beneficiaire ne cotise pas pour son propre tour. Caution demandee a l'entree : ${fcfa(cautionEstimee)}.`}
            />
          </View>
        )}

        <Bouton titre="Creer la tontine" icone="check" onPress={valider} charge={envoi} />
      </ScrollView>
    </SafeAreaView>
  );
}

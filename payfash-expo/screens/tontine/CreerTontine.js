import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Bouton, Segments, Info } from './composants';
import { creerGroupe, messageErreur, fcfa } from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

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

// Les memes cles que les modeles du serveur (couverture.service.js).
const COUVERTURES = [
  { valeur: 'aucune', libelle: 'Aucune' },
  { valeur: 'premiers_tours', libelle: 'Premiers tours' },
  { valeur: 'moitie', libelle: 'La moitie' },
  { valeur: 'totale', libelle: 'Totale' },
];

const EXPLICATION_COUVERTURE = {
  aucune: "Le pot est verse sans condition de garantie. Un membre qui a mange tot peut cesser de cotiser : seule sa caution protege le groupe.",
  premiers_tours:
    "Ceux qui mangent dans le premier tiers doivent avoir garanti tout ce qui leur restera a payer ; les suivants, la moitie. C'est la ou le risque est le plus grand.",
  moitie: "Chacun doit avoir garanti la moitie de ce qui lui restera a payer avant de recevoir le pot.",
  totale: "Chacun doit avoir garanti tout ce qui lui restera a payer avant de recevoir le pot. Le plus sur, le plus exigeant.",
};

// Politique de recouvrement (politiqueRecouvrement.js cote serveur).
const GRACES = [
  { valeur: 0, libelle: 'Aucun' },
  { valeur: 3, libelle: '3 jours' },
  { valeur: 7, libelle: '7 jours' },
];
const RETENUES = [
  { valeur: true, libelle: 'Oui' },
  { valeur: false, libelle: 'Non' },
];

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
  const [cautionObligatoire, setCautionObligatoire] = useState(false);
  const [couverture, setCouverture] = useState('aucune');
  const [frequence, setFrequence] = useState('mensuelle');
  const [modeOrdre, setModeOrdre] = useState('tirage');
  const [grace, setGrace] = useState(0);
  const [retenue, setRetenue] = useState(true);
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
        montantParPeriode: mnt,
        frequence,
        membresMax: nb,
        modeOrdre,
        pourcentageCaution: parseFloat(caution) || 0,
        cautionObligatoire,
        reglesCouverture: couverture,
        politiqueRecouvrement: {
          ordre: ['caution', 'garanties', ...(retenue ? ['retenue_pot'] : [])],
          delaiGraceJours: grace,
        },
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

        <Text style={s.aide}>
          Chacun cotise a chaque periode ; le pot entier revient a un membre par tour, jusqu'a ce que tout le monde
          ait ete servi.
        </Text>

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

        {/* La caution était configurable mais jamais exigée. C'est désormais
            le seul recours en argent contre un défaillant : l'appel au garant
            a été supprimé. Elle mérite d'autant moins d'être vide. */}
        <TouchableOpacity
          onPress={() => setCautionObligatoire(!cautionObligatoire)}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}
        >
          <AntDesign
            name={cautionObligatoire ? 'checksquare' : 'checksquareo'}
            size={20}
            color={cautionObligatoire ? colors.accent : colors.textMuted}
          />
          <Text style={{ color: colors.white, marginLeft: 10, flex: 1, fontSize: 14 }}>
            Exiger la caution avant le démarrage
          </Text>
        </TouchableOpacity>
        <Text style={s.aide}>
          {cautionObligatoire
            ? "La tontine refusera de démarrer tant qu'un membre actif n'aura pas déposé sa caution."
            : "La caution reste facultative : chacun peut la déposer, personne n'y est tenu."}
        </Text>

        <Text style={s.label}>Garantie exigee avant de recevoir le pot</Text>
        <Segments options={COUVERTURES} valeur={couverture} onChange={setCouverture} />
        <Text style={s.aide}>{EXPLICATION_COUVERTURE[couverture]}</Text>

        <Text style={s.label}>En cas de retard : delai avant de puiser dans les garanties</Text>
        <Segments options={GRACES} valeur={grace} onChange={setGrace} />
        <Text style={s.aide}>
          {grace > 0
            ? `Passe l'echeance, le membre a ${grace} jours pour payer lui-meme ; ensuite, sa caution puis ses garanties completent ce qui manque, et rien de plus.`
            : "A l'echeance, la caution puis les garanties du membre completent ce qui manque, et rien de plus."}
        </Text>

        <Text style={s.label}>Retenir ses dettes sur le pot du membre en retard</Text>
        <Segments options={RETENUES} valeur={retenue} onChange={setRetenue} />
        <Text style={s.aide}>
          {retenue
            ? "Si un membre doit encore quelque chose quand vient son tour, c'est preleve sur son pot et reverse a ceux qu'il a leses."
            : "Son pot lui est verse sans retenue ; tant qu'il doit quelque chose, il ne peut pas le recevoir."}
        </Text>

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

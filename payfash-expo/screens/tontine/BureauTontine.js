import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '../../theme';
import s from './styleTontine';
import { Pastille, Bouton, Chargement, Info, Ligne, Segments, Stat } from './composants';
import {
  detailGroupe, incidentsGroupe, garantiesGroupe, cautionsGroupe, amendesGroupe,
  infligerAmende, annulerAmende, libererCaution, exclureMembre,
  messageErreur, fcfa, dateCourte,
} from '../../utils/tontineApi';
import { useTontine } from '../../utils/TontineContext';

// =====================================================================
//  Espace du president : ce que le serveur lui permet deja, enfin a portee
//  de main. Chaque bloc n'apparait que si l'acte correspondant lui est
//  ouvert — le serveur reste juge, l'ecran ne fait qu'eviter de proposer
//  ce qui serait refuse.
// =====================================================================

const MOTIFS = [
  { valeur: 'retard', libelle: 'Retard' },
  { valeur: 'absence', libelle: 'Absence' },
  { valeur: 'indiscipline', libelle: 'Indiscipline' },
  { valeur: 'autre', libelle: 'Autre' },
];

const confirmer = (titre, texte, libelle) => new Promise((resoudre) => {
  Alert.alert(titre, texte, [
    { text: 'Annuler', style: 'cancel', onPress: () => resoudre(false) },
    { text: libelle, style: 'destructive', onPress: () => resoudre(true) },
  ]);
});

export default function BureauTontine() {
  const navigation = useNavigation();
  const { groupeId } = useRoute().params;
  const { monId, apresMouvement } = useTontine();

  const [groupe, setGroupe] = useState(null);
  const [actes, setActes] = useState({});
  const [incidents, setIncidents] = useState(null);
  const [couvertures, setCouvertures] = useState(null);
  const [cautions, setCautions] = useState(null);
  const [amendes, setAmendes] = useState(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [action, setAction] = useState(null);

  // Formulaires
  const [cible, setCible] = useState(null);
  const [motif, setMotif] = useState('retard');
  const [montant, setMontant] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [aExclure, setAExclure] = useState(null);
  const [motifExclusion, setMotifExclusion] = useState('');

  const charger = useCallback(async () => {
    try {
      const { data: d } = await detailGroupe(groupeId);
      const a = d.permissions?.actes || {};
      setGroupe(d.groupe);
      setActes(a);
      // Chaque lecture est independante : un refus sur l'une ne vide pas les autres.
      const lire = async (autorise, fn, set) => {
        if (!autorise) { set(null); return; }
        try { set((await fn(groupeId)).data); } catch (e) { set({ erreur: messageErreur(e) }); }
      };
      await Promise.all([
        lire(a.consulterIncidents, incidentsGroupe, setIncidents),
        lire(a.consulterGaranties, garantiesGroupe, setCouvertures),
        lire(a.consulterCautions, cautionsGroupe, setCautions),
        lire(true, amendesGroupe, setAmendes),
      ]);
    } catch (e) {
      Alert.alert('Chargement impossible', messageErreur(e));
    } finally {
      setRafraichissement(false);
    }
  }, [groupeId]);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const executer = async (cle, fn, titre) => {
    try {
      setAction(cle);
      const { data: r } = await fn();
      await apresMouvement();
      await charger();
      Alert.alert(titre, r.message || 'Operation effectuee');
      return true;
    } catch (e) {
      Alert.alert('Operation refusee', messageErreur(e));
      return false;
    } finally {
      setAction(null);
    }
  };

  if (!groupe) return <Chargement />;

  const autres = (groupe.membres || []).filter((m) => m.clientId !== monId && m.statut === 'actif');
  const nomDe = (id) => (groupe.membres || []).find((m) => m.clientId === id)?.client?.nom || `Membre ${id}`;
  const optionsMembres = autres.map((m) => ({ valeur: m.clientId, libelle: m.client?.nom || `Membre ${m.clientId}` }));

  const infliger = async () => {
    if (!cible) { Alert.alert('Membre manquant', 'Choisissez le membre concerne.'); return; }
    const m = montant.trim() ? Number(montant.trim()) : undefined;
    if (m !== undefined && !(m > 0)) { Alert.alert('Montant invalide', 'Laissez vide pour appliquer le bareme du groupe.'); return; }
    const ok = await executer('infliger', () => infligerAmende(groupeId, {
      clientId: cible, motif, montant: m, commentaire: commentaire.trim() || undefined,
    }), 'Amende infligee');
    if (ok) { setCible(null); setMontant(''); setCommentaire(''); }
  };

  const annuler = async (a) => {
    if (!(await confirmer('Annuler cette amende ?', `${fcfa(a.montant)} — ${a.client?.nom || ''}. Elle ne sera plus due.`, 'Annuler l\'amende'))) return;
    executer(`annuler-${a.id}`, () => annulerAmende(a.id, 'Annulee par le president'), 'Amende annulee');
  };

  const liberer = async (c) => {
    if (!(await confirmer('Liberer cette caution ?', `${fcfa(c.disponible)} reviendront a ${c.caution.client?.nom || 'ce membre'}. Le serveur refuse si une dette reste en cours.`, 'Liberer'))) return;
    executer(`caution-${c.caution.id}`, () => libererCaution(c.caution.id), 'Caution liberee');
  };

  const exclure = async () => {
    if (!motifExclusion.trim()) { Alert.alert('Motif manquant', "Le membre exclu doit savoir pourquoi."); return; }
    if (!(await confirmer(`Exclure ${nomDe(aExclure)} ?`,
      "Il sort de la rotation. Ses cotisations encore ouvertes deviennent des impayes, recouvres selon le reglement du groupe (caution, garanties). Ses garanties restent bloquees tant qu'il doit quelque chose.",
      'Exclure'))) return;
    const ok = await executer('exclure', () => exclureMembre(groupeId, aExclure, motifExclusion.trim()), 'Membre exclu');
    if (ok) { setAExclure(null); setMotifExclusion(''); }
  };

  const erreurBloc = (d) => (d && d.erreur ? <Text style={s.aide}>{d.erreur}</Text> : null);
  const incOuverts = incidents?.incidents?.filter((i) => i.statut === 'ouvert') || [];

  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={s.contenu}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={() => { setRafraichissement(true); charger(); }} tintColor={colors.white} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <AntDesign name="arrow-left" size={22} color={colors.white} />
        </TouchableOpacity>

        <Text style={s.titre}>Espace du president</Text>
        <Text style={s.sousTitre}>{groupe.nom} · ce que vous pouvez suivre et decider pour le groupe</Text>

        {/* --- Echeances non couvertes ------------------------------------ */}
        {incidents && (
          <>
            <Text style={s.section}>Echeances non couvertes</Text>
            {erreurBloc(incidents)}
            {!incidents.erreur && (
              <>
                <View style={s.stats}>
                  <Stat label="A regler" valeur={incOuverts.length} />
                  <Stat label="Reste du" valeur={fcfa(incOuverts.reduce((t, i) => t + i.resteDu, 0))} />
                </View>
                {incOuverts.length === 0 ? (
                  <Info texte="Aucune echeance en souffrance : la caution et les garanties ont tout couvert, ou personne n'est en retard." />
                ) : incOuverts.map((i) => (
                  <View key={i.id} style={s.carte}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[s.carteTitre, { flex: 1 }]}>{i.membre || nomDe(i.clientId)}</Text>
                      <Pastille statut={i.statut} />
                    </View>
                    <Text style={s.carteMontant}>{fcfa(i.resteDu)}</Text>
                    <Text style={s.carteInfo}>Depuis le {dateCourte(i.ouvertLe)} · sur {fcfa(i.montantInitial)} restants apres recouvrement</Text>
                  </View>
                ))}
                {incidents.politique?.description ? <Info texte={incidents.politique.description} /> : null}
              </>
            )}
          </>
        )}

        {/* --- Couverture des membres ------------------------------------- */}
        {couvertures && (
          <>
            <Text style={s.section}>Couverture des membres</Text>
            {erreurBloc(couvertures)}
            {(couvertures.membres || []).map((m) => (
              <View key={m.clientId} style={s.carte}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[s.carteTitre, { flex: 1 }]}>
                    {m.tour ? `${m.tour}. ` : ''}{m.nom || `Membre ${m.clientId}`}{m.dejaServi ? ' · servi' : ''}
                  </Text>
                  <Text style={{ color: m.suffisant ? colors.success : colors.warning, fontWeight: '700' }}>{m.couverture} %</Text>
                </View>
                <Ligne label="Reste a payer" valeur={fcfa(m.exposition)} />
                <Ligne label="Couvert (caution et garanties)" valeur={fcfa(m.couvert)} dernier={!(m.tauxExige > 0)} />
                {m.tauxExige > 0 && (
                  <Ligne
                    label={`Exige : ${m.tauxExige} %`}
                    valeur={m.suffisant ? 'En regle' : `Manque ${fcfa(m.manque)}`}
                    couleur={m.suffisant ? colors.success : colors.warning}
                    dernier
                  />
                )}
              </View>
            ))}
            {couvertures.membres && <Info texte="Vous voyez les montants, jamais d'ou ils viennent : l'epargne ou le projet d'un membre reste son affaire." />}
          </>
        )}

        {/* --- Cautions ---------------------------------------------------- */}
        {cautions && (
          <>
            <Text style={s.section}>Cautions</Text>
            {erreurBloc(cautions)}
            {!cautions.erreur && (
              <>
                <Text style={s.aide}>{`Sequestre du groupe : ${fcfa(cautions.totalSequestre)}`}</Text>
                {(cautions.cautions || []).map((c) => (
                  <View key={c.caution.id} style={s.carte}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[s.carteTitre, { flex: 1 }]}>{c.caution.client?.nom || `Membre ${c.caution.clientId}`}</Text>
                      <Pastille statut={c.caution.statut} />
                    </View>
                    <Text style={s.carteInfo}>{`${fcfa(c.disponible)} disponibles sur ${fcfa(c.caution.montantBloque)} deposes`}</Text>
                    {actes.libererCaution && c.caution.statut !== 'liberee' && (
                      <Bouton titre="Liberer" icone="unlock" variante="secondaire"
                        charge={action === `caution-${c.caution.id}`} onPress={() => liberer(c)} />
                    )}
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* --- Amendes ----------------------------------------------------- */}
        <Text style={s.section}>Amendes</Text>
        {erreurBloc(amendes)}
        {amendes && !amendes.erreur && (
          <>
            <Text style={s.aide}>{`Dues dans le groupe : ${fcfa(amendes.totalDu)}`}</Text>
            {(amendes.amendes || []).slice(0, 20).map((a) => (
              <View key={a.id} style={s.carte}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[s.carteTitre, { flex: 1 }]}>{a.client?.nom || `Membre ${a.clientId}`}</Text>
                  <Pastille statut={a.statut} />
                </View>
                <Text style={s.carteInfo}>
                  {`${fcfa(a.montant)} · ${a.motif} · ${dateCourte(a.createdAt)}${a.auteur ? ` · par ${a.auteur.nom}` : ' · levee a l\'echeance'}`}
                </Text>
                {actes.annulerAmende && a.statut === 'due' && (
                  <Bouton titre="Annuler" icone="close" variante="secondaire"
                    charge={action === `annuler-${a.id}`} onPress={() => annuler(a)} />
                )}
              </View>
            ))}
          </>
        )}

        {actes.infligerAmende && optionsMembres.length > 0 && (
          <View style={s.carte}>
            <Text style={s.carteTitre}>Infliger une amende</Text>
            <Text style={s.label}>Membre</Text>
            <Segments options={optionsMembres} valeur={cible} onChange={setCible} />
            <Text style={s.label}>Motif</Text>
            <Segments options={MOTIFS} valeur={motif} onChange={setMotif} />
            <Text style={s.label}>Montant (FCFA, vide = bareme du groupe)</Text>
            <TextInput style={s.champ} value={montant} onChangeText={setMontant} keyboardType="numeric"
              placeholder="Bareme" placeholderTextColor={colors.textMuted} />
            <Text style={s.label}>Commentaire (facultatif)</Text>
            <TextInput style={s.champ} value={commentaire} onChangeText={setCommentaire}
              placeholder="Visible par le membre" placeholderTextColor={colors.textMuted} />
            <Bouton titre="Infliger l'amende" icone="exclamation-circle" variante="danger"
              charge={action === 'infliger'} onPress={infliger} />
          </View>
        )}

        {/* --- Exclusion --------------------------------------------------- */}
        {actes.exclureMembre && optionsMembres.length > 0 && (
          <>
            <Text style={s.section}>Exclure un membre</Text>
            <View style={s.carte}>
              <Segments options={optionsMembres} valeur={aExclure} onChange={setAExclure} />
              {aExclure && (
                <>
                  <Text style={s.label}>Motif (communique au membre)</Text>
                  <TextInput style={[s.champ, { height: 76, textAlignVertical: 'top' }]} value={motifExclusion}
                    onChangeText={setMotifExclusion} multiline
                    placeholder="Retards repetes, decision du groupe..." placeholderTextColor={colors.textMuted} />
                  <Bouton titre={`Exclure ${nomDe(aExclure)}`} icone="user-delete" variante="danger"
                    charge={action === 'exclure'} onPress={exclure} />
                </>
              )}
            </View>
            <Info texte="L'exclusion est une decision grave : un vote du groupe est souvent preferable (Votes et decisions)." />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

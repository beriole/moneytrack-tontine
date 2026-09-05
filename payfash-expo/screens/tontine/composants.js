import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme';
import s, { statutCouleur, libelleStatut } from './styleTontine';

// =====================================================================
//  Briques d'interface partagees par les ecrans tontine.
// =====================================================================

/** Pastille de statut : la couleur porte l'information autant que le mot. */
export const Pastille = ({ statut }) => (
  <View style={[s.pastille, { backgroundColor: statutCouleur[statut] || colors.textMuted }]}>
    <Text style={s.pastilleTexte}>{libelleStatut[statut] || statut}</Text>
  </View>
);

export const Stat = ({ label, valeur }) => (
  <View style={s.stat}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={s.statValeur}>{valeur}</Text>
  </View>
);

export const Ligne = ({ label, valeur, couleur, dernier }) => (
  <View style={[s.ligne, !dernier && s.ligneSeparee]}>
    <Text style={s.ligneLabel}>{label}</Text>
    <Text style={[s.ligneValeur, couleur && { color: couleur }]}>{valeur}</Text>
  </View>
);

export const Bouton = ({ titre, onPress, icone, variante, inactif, charge }) => (
  <TouchableOpacity
    style={[
      s.bouton,
      variante === 'secondaire' && s.boutonSecondaire,
      variante === 'danger' && s.boutonDanger,
      variante === 'success' && s.boutonSuccess,
      (inactif || charge) && s.boutonInactif,
    ]}
    onPress={onPress}
    disabled={inactif || charge}
    activeOpacity={0.8}
  >
    {charge ? (
      <ActivityIndicator color={colors.white} size="small" />
    ) : (
      <>
        {icone ? <AntDesign name={icone} size={17} color={colors.white} style={{ marginRight: 8 }} /> : null}
        <Text style={s.boutonTexte}>{titre}</Text>
      </>
    )}
  </TouchableOpacity>
);

export const Chargement = () => (
  <View style={s.centre}>
    <ActivityIndicator size="large" color={colors.accent} />
  </View>
);

export const Vide = ({ icone = 'account-group-outline', texte }) => (
  <View style={s.vide}>
    <MaterialCommunityIcons name={icone} size={54} color={colors.textMuted} />
    <Text style={s.videTexte}>{texte}</Text>
  </View>
);

/** Bandeau rouge : une dette doit se voir avant tout le reste. */
export const Alerte = ({ titre, texte }) => (
  <View style={s.alerte}>
    <Text style={s.alerteTitre}>{titre}</Text>
    <Text style={s.alerteTexte}>{texte}</Text>
  </View>
);

export const Info = ({ texte }) => (
  <View style={s.info}>
    <Text style={s.infoTexte}>{texte}</Text>
  </View>
);

/** Groupe de choix exclusifs, plus lisible qu'un Picker sur mobile. */
export const Segments = ({ options, valeur, onChange }) => (
  <View style={s.segments}>
    {options.map((o) => (
      <TouchableOpacity
        key={o.valeur}
        style={[s.segment, valeur === o.valeur && s.segmentActif]}
        onPress={() => onChange(o.valeur)}
        activeOpacity={0.8}
      >
        <Text style={[s.segmentTexte, valeur === o.valeur && s.segmentTexteActif]}>{o.libelle}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

/** Barre d'avancement : combien de cotisations sur combien attendues. */
export const Progression = ({ valeur, total }) => {
  const ratio = total > 0 ? Math.min(1, valeur / total) : 0;
  return (
    <View style={{ height: 7, backgroundColor: '#332C5C', borderRadius: 4, overflow: 'hidden', marginTop: 10 }}>
      <View
        style={{
          height: '100%',
          width: `${ratio * 100}%`,
          backgroundColor: ratio >= 1 ? colors.success : colors.accent,
          borderRadius: 4,
        }}
      />
    </View>
  );
};

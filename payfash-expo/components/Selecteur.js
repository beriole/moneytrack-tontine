import React, { useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme';

// =====================================================================
//  Champ de selection.
//
//  Remplace le Picker natif : depuis le passage a Expo 54, il s'ouvrait
//  mal et son texte se perdait sur fond sombre — la couleur d'un
//  Picker.Item ne se regle pas sur Android. Ici, tout est dessine par
//  l'application : meme rendu sur Android, iOS et web, et le choix
//  courant se lit toujours.
//
//    <Selecteur
//      valeur={source}
//      options={[{ valeur: 'courant', libelle: 'Portefeuille courant' }]}
//      onChange={setSource}
//      placeholder="-- Choisir --"
//    />
// =====================================================================

export default function Selecteur({
  valeur, options = [], onChange, placeholder = '— Choisir —',
  titre = 'Choisir', style, sombre = true, inactif = false,
}) {
  const [ouvert, setOuvert] = useState(false);
  const choisi = options.find((o) => String(o.valeur) === String(valeur));
  const texte = choisi ? choisi.libelle : placeholder;

  const fond = sombre ? '#211C3A' : '#FFFFFF';
  const encre = sombre ? colors.white : '#111827';
  const attenue = sombre ? '#8B92A8' : '#6B7280';

  return (
    <>
      <TouchableOpacity
        style={[s.champ, { backgroundColor: fond, opacity: inactif ? 0.5 : 1 }, style]}
        onPress={() => !inactif && setOuvert(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${titre} : ${texte}`}
      >
        <Text style={[s.texte, { color: choisi ? encre : attenue }]} numberOfLines={1}>{texte}</Text>
        <MaterialCommunityIcons name="chevron-down" size={22} color={attenue} />
      </TouchableOpacity>

      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={() => setOuvert(false)}>
        {/* Toucher a cote ferme : c'est le geste attendu, et il evite de
            rester bloque si la liste est vide. */}
        <Pressable style={s.voile} onPress={() => setOuvert(false)}>
          <Pressable style={s.feuille} onPress={(e) => e.stopPropagation()}>
            <Text style={s.titre}>{titre}</Text>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {options.length === 0 ? (
                <Text style={s.vide}>Aucun choix disponible.</Text>
              ) : options.map((o) => {
                const actif = String(o.valeur) === String(valeur);
                return (
                  <TouchableOpacity
                    key={String(o.valeur)}
                    style={[s.ligne, actif && s.ligneActive]}
                    onPress={() => { onChange(o.valeur); setOuvert(false); }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.ligneTexte, actif && { color: colors.white, fontWeight: '700' }]}>{o.libelle}</Text>
                      {o.detail ? <Text style={s.ligneDetail}>{o.detail}</Text> : null}
                    </View>
                    {actif && <MaterialCommunityIcons name="check" size={18} color={colors.accentLight} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={s.fermer} onPress={() => setOuvert(false)}>
              <Text style={s.fermerTexte}>Fermer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  champ: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 15,
    borderWidth: 1, borderColor: '#332C5C',
  },
  texte: { fontSize: 15, flex: 1, marginRight: 10 },
  voile: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  feuille: { backgroundColor: '#211C3A', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#332C5C' },
  titre: { color: colors.white, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  ligne: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
    backgroundColor: '#161427',
  },
  ligneActive: { backgroundColor: colors.primary },
  ligneTexte: { color: '#E5E7EB', fontSize: 15 },
  ligneDetail: { color: '#8B92A8', fontSize: 12, marginTop: 2 },
  vide: { color: '#8B92A8', fontSize: 14, paddingVertical: 14, textAlign: 'center' },
  fermer: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  fermerTexte: { color: '#8B92A8', fontSize: 14, fontWeight: '600' },
});

import { StyleSheet } from 'react-native';
import { colors } from '../../theme';

// =====================================================================
//  Styles communs au module tontine.
//
//  Toutes les couleurs viennent de theme.js : changer la palette du
//  projet suffit a repeindre le module. Les nuances de fond de carte
//  (#211C3A, #2A2550) reprennent celles deja utilisees par les ecrans
//  Budget et Projet, pour que la tontine ne detonne pas.
// =====================================================================

export const fond = colors.base;          // #161427
export const carte = '#211C3A';
export const carteHaute = '#2A2550';
export const bordure = '#332C5C';

export const statutCouleur = {
  // Groupes
  en_attente: colors.warning,
  actif: colors.success,
  termine: colors.textMuted,
  suspendu: colors.danger,
  // Cotisations et echeances
  attendue: colors.textMuted,
  attendu: colors.textMuted,
  partielle: colors.warning,
  payee: colors.success,
  paye: colors.success,
  en_retard: colors.danger,
  impayee: colors.danger,
  // Amendes
  due: colors.danger,
  annulee: colors.textMuted,
  // Cycles
  complete: colors.success,
  en_defaut: colors.danger,
  // Votes
  approuve: colors.success,
  rejete: colors.danger,
  egalite: colors.warning,
  // Credits
  approuvee: colors.success,
  decaissee: colors.accent,
  remboursee: colors.success,
  rejetee: colors.danger,
};

export const libelleStatut = {
  en_attente: 'En attente',
  actif: 'Actif',
  termine: 'Termine',
  suspendu: 'Suspendu',
  attendue: 'A payer',
  attendu: 'A payer',
  partielle: 'Partielle',
  payee: 'Payee',
  paye: 'Payee',
  en_retard: 'En retard',
  impayee: 'Impayee',
  due: 'Due',
  annulee: 'Annulee',
  complete: 'Verse',
  en_defaut: 'En defaut',
  approuve: 'Approuve',
  rejete: 'Rejete',
  egalite: 'Egalite',
  approuvee: 'Approuve',
  decaissee: 'Decaisse',
  remboursee: 'Rembourse',
  rejetee: 'Rejete',
};

export default StyleSheet.create({
  page: { flex: 1, backgroundColor: fond },
  contenu: { padding: 20, paddingBottom: 60 },

  // En-tetes
  titre: { color: colors.white, fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  sousTitre: { color: colors.textMuted, fontSize: 14, marginBottom: 20 },
  section: { color: colors.white, fontSize: 17, fontWeight: 'bold', marginTop: 8, marginBottom: 12 },

  // Cartes
  carte: { backgroundColor: carte, borderRadius: 16, padding: 18, marginBottom: 14 },
  carteTitre: { color: colors.white, fontSize: 17, fontWeight: 'bold', marginBottom: 6 },
  carteMontant: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  carteInfo: { color: colors.textMuted, fontSize: 13, marginTop: 4 },

  // Bandeau de statistiques
  stats: { flexDirection: 'row', marginBottom: 18, marginHorizontal: -5 },
  stat: { flex: 1, backgroundColor: carteHaute, marginHorizontal: 5, padding: 14, borderRadius: 12, alignItems: 'center' },
  statLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4, textAlign: 'center' },
  statValeur: { color: colors.white, fontSize: 16, fontWeight: 'bold', textAlign: 'center' },

  // Pastilles de statut
  pastille: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  pastilleTexte: { color: colors.white, fontSize: 11, fontWeight: 'bold' },

  // Lignes cle / valeur
  ligne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  ligneSeparee: { borderBottomWidth: 1, borderBottomColor: bordure },
  ligneLabel: { color: colors.textMuted, fontSize: 14, flexShrink: 1, paddingRight: 10 },
  ligneValeur: { color: colors.white, fontSize: 14, fontWeight: '600' },

  // Formulaires
  label: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: 14 },
  champ: {
    backgroundColor: carte, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    color: colors.white, fontSize: 15, borderWidth: 1, borderColor: bordure,
  },
  aide: { color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 17 },

  // Choix (segments)
  segments: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  segment: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, marginRight: 8, marginTop: 8,
    backgroundColor: carte, borderWidth: 1, borderColor: bordure,
  },
  segmentActif: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentTexte: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  segmentTexteActif: { color: colors.white },

  // Boutons
  bouton: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.primary, padding: 15, borderRadius: 12, marginTop: 18,
  },
  boutonSecondaire: { backgroundColor: carteHaute },
  boutonDanger: { backgroundColor: colors.danger },
  boutonSuccess: { backgroundColor: colors.success },
  boutonInactif: { opacity: 0.45 },
  boutonTexte: { color: colors.white, fontWeight: 'bold', fontSize: 15 },

  // Etats vides et alertes
  vide: { alignItems: 'center', paddingVertical: 44 },
  videTexte: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 20 },

  alerte: {
    backgroundColor: 'rgba(244, 63, 94, 0.13)', borderLeftWidth: 3, borderLeftColor: colors.danger,
    borderRadius: 10, padding: 14, marginBottom: 16,
  },
  alerteTitre: { color: colors.danger, fontWeight: 'bold', fontSize: 14, marginBottom: 3 },
  alerteTexte: { color: colors.white, fontSize: 13, lineHeight: 18 },

  info: {
    backgroundColor: 'rgba(99, 102, 241, 0.13)', borderLeftWidth: 3, borderLeftColor: colors.accent,
    borderRadius: 10, padding: 14, marginBottom: 16,
  },
  infoTexte: { color: colors.white, fontSize: 13, lineHeight: 18 },

  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: fond },
});

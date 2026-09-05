// =====================================================================
//  PayFash — Thème centralisé (palette Violet / Indigo premium)
//  Le design reste identique à l'original ; seules les couleurs changent.
//  Mapping depuis l'ancienne palette :
//    #0D1B2A (navy)      -> #161427  (base/header/tabbar)
//    #2B4794 (primaire)  -> #4F46E5  (indigo)
//    #3B82F6 (accent)    -> #6366F1  (indigo-violet)
//    #60A5FA (accent +)  -> #818CF8
//    #1E90FF / #00C49A (dégradé) -> #4F46E5 / #8B5CF6
//    verts / succès / danger : conservés
// =====================================================================

export const colors = {
  // Fonds
  base: '#161427',        // navy/indigo profond (ex #0D1B2A)
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4FB',

  // Couleur de marque
  primary: '#4F46E5',     // indigo (ex #2B4794)
  primaryDark: '#3730A3',
  accent: '#6366F1',      // indigo-violet (ex #3B82F6)
  accentLight: '#818CF8', // (ex #60A5FA)
  violet: '#8B5CF6',
  violetLight: '#A78BFA',

  // États
  success: '#10B981',
  successLight: '#34D399',
  danger: '#F43F5E',
  warning: '#F59E0B',
  warningLight: '#FBBF24',

  // Neutres
  textDark: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  white: '#FFFFFF',
  black: '#000000',
};

// Dégradés réutilisables
export const gradients = {
  brand: ['#4F46E5', '#8B5CF6'],   // ex ['#1E90FF', '#00C49A']
  courant: ['#6366F1', '#818CF8'], // ex ['#3B82F6', '#60A5FA']
  projet: ['#8B5CF6', '#A78BFA'],
  epargne: ['#10B981', '#34D399'],
  neutral: ['#6B7280', '#9CA3AF'],
};

export default { colors, gradients };

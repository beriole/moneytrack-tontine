import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle, Line } from 'react-native-svg';
import { colors } from '../theme';

// =====================================================================
//  Courbe de tresorerie prevue.
//
//  Ce n'est pas un ornement : c'est la seule representation qui repond a
//  « est-ce que je tiens jusqu'a mon tour ? ». On y lit le solde projete
//  jour apres jour, le point bas, et le moment ou le tour renfloue.
//
//  Le zero est trace des que la courbe passe dessous : c'est la seule
//  ligne qui compte vraiment.
// =====================================================================

export default function CourbeTresorerie({
  evenements = [],
  soldeDepart = 0,
  hauteur = 92,
  largeur = 320,
}) {
  if (!evenements.length) {
    return (
      <View style={{ height: hauteur, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Aucun mouvement prevu sur la periode
        </Text>
      </View>
    );
  }

  // Points : le solde de depart, puis le solde apres chaque evenement.
  const points = [soldeDepart, ...evenements.map((e) => e.soldeApres)];
  const max = Math.max(...points, 0);
  const min = Math.min(...points, 0);
  const amplitude = max - min || 1;

  const pad = 6;
  const h = hauteur - pad * 2;
  const x = (i) => (i / Math.max(1, points.length - 1)) * largeur;
  const y = (v) => pad + h - ((v - min) / amplitude) * h;

  const ligne = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const aire = `${ligne} L${largeur},${hauteur} L0,${hauteur} Z`;

  // Le point bas, s'il est sous zero, est ce qu'il faut voir en premier.
  const iBas = points.indexOf(Math.min(...points));
  const casse = points.some((v) => v < 0);
  const teinte = casse ? colors.danger : colors.accent;

  return (
    <Svg width={largeur} height={hauteur}>
      <Defs>
        <SvgGradient id="remplissage" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={teinte} stopOpacity="0.34" />
          <Stop offset="1" stopColor={teinte} stopOpacity="0.02" />
        </SvgGradient>
      </Defs>

      <Path d={aire} fill="url(#remplissage)" />
      <Path d={ligne} fill="none" stroke={teinte} strokeWidth="2" strokeLinejoin="round" />

      {/* Le zero n'apparait que s'il est franchi : sinon il n'apprend rien. */}
      {min < 0 && (
        <Line x1="0" y1={y(0)} x2={largeur} y2={y(0)} stroke={colors.danger} strokeWidth="1" strokeDasharray="3 3" />
      )}

      {/* Les entrees d'argent — les tours — meritent d'etre reperables. */}
      {evenements.map((e, i) =>
        e.sens === 'entree' ? (
          <Circle key={i} cx={x(i + 1)} cy={y(e.soldeApres)} r="3.5" fill={colors.success} />
        ) : null
      )}

      <Circle cx={x(iBas)} cy={y(points[iBas])} r="3" fill={casse ? colors.danger : colors.accentLight} />
    </Svg>
  );
}

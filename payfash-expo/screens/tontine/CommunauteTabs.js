import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { colors } from '../../theme';
import Tontines from './Tontines';
import MarketPlace from '../others/MarketPlace';

// La barre du bas comptait deja 5 onglets : un sixieme la sature.
// Tontine et Marketplace partagent donc un onglet « Communaute », sur le
// meme motif que BudgetProjetTabs.
const Tab = createMaterialTopTabNavigator();

export default function CommunauteTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: { backgroundColor: colors.base },
        tabBarIndicatorStyle: { backgroundColor: colors.accent },
        tabBarLabelStyle: { color: colors.white, fontWeight: 'bold' },
      }}
    >
      <Tab.Screen name="Tontines" component={Tontines} />
      <Tab.Screen name="Souscrire" component={MarketPlace} />
    </Tab.Navigator>
  );
}

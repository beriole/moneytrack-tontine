import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import Stack from './Stack';
import { WalletProvider } from './utils/WalletContext';
import { TontineProvider } from './utils/TontineContext';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <WalletProvider>
          {/* TontineProvider est imbrique DANS WalletProvider : il lit son
              contexte pour rafraichir le solde apres chaque mouvement. */}
          <TontineProvider>
            <NavigationContainer>
              <StatusBar style="light" />
              <Stack />
              <Toast />
            </NavigationContainer>
          </TontineProvider>
        </WalletProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

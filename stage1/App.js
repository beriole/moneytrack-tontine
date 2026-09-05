import { View, Text } from 'react-native'
import React from 'react'
import { NavigationContainer } from '@react-navigation/native';
import Stack from './Stack'
import Toast from "react-native-toast-message";
import { WalletProvider } from './utils/WalletContext';
export default function App() {

  return (
    <WalletProvider>
            <NavigationContainer>
                 <Stack />
                 <Toast/>
          </NavigationContainer>
    </WalletProvider>

  )
}
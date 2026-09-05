import { View, Image, TextInput } from 'react-native'
import React, { useEffect, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import Style from '../../components/style/style'
import MapView, { Marker } from 'react-native-maps'
import * as Location from 'expo-location'

export default function Map() {
  const [location, setLocation] = useState(null);
  const [region, setRegion] = useState({
    latitude: 7.365302,
    longitude: 12.343439,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  useEffect(() => {
    const getLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('permission refusée');
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const { latitude, longitude } = position.coords;
        setLocation({ latitude, longitude });
        setRegion((prev) => ({ ...prev, latitude, longitude }));
      } catch (error) {
        console.warn(error);
      }
    };
    getLocation();
  }, []);

  return (
    <SafeAreaView style={Style.container}>
      <View>
        <TextInput
          placeholder='rechercher un livreur'
          placeholderTextColor='black'
          style={Style.input}
        />
      </View>
      <MapView style={Style.container} region={region}>
        {location && (
          <Marker
            coordinate={location}
            title='Ma position'
            description='Vous êtes ici'
            pinColor='#4F46E5'
          />
        )}
        <Marker
          coordinate={{ latitude: 7.365302, longitude: 12.343439 }}
          title='beriole'
          description='conducteur de taxi depuis 20Ans'
        >
          <Image style={Style.image_map} source={require('../../assets/images/marker.png')} />
        </Marker>
        <Marker
          coordinate={{ latitude: 6.365302, longitude: 12.343439 }}
          title='beriole'
          description='conducteur de taxi depuis 20Ans'
        >
          <Image style={Style.image_map} source={require('../../assets/images/marker.png')} />
        </Marker>
      </MapView>
    </SafeAreaView>
  )
}

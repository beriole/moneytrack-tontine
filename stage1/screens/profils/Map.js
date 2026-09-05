import { View, Text,Image, PermissionsAndroid, Platform, TextInput } from 'react-native'
import React, { useEffect, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import Style from '../../components/style/style'
import MapView, { Marker } from 'react-native-maps'
import Geolocation from '@react-native-community/geolocation'

export default function Map() {
    const [location,setLocation]=useState({longitude:null,latitude:null});
    useEffect(()=>{
        const requestLocationPermition= async()=>{
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,{
                    title:'permission de localisation',
                    message:'cette application a besoin de votre localisation pour gerer vos transaction de maniere securise',
                    buttonNeutral:'plustart',
                    buttonPositive:'okay',
                    buttonNegative:'non'
                })
                if(granted === PermissionsAndroid.RESULTS.GRANTED){
                    console.log('permission accorder')
                }else{
                    console.log('permission refuse')
                }
            } catch (error) {
                console.warn(error);
            }
        }
        if(Platform.OS==='android'){
             requestLocationPermition();
        }
        const geolocation=()=>{
            Geolocation.getCurrentPosition(
                position => {
                    console.log('debut')
                    const {longitude,latitude}=position.coords;
                    setLocation({longitude,latitude})
                    console.log(longitude)
                },
                error=>{
                    console.log(error);
                },
                {
                    enableHighAccuracy:true,
                    timeout:15000,
                    maximumAge:1000
                }
            )
        }
        geolocation();
    },[])
    
  return (
    <SafeAreaView style={Style.container}>
        <View>
            <TextInput placeholder='rechercher un livreur' placeholderTextColor='black' style={Style.input}/>
        </View>
        <MapView style={Style.container} initialRegion={{
            latitude:7.365302,
            longitude:12.343439,
            latitudeDelta:0.0922,
            longitudeDelta:0.0421,

        }}>
            <Marker coordinate={{latitude:7.365302,longitude:12.343439}} title='beriole' description='conducteur de taxi depuis 20Ans '>
                <Image style={Style.image_map} source={require('../../assets/images/marker.png')}/>
            </Marker>
            <Marker coordinate={{latitude:6.365302,longitude:12.343439}} title='beriole' description='conducteur de taxi depuis 20Ans '>
                <Image style={Style.image_map} source={require('../../assets/images/marker.png')}/>
            </Marker>
        </MapView>
    </SafeAreaView>
  )
}
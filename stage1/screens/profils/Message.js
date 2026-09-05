import { View, Text, SafeAreaView,TouchableOpacity } from 'react-native'
import React from 'react'
import { ScrollView } from 'react-native-gesture-handler'
import { useNavigation } from '@react-navigation/native'
import AntDesign from 'react-native-vector-icons/AntDesign';

export default function Message() {
  const Navigation=useNavigation();
  return (
    <SafeAreaView style={{backgroundColor:'#0D1B2A',flex:1}}>
       <ScrollView>
          <TouchableOpacity  onPress={()=>Navigation.goBack()} style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-start',gap:9,marginBottom:18,marginLeft:12}}>
            <AntDesign name='arrowleft' size={26} color={'white'}/>
            <Text style={{color:'white',fontWeight:'bold',fontSize:26}}>Retour</Text>
          </TouchableOpacity>
          <View style={{flexDirection:'row',justifyContent:'center',alignItems:'center'}}> 
              <TouchableOpacity>
                  <Text style={{color:'white',fontWeight:'bold',fontSize:25}}>
                    Sommaire
                  </Text>
              </TouchableOpacity>
              <TouchableOpacity>
                  <Text style={{color:'white',fontWeight:'bold',fontSize:25}}>
                    planification
                  </Text>
              </TouchableOpacity>
          </View>
       </ScrollView>
    </SafeAreaView>
  )
}
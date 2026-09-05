import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Home from './screens/profils/Home';
import Message from './screens/profils/Message';
import AntDesign from 'react-native-vector-icons/AntDesign';
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import FontAwesome5 from "react-native-vector-icons/FontAwesome5";
import Profile from './screens/profils/Profile';
import { StyleSheet } from 'react-native';
import Epargne from './screens/others/Epargne';
import MarketPlace from './screens/others/MarketPlace';
import BudgetProjetTabs from './screens/others/BudgetProjetTabs';
import ChatbotScreen from './screens/others/ChatbotScreen';
export default function Maintabs(){
  const tab= createBottomTabNavigator();
return(
    <tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: "#2B4794", // bleu logo
        tabBarInactiveTintColor: "#CCC", // gris clair
      }}
    >
        <tab.Screen 
        name='Home' 
        component={Home} 
        options={{
          tabBarLabel:'Portefeuille',
          tabBarIcon:({color,size})=><MaterialCommunityIcons name="wallet" size={size} color={color} />}}/>
        <tab.Screen 
        name='BudgetProjetTabs' 
        component={BudgetProjetTabs} 
        options={{
          tabBarLabel:'Budget&Projet',
          tabBarIcon:({color,size})=><FontAwesome5 name="chart-pie" size={size} color={color}/>}}/>
        <tab.Screen 
        name='Epargne' 
        component={Epargne} 
        options={{
          tabBarLabel:'Epargne',
          tabBarIcon:({color,size})=><FontAwesome5 name="piggy-bank" size={size} color={color} />}}/>
          <tab.Screen 
        name='chat' 
        component={ChatbotScreen} 
        options={{
          tabBarLabel:'IA service',
          tabBarIcon:({color,size})=><AntDesign name="wechat" size={size} color={color} solid />}}/>
        <tab.Screen 
        name='Souscrire' 
        component={MarketPlace} 
        options={{
          tabBarLabel:'Souscrire',
          tabBarIcon:({color,size})=><MaterialCommunityIcons name="shopping" size={size} color={color} />}}/>

    </tab.Navigator>
  )
}  
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#0D1B2A",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    borderTopColor:'#0D1B2A',
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    paddingBottom: 8,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 5,
    elevation: 10,
  },
});
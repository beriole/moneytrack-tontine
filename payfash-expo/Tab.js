import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Home from './screens/profils/Home';
import Message from './screens/profils/Message';
import { AntDesign } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FontAwesome5 } from '@expo/vector-icons';
import Profile from './screens/profils/Profile';
import { StyleSheet } from 'react-native';
import Epargne from './screens/others/Epargne';
// MarketPlace est desormais rendu par CommunauteTabs
import CommunauteTabs from './screens/tontine/CommunauteTabs';
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
        tabBarActiveTintColor: "#4F46E5", // bleu logo
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
        {/* Tontine + Marketplace partagent un onglet : la barre etait deja
            a 5 entrees, un sixieme l'aurait saturee. */}
        <tab.Screen
        name='Communaute'
        component={CommunauteTabs}
        options={{
          tabBarLabel:'Tontine',
          tabBarIcon:({color,size})=><MaterialCommunityIcons name="account-group" size={size} color={color} />}}/>

    </tab.Navigator>
  )
}  
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#161427",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    borderTopColor:'#161427',
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
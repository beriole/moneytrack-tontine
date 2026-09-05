import {createStackNavigator} from '@react-navigation/stack';
import HomeScreen from './screens/onboarding/HomeScreen';
import Register from './screens/inscription/Register';
import Login from './screens/inscription/Login';
import profile from './screens/profils/Profile';
import Notification from './screens/profils/Notification';
import Maintabs from './Tab'
import VerifiedOtp from './screens/inscription/VerifiedOtp';
import SucceSign from './screens/inscription/SucceSign';
import ResetPassword from './screens/inscription/ResetPassword';
import SuccesReset from './screens/inscription/SuccesReset';
import Forgot from './screens/inscription/Forgot';
import Transactions from './screens/others/Transactions';
import Recharge from './screens/others/Recharge';
import SuccessRecharge from './screens/others/succesRecharge';
import Depense from './screens/others/Depense';
import SuccesDepense from './screens/others/SuccesDepense';
import TransfertFonds from './screens/others/TransfertFonds';
import SuccesTransfert from './screens/others/SuccesTransfert';
import DetailEpargne from './screens/others/DetailEpargne';
import AjoutEpargne from './screens/others/AjoutEpargne';
import SuccesAjoutEpargne from './screens/others/succesAjoutEpargne';
import PlanDetails from './screens/others/detailPlan';
import SuccesSouscription from './screens/others/succeSoucription';
import Setting from './screens/profils/Setting';
import Map from './screens/profils/Map';
import BudgetDetails from './screens/others/BudgetDetails';
import DetailProjet from './screens/others/DetailProjet';
import CreateBudget from './screens/others/CreerBudget';
import CreateProjet from './screens/others/CreerProjet';
import SuccessBudget from './screens/others/SuccessBudget';
import SuccessProjet from './screens/others/SuccessProjet';
import ChatbotScreen from './screens/others/ChatbotScreen';
import ChatScreen from './screens/others/ChatScreen';
import CreateEpargne from './screens/others/CreateEpargne';
import SuccesEpargne from './screens/others/SuccesEpargne';
import CategorieDepenses from './screens/others/CategorieDepenses';
import TransactionsCategorieProjet from './screens/others/TransactionsCategorieProjet';
const stack = createStackNavigator()

export default function Stack(){

  return(
     <stack.Navigator initialRouteName='HomeScreen'  screenOptions={{
      headerShown:false
     }}>
              <stack.Screen name='ChatScreen' component={ChatScreen}/>
              <stack.Screen name='ChatbotScreen' component={ChatbotScreen}/>
               <stack.Screen name='HomeScreen' component={HomeScreen}/>
                <stack.Screen name='Register' component={Register}/>
               <stack.Screen name='Login' component={Login}/>
               <stack.Screen name='TransactionsCategorieProjet' component={TransactionsCategorieProjet}/>
                <stack.Screen name='Profile' component={profile}/>
                 <stack.Screen name='Notification' component={Notification} />
                <stack.Screen name='CategorieDepenses' component={CategorieDepenses} />
                 <stack.Screen name='VerifiedOtp' component={VerifiedOtp} />
                 <stack.Screen name='SucceSign' component={SucceSign} />
                 <stack.Screen name='ResetPassword' component={ResetPassword} />
                <stack.Screen name='SuccesReset' component={SuccesReset} />
                <stack.Screen name='Forgot' component={Forgot} />
                <stack.Screen name='Transaction' component={Transactions} />
                <stack.Screen name='Recharge' component={Recharge} />
                <stack.Screen name='Depense' component={Depense} />
                <stack.Screen name='TransfertFonds' component={TransfertFonds} />
                <stack.Screen name='SuccesTransfert' component={SuccesTransfert} />
                <stack.Screen name='SuccesDepense' component={SuccesDepense} />
                <stack.Screen name='SuccesRecharge' component={SuccessRecharge} />
                <stack.Screen name='DetailEpargne' component={DetailEpargne} />
                <stack.Screen name='AjoutEpargne' component={AjoutEpargne} />
                 <stack.Screen name='BudgetDetails' component={BudgetDetails} />
                 <stack.Screen name='CreateBudget' component={CreateBudget} />
                  <stack.Screen name='SuccessBudget' component={SuccessBudget} />
                    <stack.Screen name='SuccessProjet' component={SuccessProjet} />
                   <stack.Screen name='CreateProjet' component={CreateProjet} />
                 <stack.Screen name='map' component={Map} />
                 <stack.Screen name='CreateEpargne' component={CreateEpargne} />
                 <stack.Screen name='SuccesEpargne' component={SuccesEpargne} />

                 <stack.Screen name='DetailProjet' component={DetailProjet} />
               <stack.Screen name='Setting' component={Setting} />
             <stack.Screen name='detailPlan'component={PlanDetails} />
                <stack.Screen name='SuccesSoucrire' component={SuccesSouscription} />
                <stack.Screen name='SuccesAjoutEpargne' component={SuccesAjoutEpargne} />
               <stack.Screen name='Menu' >
                     {()=><Maintabs />}
               </stack.Screen>
     </stack.Navigator>
  )
}
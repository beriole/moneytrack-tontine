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

// Module tontine (caisses 1, 2 et 4)
import CreerTontine from './screens/tontine/CreerTontine';
import RejoindreTontine from './screens/tontine/RejoindreTontine';
import DetailTontine from './screens/tontine/DetailTontine';
import MembresTontine from './screens/tontine/MembresTontine';
import CotisationsCycle from './screens/tontine/CotisationsCycle';
import Cotiser from './screens/tontine/Cotiser';
import MesAmendes from './screens/tontine/MesAmendes';
import VotesTontine from './screens/tontine/VotesTontine';
import EchangeTour from './screens/tontine/EchangeTour';
import CaisseEpargne from './screens/tontine/CaisseEpargne';
import DemanderCredit from './screens/tontine/DemanderCredit';
import RemboursementCredit from './screens/tontine/RemboursementCredit';
import ReglementTontine from './screens/tontine/ReglementTontine';
import SuccesTontine from './screens/tontine/SuccesTontine';
import PlanTresorerie from './screens/tontine/PlanTresorerie';
import Retrait from './screens/others/Retrait';

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

                {/* ---- Module tontine ---- */}
                <stack.Screen name='CreerTontine' component={CreerTontine} />
                <stack.Screen name='RejoindreTontine' component={RejoindreTontine} />
                <stack.Screen name='DetailTontine' component={DetailTontine} />
                <stack.Screen name='MembresTontine' component={MembresTontine} />
                <stack.Screen name='CotisationsCycle' component={CotisationsCycle} />
                <stack.Screen name='Cotiser' component={Cotiser} />
                <stack.Screen name='MesAmendes' component={MesAmendes} />
                <stack.Screen name='VotesTontine' component={VotesTontine} />
                <stack.Screen name='EchangeTour' component={EchangeTour} />
                <stack.Screen name='CaisseEpargne' component={CaisseEpargne} />
                <stack.Screen name='DemanderCredit' component={DemanderCredit} />
                <stack.Screen name='RemboursementCredit' component={RemboursementCredit} />
                <stack.Screen name='ReglementTontine' component={ReglementTontine} />
                <stack.Screen name='SuccesTontine' component={SuccesTontine} />
                <stack.Screen name='PlanTresorerie' component={PlanTresorerie} />
                <stack.Screen name='Retrait' component={Retrait} />

               <stack.Screen name='Menu' >
                     {()=><Maintabs />}
               </stack.Screen>
     </stack.Navigator>
  )
}
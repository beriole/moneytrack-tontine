import { StyleSheet } from "react-native";

const Style=StyleSheet.create({
    btn_danger:{
        backgroundColor:'crimson',
        padding:10,
        width:250,
        borderRadius:15
    },
    btn_warnings:{
        backgroundColor:'gold',
        padding:10,
        width:250,
        borderRadius:15
    },
    btn_info:{
        backgroundColor:'lightblue',
        padding:10,
        width:250,
        borderRadius:15
    },
    btn_text:{
        color:'white',
        fontWeight:'200',
        fontSize:17,
        
    },
    container:{
        flex:1,
        backgroundColor:'#111',

    },
    flex_row:{
        flexDirection:'row',
        gap:10,

    },
flex_row_center:{
        flexDirection:'row',
        gap:10,
        justifyContent:'center',
        alignItems:'center'
    },
flex_row_between:{
        flexDirection:'row',
        gap:10,
        justifyContent:'space-between',
        alignItems:'center'
    },
    
    text_white:{
        color:'white',
        fontWeight:'100'
    },
    text_back:{
        color:'black',
        fontWeight:'100'
    },
 text_white_bold:{
        color:'white',
        fontWeight:'bold'
    },
margin_top_vingt:{
    marginTop:20
},
margin_top_trente:{
    marginTop:30
},
margin_top_quarante:{
    marginTop:40
},
margin_top_cinquante:{
    marginTop:50
},
margin_bottom_vingt:{
    marginBottom:20
},
padding_dix:{
    padding:10
},
 text_black_bold:{
        color:'black',
        fontWeight:'bold'
},
flex_column:{
    flexDirection:'column',
    gap:10
},
bg_white:{
    backgroundColor:'white'
},
bg_black:{
    backgroundColor:'black'
},
image_map:{
    width:100,
    height:100,

},
input:{
    borderWidth:1,
    borderColor:'#111',
    backgroundColor:'#ccc',
    color:'black'
}

})
export default Style;

const stagaire = require('./stagaire.js');
const fs= require('fs');
const tableua= require('./tableau.js');
let tab1=[3,5];
let tab2=["bonjour","bonsoir"]
tab2.push("tranquille");
console.log(tab2);
const modulo=(a,b)=>{
    return (a%b);

}
let resultat=modulo(8,2);
console.log(resultat);
const bienvenue=(nom,callback)=>{

    console.log("bonjour :"+nom);
    callback();


}
const callback=()=>{
    console.log("je suis ravie de te revoir");

}
bienvenue("beriole",callback);
console.log(stagaire);
console.log(stagaire.infoStagaire);
console.log(stagaire.typeStage);
stagaire.typeStage.type1="mon choix";
console.log(stagaire.typeStage.type1);
console.log(tableua);
//gestion des fichiers
fs.access("texte.txt",fs.constants.F_OK,(erreur)=>{
   if(erreur){
     fs.writeFile("texte.txt","je suis le monde entier",(erreur)=>{
    if(erreur)
        console.log(erreur);
    else
        console.log("fichiers creer avec succes");
})
   } else{
        // fs.unlink("texte.txt",(erreur)=>{
        //     if(erreur){
        //         console.log(erreur);
        //     }else{
        //         console.log("le fichier est supprimer avec succes");
        //     }
        // })
   }
        
})
fs.readFile("texte.txt","utf8",(erreur,data)=>{
    console.log(data);
})
fs.appendFile("texte.txt","ceci est un ajout dans le monde",(erreur)=>{
    if(erreur){
        console.log(erreur);
    }else{
        console.log("ajout effecuer avec succes");
    }
})
//creation d'un dossier
fs.mkdir("text",(erreur)=>{
    if(erreur)
        console.log(erreur);
    else
        console.log('dosier creer avec succes');
});
fs.rmdir("texte",(erreur)=>{
    if(erreur){
        console.log(erreur);
    }else{
        console.log("creer");
    }
})
const exit=fs.existsSync("text");
if(exit){
    console.log('existe deja');
}else{
    console.log('existe deja bro ');
}
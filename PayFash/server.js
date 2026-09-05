const http = require('http');
const fs= require('fs');
const serever= http.createServer((req,res)=>{
    res.setHeader("content-type","text/html")
   if(req.url==="/accueil"){
    fs.readFile("index.html","utf-8",(erreur,data)=>{
        res.write(data);
    })
   }else{
    console.log("page introuvabe");
   }
   res.end;
})
serever.listen(3000,"localhost",()=>{
    console.log("le serveur a demarrer sur le port 3000");
})
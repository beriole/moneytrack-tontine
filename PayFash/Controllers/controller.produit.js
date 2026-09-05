//creation du tableau de produit
const produit=[
    {
        id:1,
        titre:"iphone 11",
        prix:100000
    },
    {
        id:2,
        titre:"iphone 13promax",
        prix:230000
    },
    {
        id:3,
        titre:"iphone 13 pro MAX",
        prix:800000
    }
]
//creation de l'objet controllers
const controllerproduit={
    async getallproduit(req,res){
     //recuperation simple de l'id passer en parametre
    //const id= req.params.id;
    //recuperation de l'id par destructuration
    const {id }=req.params;
    //transformation de l'id en number
   const newid=parseInt(id);
    //recherche du produit dans le tableau
    const search =produit.find((q)=>q.id===newid);
    if(!search){
        res.status(404).json({
            error:"ce produit n'existe pas"
        })
    }else{
        res.status(201).json(search);
    }
    

    },
}
module.exports=controllerproduit;
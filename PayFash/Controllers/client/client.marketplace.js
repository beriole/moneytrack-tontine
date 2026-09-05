const listeProduits=async(req,res)=>{
    res.status.json({
        message:"Voici la liste des produits disponibles"
    })
}
const detailsProduit=async(req,res)=>{
    res.status.json({
        message:"voici la fiche de details d'un produit"
    })
}
const categorieProduits=async(req,res)=>{
    res.status.json({
        message:"voici toutes les categories de produits disponibles"
    })
}
const ajouterPanier=async(req,res)=>{
    res.status.json({
        message:"le produits a ete ajouter au panier avec success"
    })
}
const consulterPanier=async(req,res)=>{
    res.status.json({
        message:"vous etes actuellement dans les produits du panier"
    })
}
const supprimerDuPanier=async(req,res)=>{
    res.status.json({
        message:"le produit est retirer du panier"
    })
}
const passerCommande=async(req,res)=>{
    res.status.json({
        message:"votre commande a ete passe et en attente de livraison"
    })
}
const consulterCommande=async(req,res)=>{
    res.status.json({
        message:"voici toutes les commandes disponibles"
    })
}
const detailsCommande=async(req,res)=>{
    res.status.json({
        message:"voici les details de cette commande"
    })
}
const demandeRetour=async(req,res)=>{
    res.status.json({
        message:"vous avez demander un retour de produits"
    })
}




const middleware={
    listeProduits,
    demandeRetour,
    detailsCommande,
    detailsProduit,
    passerCommande,
    categorieProduits,
    consulterCommande,
    consulterPanier,
    supprimerDuPanier,
    ajouterPanier,
}
module.exports=middleware;
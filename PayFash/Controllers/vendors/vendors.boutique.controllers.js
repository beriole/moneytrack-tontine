
const connexion=async (req,res)=> {

    res.status(200).json({
        succes:"vous etes connecter"
    })
}
const deconnexion=async (req,res)=> {

    res.status(200).json({
        succes:"utilisateur creer avec success"
    })
}
const creerCategorie=async (req,res)=> {

    res.status(200).json({
        succes:"vous avez crrer une nouvelle categorie de produit"
    })
}
const ajouterProduit=async (req,res)=> {

    res.status(200).json({
        succes:"Vous avez ajouter un nouveau produit"
    })
}
const modifierProduit=async (req,res)=> {

    res.status(200).json({
        succes:"vous avez modifier un produit"
    })
}
const supprimerProduit=async (req,res)=> {

    res.status(200).json({
        succes:"vous avez supprimer un dossier"
    })
}
const listeProduits=async (req,res)=> {

    res.status(200).json({
        succes:"listes de toutes les produits disponible"
    })
}
const listeCommande=async (req,res)=> {

    res.status(200).json({
        succes:"voici toutes le commandes effectuer"
    })
}
const changerStatusCommande=async (req,res)=> {

    res.status(200).json({
        succes:"vous avez changer le status de cette commande"
    })
}
const paiement=async (req,res)=> {

    res.status(200).json({
        succes:"liste des paiement effectuer"
    })
}
const soldeMarchand=async (req,res)=> {

    res.status(200).json({
        succes:"utilisateur creer avec success"
    })
}
const middleware={
    soldeMarchand,
    paiement,
    changerStatusCommande,
    listeCommande,
    listeProduits,
    supprimerProduit,
    ajouterProduit,
    modifierProduit,
    creerCategorie,
    connexion,
    deconnexion  
}
module.exports=middleware;
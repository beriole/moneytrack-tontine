
const inscription=async (req,res)=> {

    res.status(200).json({
        succes:"vous etes desormais agent kyc"
    })
}
const  connexion=async (req,res)=> {

    res.status(200).json({
        succes:"vous etes maintemant connecter"
    })
}
const deconnexion=async (req,res)=> {

    res.status(200).json({
        succes:"vous etes maintenant deconnecter"
    })
}
const informationsProfile=async (req,res)=> {

    res.status(200).json({
        succes:"informations de profile agent"
    })
}
const listeDemande=async (req,res)=> {

    res.status(200).json({
        succes:"voici la liste des demandes"
    })
}
const detailsDemande=async (req,res)=> {

    res.status(200).json({
        succes:"voici les details de cette demande "
    })
}
const approuverDemande=async (req,res)=> {

    res.status(200).json({
        succes:"vous avez approuver cette demande"
    })
}
const rejeteDemande=async (req,res)=> {

    res.status(200).json({
        succes:"vous avez rejeter cette demande"
    })
}
const encoursRevision=async (req,res)=> {

    res.status(200).json({
        succes:"la demande est en cours de revision"
    })
}
const historiqueVerification=async (req,res)=> {

    res.status(200).json({
        succes:"voici  toutes les verifications passè"
    })
}
const detailsVerification=async (req,res)=> {

    res.status(200).json({
        succes:"voici les details concernant cette verification"
    })
}
const telechargerDocument=async (req,res)=> {

    res.status(200).json({
        succes:"voici un documents a telecharger"
    })
}











const middleware={
    inscription,
    connexion,
    deconnexion,
    detailsVerification,
    historiqueVerification,
    rejeteDemande,
    telechargerDocument,
    detailsDemande,
    listeDemande,
    encoursRevision,
    approuverDemande,
    informationsProfile
} 
module.exports=middleware;
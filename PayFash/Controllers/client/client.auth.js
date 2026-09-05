
const jwt=require('jsonwebtoken');
const bcrypt=require('bcrypt');
const path=require('path');
const {Client,Otp} =require('../../models/index');
const { Where } = require('sequelize/lib/utils');
const fs=require('fs');
const Notification=require('../../models/model.notification')
const nodemailler=require('nodemailer');
const ENV=require('../../config/index');

const { error } = require('console');
const Litige=require('../../models/model.litige');
const portefeuille=require('../../models/model.portefeuile')
const inscription = async (req, res) => {
  console.log("Requête inscription reçue :", req.body);
  const { nom, email, motDePasse, telephone, addresse, dateInscription } = req.body;

  try {
  
    const exist = await Client.findOne({ where: { email } });
    if (exist) {
      return res.status(400).json({ message: "Erreur : cet identifiant existe déjà" });
    }

    // Hachage du mot de passe
    const sel = await bcrypt.genSalt(10);
    const hache = await bcrypt.hash(motDePasse, sel);

    // Création du compte utilisateur
    const nouveauClient = await Client.create({ 
      nom, email, motDePasse: hache, telephone, addresse, dateInscription 
    });

    // Génération du code OTP
    const codeOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Envoi du mail
    const transport = nodemailler.createTransport({
      service: "gmail",
      auth: {
        user: ENV.EMAIL,
        pass: ENV.PASSEMAIL
      }
    });

    const optionEnvoie = {
      from: ENV.EMAIL,
      to: email,
      subject: "Code de vérification de compte",
      text: "Merci de rejoindre notre plateforme. Votre code de vérification est : " + codeOtp
    };

    await transport.sendMail(optionEnvoie);

    // Stocker l'OTP avec expiration (5 minutes)
    const dateExpiration = new Date(Date.now() + 5 * 60 * 1000);
    await Otp.create({ OtpCode: codeOtp, email, dateExpiration });

    // Génération du token JWT
    const secret = fs.readFileSync(path.join(__dirname, "../../.private/private.pem"));
    const token = jwt.sign(
      { id: nouveauClient.id, email: nouveauClient.email },
      secret,
      { algorithm: "RS256", expiresIn: "24h" }
    );
        
      await portefeuille.bulkCreate([
            { solde: 0, devise: 'XAF',typePortefeuille: 'courant',ClientPortefeuilleId:nouveauClient.id},
            { solde: 0, devise: 'XAF', typePortefeuille: 'epargne',ClientPortefeuilleId:nouveauClient.id},
            { solde: 0, devise: 'XAF',typePortefeuille: 'projet',ClientPortefeuilleId:nouveauClient.id }
        ]);
    // Réponse au client mobile
    res.status(200).json({
      message: "Votre compte est créé avec succès. Vous recevrez un code de validation par email.",
      token,
      utilisateur: {
        id: nouveauClient.id,
        nom: nouveauClient.nom,
        email: nouveauClient.email,
        telephone: nouveauClient.telephone,
        addresse: nouveauClient.addresse,
        isVerified: nouveauClient.isVerified
      }
    });

  } catch (error) {
    console.error("Erreur inscription:", error);
    res.status(500).json({ message: "Échec lors de la création de l'utilisateur" });
  }
};

const connexion = async (req, res) => {
  console.log("Requête login reçue :", req.body);
  const { email, motDePasse } = req.body;

  try {
    const existe = await Client.findOne({ where: { email: email } });
    if (!existe) {
      return res.status(404).json({ message: "Cet utilisateur n'existe pas" });
    }

    const compare = await bcrypt.compare(motDePasse, existe.motDePasse);
    if (!compare) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" });
    }


    const secret = fs.readFileSync(path.join(__dirname, "../../.private/private.pem"));
    const token = jwt.sign(
      { id: existe.id, email: existe.email },
      secret,
      { algorithm: "RS256", expiresIn: "24h" }
    );


    return res.status(200).json({
      message: "Connecté avec succès",
      token,
      utilisateur: {
        id: existe.id,
        nom: existe.nom,
        email: existe.email,
        telephone: existe.telephone,
        addresse: existe.addresse,
      },
    });
  } catch (error) {
    console.error("Erreur connexion:", error);
    res.status(500).json({ message: "Erreur serveur lors de la connexion" });
  }
};

const deconnexion=async (req,res)=> {

    res.clearCookie("acces_token");
    res.status(200).json({message:"déconnecté avec succes"});
}
const recuperation=async (req,res)=> {

    res.status(200).json({
        succes:"vous etes sur le point de recuperer vos identifiant"
    })
}
const profil=(req,res)=>{
    res.status(200).json({
        succes:"informations sur l'utilisateur"
    })
}
const modifierprofil=(req,res)=>{
    res.status(200).json({
        succes:"profil utilisateur modifier avec succes"
    })
}
const sendOtp= async(req,res)=>{
    const codeOtp= Math.floor(100000 + Math.random() * 900000).toString();
    const {email}=req.body;
    const transport=nodemailler.createTransport(
        {
            service:"gmail",
            auth:{
                user:ENV.EMAIL,
                pass:ENV.PASSEMAIL
            }
        }
    );
    const optionEnvoie={
        from:ENV.EMAIL,
        to:email,
        subject:"code de verification de compte",
        text:" merci de rejoindre notre plateforme, votre code de verification est le:"+codeOtp
    };
    try {
        await transport.sendMail(optionEnvoie);
        const date=new Date(Date.now()+5*60*1000);
        await Otp.create({
        OtpCode:codeOtp,
        email:email,
        dateExpiration:date
        });
        res.status(200).json({message:"un code de verificatio a éte envoye a votre addresse email"});        
    } catch (error) {
        res.status(400).json(error);  
    }

}
const verifyOtp= async (req,res)=>{
  console.log(req.body)
    const {email,OtpCode}=req.body;
    try {
        const exist=await Otp.findOne({where:{email:email,OtpCode:OtpCode}});
        if(exist){
            if(exist.dateExpiration<Date.now()){
               
                res.status(500).json({message:"votre code a expirer veuillez demander un nouveau code"});
            }else{
                await Client.update({isVerified:true},{where:{email:email}});
                 res.status(200).json({message:"votre email est verifie avec succes"});
            }
            await exist.destroy();
        }else{
             res.status(400).json({message:"aucun code de verification n'as ete trouvé"});
        }
    } catch (error) {
        console.log(error);
    }
}
const litige= async (req,res)=>{
    try {
        const { utilisateurId, description } = req.body;

        const user = await Utilisateur.findByPk(utilisateurId);
        if (!user) {
            return res.status(404).json({ erreur: "Utilisateur introuvable" });
        }

        const litige = await Litige.create({
            description:description,
            statut: "en attente",
            dateSoummission: new Date(),
            UtilisateurId: utilisateurId,
            clientId:utilisateurId
        });

        return res.status(201).json({ succes: "Litige ajouté avec succès", litige });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ erreur: "Erreur serveur lors de l'ajout du litige" });
    }
}
const sendNotif= async (req, res) => {
  try {
    const { adminId, clientIds, message, type } = req.body;

    // Deux corrections : la colonne s'appelle "dateEnvoie" (et non
    // "dateEnvoi") et elle est obligatoire — l'insertion echouait donc
    // systematiquement ; et le type est porte par "Type", avec un T
    // majuscule, si bien que la valeur passee etait ignoree.
    const notification = await Notification.create({
      message,
      Type: type || "system",
      adminId,
      dateEnvoie: new Date()
    });

    if (Array.isArray(clientIds)) {
      await notification.addClients(clientIds);
    } else {
      await notification.addClient(clientIds);
    }

    res.status(201).json({ message: "Notification envoyée", notification });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de l'envoi de la notification" });
  }
};


const clientNotif= async (req, res) => {
  try {
    const clientId = req.params.clientId;

    const client = await Client.findByPk(clientId, {
      include: {
        model: Notification,
        through: { attributes: ["lu"] }
      }
    });

    if (!client) {
      return res.status(404).json({ error: "Client non trouvé" });
    }

    res.json(client.Notifications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des notifications" });
  }
};


const notifLu= async (req, res) => {
  try {
    const { clientId, notificationId } = req.params;

    const updated = await NotificationEnvoyer.update(
      { lu: true },
      { where: { clientId, notificationId } }
    );

    if (updated[0] === 0) {
      return res.status(404).json({ error: "Relation notification/client introuvable" });
    }

    res.json({ message: "Notification marquée comme lue" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors du marquage de la notification" });
  }
};


const notifNonLu= async (req, res) => {
  try {
    const { clientId } = req.params;

    const notifs = await Notification.findAll({
      include: [
        {
          model: Client,
          where: { id: clientId },
          through: { attributes: ["lu"], where: { lu: false } }
        }
      ]
    });

    res.json(notifs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération des notifications non lues" });
  }
};

const resetPassword = async (req, res) => {
  console.log(req.body);
  const { email, nouveauMotDePasse } = req.body;

  try {
    const user = await Client.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const sel = await bcrypt.genSalt(10);
    const hache = await bcrypt.hash(nouveauMotDePasse, sel);

    await Client.update(
      { motDePasse: hache },
      { where: { email } }
    );

    res.status(200).json({ message: "Mot de passe réinitialisé avec succès " });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur lors de la réinitialisation" });
  }
};

const fonction={
    verifyOtp,
    inscription,
    connexion,
    deconnexion,
    recuperation,
    profil,
    modifierprofil,
    sendOtp,
    litige,
    clientNotif,
    sendNotif,
    notifLu,
    notifNonLu,
    resetPassword
};
module.exports=fonction;
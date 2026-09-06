
const jwt=require('jsonwebtoken');
const bcrypt=require('bcrypt');
const path=require('path');
const {Client,Otp} =require('../../models/index');
const { Where } = require('sequelize/lib/utils');
const fs=require('fs');
const Notification=require('../../models/model.notification')
const NotificationEnvoyer=require('../../models/model.NotificationEnvoyer')
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
// Champs qu'un client peut lire et modifier sur son propre compte. Le mot de
// passe n'en fait pas partie (il passe par /auth/reset), isVerified et
// isActive non plus : un utilisateur ne se declare pas verifie lui-meme.
const CHAMPS_PROFIL = ['id', 'nom', 'email', 'telephone', 'isActive', 'isVerified', 'dateInscription'];

// GET /auth/info/:id
//
// Renvoyait un message fixe sans rien lire. Le client mobile ne pouvait donc
// pas afficher un profil : il se rabattait sur ce qu'il avait en cache.
const profil = async (req, res) => {
  try {
    if (!memeClient(req, res, req.params.id)) return;

    const client = await Client.findByPk(req.user.id, { attributes: CHAMPS_PROFIL });
    if (!client) return res.status(404).json({ error: "Utilisateur introuvable" });

    return res.status(200).json({ utilisateur: client });
  } catch (error) {
    console.error('profil:', error);
    return res.status(500).json({ error: "Erreur lors de la lecture du profil" });
  }
};

// PATCH /auth/info/:id   body: { nom?, email?, telephone? }
//
// Repondait "profil modifie avec succes" sans rien ecrire.
const modifierprofil = async (req, res) => {
  try {
    if (!memeClient(req, res, req.params.id)) return;

    const { nom, email, telephone } = req.body;
    const modifs = {};

    if (nom !== undefined) {
      if (!String(nom).trim()) return res.status(400).json({ error: "Le nom ne peut pas etre vide" });
      modifs.nom = String(nom).trim();
    }
    if (email !== undefined) {
      const valeur = String(email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valeur)) {
        return res.status(400).json({ error: "Adresse email invalide" });
      }
      modifs.email = valeur;
    }
    if (telephone !== undefined) {
      const chiffres = String(telephone).replace(/\D/g, '');
      if (chiffres.length < 9) return res.status(400).json({ error: "Numero de telephone invalide" });
      modifs.telephone = chiffres;
    }

    if (!Object.keys(modifs).length) {
      return res.status(400).json({ error: "Aucun champ modifiable fourni (nom, email, telephone)" });
    }

    await Client.update(modifs, { where: { id: req.user.id } });
    const client = await Client.findByPk(req.user.id, { attributes: CHAMPS_PROFIL });

    return res.status(200).json({
      succes: "Profil mis a jour",
      utilisateur: client
    });
  } catch (error) {
    // email et telephone sont uniques : le conflit se dit, il ne se cache pas
    // derriere une erreur serveur.
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: "Cette adresse email ou ce numero est deja utilise" });
    }
    console.error('modifierprofil:', error);
    return res.status(500).json({ error: "Erreur lors de la mise a jour du profil" });
  }
};
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
        const { description } = req.body;

        // Le litige appartient au porteur du jeton. Il lisait auparavant
        // `utilisateurId` dans le corps de la requete — donc ouvrable au nom
        // de n'importe qui — et interrogeait `Utilisateur`, un modele qui
        // n'existe pas : la route echouait de toute facon systematiquement.
        const utilisateurId = req.user.id;
        if (!description || !String(description).trim()) {
            return res.status(400).json({ erreur: "La description du litige est obligatoire" });
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


// Un identifiant dans l'URL n'autorise rien par lui-meme : il doit designer
// le porteur du jeton. Sans ce controle, /auth/notification/42 rendait la
// boite de reception du client 42 a n'importe quel utilisateur connecte.
const memeClient = (req, res, valeur) => {
  if (parseInt(valeur, 10) !== req.user.id) {
    res.status(403).json({ error: "Ces donnees ne sont pas les votres" });
    return false;
  }
  return true;
};

const clientNotif= async (req, res) => {
  try {
    const clientId = req.params.clientId;
    if (!memeClient(req, res, clientId)) return;

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
    if (!memeClient(req, res, clientId)) return;

    // Les cles etrangeres de la table pivot sont ClientId / NotificationId
    // (majuscules, posees par le belongsToMany de models/index.js). Avec les
    // noms en minuscules, la clause ne correspondait a rien.
    const updated = await NotificationEnvoyer.update(
      { lu: true },
      { where: { ClientId: clientId, NotificationId: notificationId } }
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
    if (!memeClient(req, res, clientId)) return;

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

// POST /auth/reset  body: { email, OtpCode, nouveauMotDePasse }
//
// La route prenait auparavant { email, nouveauMotDePasse } et changeait le
// mot de passe sur la seule foi de l'email : n'importe qui pouvait prendre
// n'importe quel compte. Elle exige desormais un code OTP valide, non expire,
// consomme au passage — le meme mecanisme que /auth/sendOtp.
const resetPassword = async (req, res) => {
  const { email, OtpCode, nouveauMotDePasse } = req.body;

  if (!email || !OtpCode || !nouveauMotDePasse) {
    return res.status(400).json({
      message: "email, OtpCode et nouveauMotDePasse sont requis. Demandez d'abord un code via /auth/sendOtp."
    });
  }
  if (String(nouveauMotDePasse).length < 8) {
    return res.status(400).json({ message: "Le mot de passe doit faire au moins 8 caracteres" });
  }

  try {
    const code = await Otp.findOne({ where: { email, OtpCode } });
    if (!code) {
      return res.status(400).json({ message: "Code de verification invalide" });
    }
    if (new Date(code.dateExpiration) < new Date()) {
      await code.destroy();
      return res.status(400).json({ message: "Code expire, demandez-en un nouveau" });
    }

    const user = await Client.findOne({ where: { email } });
    if (!user) {
      await code.destroy();
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const sel = await bcrypt.genSalt(10);
    const hache = await bcrypt.hash(nouveauMotDePasse, sel);
    await Client.update({ motDePasse: hache }, { where: { email } });

    // Un code ne sert qu'une fois.
    await code.destroy();

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
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { Client } = require('.././models/index');


// =====================================================================
//  Authentification du client.
//
//  Le middleware verifiait la signature du jeton et chargeait le compte,
//  sans jamais regarder s'il etait encore actif. Un compte desactive par
//  l'administration gardait donc son jeton valable vingt-quatre heures et
//  continuait de cotiser, de retirer et de rejoindre des tontines. La
//  desactivation ne prenait effet qu'a l'expiration du jeton.
//
//  Le corps de la reponse distingue les deux cas : un jeton invalide n'a
//  rien a voir avec un compte suspendu, et l'application doit pouvoir dire
//  laquelle des deux choses s'est produite.
// =====================================================================
const verifyToken = async (req, res, next) => {
  try {
   
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token manquant ou invalide' });
    }


    const token = authHeader.split(' ')[1];


    const publicKey = fs.readFileSync(path.join(__dirname, "../.private/public.pem"));

    
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });


    const user = await Client.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Utilisateur introuvable' });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Votre compte est desactive. Contactez le support pour en connaitre le motif.",
        compteDesactive: true
      });
    }


    req.user = user;
    next(); // passe au prochain middleware ou route

  } catch (error) {
    console.error('Erreur vérification token:', error);
    return res.status(403).json({ message: 'Token invalide ou expiré' });
  }
};

module.exports = verifyToken;

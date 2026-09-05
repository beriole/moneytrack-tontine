const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { Client } = require('.././models/index');


const verifyToken = async (req, res, next) => {
  console.log(req.headers)
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


    req.user = user;
    next(); // passe au prochain middleware ou route

  } catch (error) {
    console.error('Erreur vérification token:', error);
    return res.status(403).json({ message: 'Token invalide ou expiré' });
  }
};

module.exports = verifyToken;

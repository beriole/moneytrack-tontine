const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { Admin } = require('../models/index');

// Vérifie le JWT admin (RS256), s'assure du scope 'admin', charge l'admin actif.
const verifyAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Token admin manquant' });
        }
        const token = authHeader.split(' ')[1];
        const publicKey = fs.readFileSync(path.join(__dirname, "../.private/public.pem"));
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

        if (decoded.scope !== 'admin') {
            return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs' });
        }

        const admin = await Admin.findByPk(decoded.id);
        if (!admin || !admin.isActive) {
            return res.status(403).json({ success: false, error: 'Compte admin introuvable ou désactivé' });
        }

        req.admin = admin;
        next();
    } catch (error) {
        console.error('verifyAdmin:', error.message);
        return res.status(403).json({ success: false, error: 'Token admin invalide ou expiré' });
    }
};

// Restreint l'accès à certains rôles. SUPER_ADMIN passe toujours.
const requireRole = (...roles) => (req, res, next) => {
    if (!req.admin) return res.status(401).json({ success: false, error: 'Non authentifié' });
    if (req.admin.role === 'SUPER_ADMIN' || roles.includes(req.admin.role)) return next();
    return res.status(403).json({ success: false, error: 'Permissions insuffisantes pour cette action' });
};

module.exports = { verifyAdmin, requireRole };

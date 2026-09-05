const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { Admin } = require('../../models/index');
const { logAction } = require('./audit');

const privateKey = () => fs.readFileSync(path.join(__dirname, "../../.private/private.pem"));

const signAdminToken = (admin) =>
    jwt.sign(
        { id: admin.id, role: admin.role, scope: 'admin' },
        privateKey(),
        { algorithm: 'RS256', expiresIn: '2h' }
    );

const sanitize = (a) => ({
    id: a.id, nom: a.nom, prenom: a.prenom, email: a.email,
    role: a.role, isActive: a.isActive, lastLogin: a.lastLogin
});

// POST /api/admin/auth/login
const login = async (req, res) => {
    const { email, motDePasse } = req.body;
    try {
        if (!email || !motDePasse) {
            return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
        }
        const admin = await Admin.findOne({ where: { email } });
        if (!admin) {
            return res.status(401).json({ success: false, error: 'Identifiants invalides' });
        }
        if (!admin.isActive) {
            return res.status(403).json({ success: false, error: 'Compte administrateur désactivé' });
        }
        const ok = await bcrypt.compare(motDePasse, admin.motDePasse);
        if (!ok) {
            return res.status(401).json({ success: false, error: 'Identifiants invalides' });
        }

        admin.lastLogin = new Date();
        await admin.save();

        const token = signAdminToken(admin);
        await logAction({ admin, headers: req.headers, socket: req.socket }, 'ADMIN_LOGIN', `Admin#${admin.id}`);

        return res.json({ success: true, data: { token, admin: sanitize(admin) } });
    } catch (error) {
        console.error('admin login:', error);
        return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
};

// GET /api/admin/auth/me
const me = async (req, res) => {
    return res.json({ success: true, data: sanitize(req.admin) });
};

// POST /api/admin/auth/create  (SUPER_ADMIN uniquement)
const creerAdmin = async (req, res) => {
    const { nom, prenom, email, motDePasse, role } = req.body;
    try {
        if (!nom || !email || !motDePasse) {
            return res.status(400).json({ success: false, error: 'Champs requis manquants' });
        }
        const exists = await Admin.findOne({ where: { email } });
        if (exists) {
            return res.status(400).json({ success: false, error: 'Cet email admin existe déjà' });
        }
        const hash = await bcrypt.hash(motDePasse, 10);
        const admin = await Admin.create({ nom, prenom, email, motDePasse: hash, role: role || 'SUPPORT' });
        await logAction(req, 'ADMIN_CREATE', `Admin#${admin.id}`, { role: admin.role });
        return res.status(201).json({ success: true, data: sanitize(admin) });
    } catch (error) {
        console.error('creerAdmin:', error);
        return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
};

// GET /api/admin/auth/admins  (SUPER_ADMIN) — liste des comptes admin/agents
const listeAdmins = async (req, res) => {
    try {
        const admins = await Admin.findAll({ attributes: { exclude: ['motDePasse'] }, order: [['createdAt', 'DESC']] });
        return res.json({ success: true, data: admins });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
};

module.exports = { login, me, creerAdmin, listeAdmins };

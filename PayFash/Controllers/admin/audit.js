const { AuditLog } = require('../../models/index');

// Enregistre une action admin dans le journal d'audit (best-effort, ne bloque jamais).
async function logAction(req, action, cible, details = null, statut = 'SUCCESS') {
    try {
        await AuditLog.create({
            adminId: req.admin?.id || null,
            adminEmail: req.admin?.email || null,
            action,
            cible,
            details,
            statut,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
        });
    } catch (e) {
        console.error('Audit log error:', e.message);
    }
}

module.exports = { logAction };

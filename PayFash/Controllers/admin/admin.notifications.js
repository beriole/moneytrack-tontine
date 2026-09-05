const { Notification, NotificationEnvoyer, Client } = require('../../models/index');
const { logAction } = require('./audit');

// POST /api/admin/notification/campagne   body: { message, type, cible }
//   cible : "all"  ou  [clientId, ...]
const envoyerCampagne = async (req, res) => {
    try {
        const { message, type, cible } = req.body;
        if (!message) return res.status(400).json({ success: false, error: 'Message requis' });

        const notification = await Notification.create({
            message,
            Type: ['system', 'promo', 'alerte'].includes(type) ? type : 'system',
            dateEnvoie: new Date()
        });

        // Détermine les destinataires
        let clientIds = [];
        if (Array.isArray(cible) && cible.length) {
            clientIds = cible;
        } else {
            const clients = await Client.findAll({ attributes: ['id'], where: { isActive: true } });
            clientIds = clients.map(c => c.id);
        }

        await NotificationEnvoyer.bulkCreate(
            clientIds.map(id => ({ ClientId: id, NotificationId: notification.id, lu: false }))
        );

        await logAction(req, 'NOTIF_BROADCAST', `Notification#${notification.id}`, { destinataires: clientIds.length, type });
        return res.status(201).json({
            success: true,
            message: `Notification envoyée à ${clientIds.length} utilisateur(s)`,
            data: { notification, destinataires: clientIds.length }
        });
    } catch (error) {
        console.error('envoyerCampagne:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/notification/notification  — historique des campagnes
const listeNotifications = async (req, res) => {
    try {
        const notifs = await Notification.findAll({ order: [['dateEnvoie', 'DESC']], limit: 50 });
        const data = [];
        for (const n of notifs) {
            const total = await NotificationEnvoyer.count({ where: { NotificationId: n.id } });
            const lus = await NotificationEnvoyer.count({ where: { NotificationId: n.id, lu: true } });
            data.push({ ...n.toJSON(), destinataires: total, lus });
        }
        return res.json({ success: true, data });
    } catch (error) {
        console.error('listeNotifications:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { envoyerCampagne, listeNotifications };

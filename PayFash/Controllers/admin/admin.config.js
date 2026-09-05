const { SystemConfig } = require('../../models/index');
const { logAction } = require('./audit');

const cast = (c) => {
    if (c.type === 'number') return parseFloat(c.valeur);
    if (c.type === 'boolean') return c.valeur === 'true';
    return c.valeur;
};

// Helper réutilisable : lit une valeur de config typée, avec défaut.
async function getConfigValue(cle, defaut = null) {
    const c = await SystemConfig.findOne({ where: { cle } });
    return c ? cast(c) : defaut;
}

// GET /api/admin/config/config
const listeConfig = async (req, res) => {
    try {
        const configs = await SystemConfig.findAll({ order: [['categorie', 'ASC'], ['cle', 'ASC']] });
        const data = configs.map(c => ({ ...c.toJSON(), valeurTypee: cast(c) }));
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/admin/config/config/:cle   body: { valeur }
const updateConfig = async (req, res) => {
    try {
        const config = await SystemConfig.findOne({ where: { cle: req.params.cle } });
        if (!config) return res.status(404).json({ success: false, error: 'Paramètre introuvable' });
        const ancienne = config.valeur;
        config.valeur = String(req.body.valeur);
        await config.save();
        await logAction(req, 'CONFIG_UPDATE', `Config:${config.cle}`, { de: ancienne, vers: config.valeur });
        return res.json({ success: true, data: { ...config.toJSON(), valeurTypee: cast(config) } });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { listeConfig, updateConfig, getConfigValue };

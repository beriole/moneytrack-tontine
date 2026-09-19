'use strict';

const { SystemConfig } = require('../models');

// =====================================================================
//  Parametres de plateforme, lus depuis SystemConfigs.
//
//  La lecture typee vivait dans un controleur d'administration : les
//  services — ou la regle s'applique — n'y avaient pas acces. Elle vit
//  ici, et le controleur la reutilise.
// =====================================================================

function typer(c) {
    if (c.type === 'number') return parseFloat(c.valeur);
    if (c.type === 'boolean') return c.valeur === 'true';
    return c.valeur;
}

async function lire(cle, defaut = null, t = null) {
    const c = await SystemConfig.findOne({ where: { cle }, transaction: t });
    return c ? typer(c) : defaut;
}

module.exports = { lire, typer };

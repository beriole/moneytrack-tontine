// Seed des paramètres système + un prêt de démonstration.
const { db, SystemConfig, Pret, Client } = require('./models');

const CONFIGS = [
    { cle: 'frais_transfert', valeur: '100', type: 'number', categorie: 'frais', description: 'Frais fixe par transfert (FCFA)' },
    { cle: 'limite_transfert', valeur: '1000000', type: 'number', categorie: 'limites', description: 'Montant max par transfert' },
    { cle: 'limite_retrait', valeur: '500000', type: 'number', categorie: 'limites', description: 'Montant max par retrait' },
    { cle: 'aml_seuil_montant', valeur: '1000000', type: 'number', categorie: 'aml', description: 'Seuil de transaction à surveiller' },
    { cle: 'aml_seuil_velocite', valeur: '10', type: 'number', categorie: 'aml', description: 'Nb de transactions/24h déclenchant une alerte' },
    { cle: 'maintenance_mode', valeur: 'false', type: 'boolean', categorie: 'general', description: 'Mode maintenance de l\'app' },
    { cle: 'devise_defaut', valeur: 'XAF', type: 'string', categorie: 'general', description: 'Devise par défaut' },
];

async function seed() {
    await db.authenticate();
    await db.sync({ alter: true });

    for (const c of CONFIGS) {
        await SystemConfig.findOrCreate({ where: { cle: c.cle }, defaults: c });
    }
    console.log('✅ %d paramètres système assurés', CONFIGS.length);

    const client = await Client.findOne({ where: { email: 'test@payfash.com' } });
    if (client) {
        const cnt = await Pret.count({ where: { clientId: client.id } });
        if (cnt === 0) {
            await Pret.create({
                montant: 200000, tauxInteret: 8, dureeMois: 12,
                motif: 'Achat de matériel', statut: 'demande', clientId: client.id
            });
            console.log('✅ 1 prêt démo créé (en demande)');
        } else console.log('ℹ️  Prêts déjà présents:', cnt);
    }

    console.log('🎉 Seed V3 terminé');
}

seed().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });

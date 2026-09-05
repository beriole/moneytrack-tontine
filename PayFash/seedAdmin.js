// =====================================================================
//  Crée (ou met à jour) un compte SUPER_ADMIN de démonstration.
//  Lancer :  node seedAdmin.js
//  Login généré :  admin@moneytrack.com  /  Admin@1234
// =====================================================================
const bcrypt = require('bcrypt');
const { db, Admin } = require('./models');

const EMAIL = 'admin@moneytrack.com';
const PASSWORD = 'Admin@1234';

async function seed() {
    await db.authenticate();
    console.log('✅ Connexion DB OK');
    await db.sync({ alter: true });

    const hash = await bcrypt.hash(PASSWORD, 10);
    let admin = await Admin.findOne({ where: { email: EMAIL } });
    if (admin) {
        admin.motDePasse = hash;
        admin.role = 'SUPER_ADMIN';
        admin.isActive = true;
        admin.nom = admin.nom || 'Super';
        admin.prenom = admin.prenom || 'Admin';
        await admin.save();
        console.log('ℹ️  Super-admin mis à jour (id=%s)', admin.id);
    } else {
        admin = await Admin.create({
            nom: 'Super', prenom: 'Admin', email: EMAIL,
            motDePasse: hash, role: 'SUPER_ADMIN', isActive: true
        });
        console.log('✅ Super-admin créé (id=%s)', admin.id);
    }

    console.log('\n========================================');
    console.log('🎉 Seed admin terminé');
    console.log('   Email    : %s', EMAIL);
    console.log('   Password : %s', PASSWORD);
    console.log('   Rôle     : SUPER_ADMIN');
    console.log('========================================');
}

seed().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });

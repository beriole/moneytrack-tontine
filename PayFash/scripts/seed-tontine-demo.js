// =====================================================================
//  Seed de demonstration du module tontine — phase 1.
//
//    node scripts/seed-tontine-demo.js          cree le jeu de donnees
//    node scripts/seed-tontine-demo.js --undo   le supprime entierement
//
//  Cree :
//    - 1 client PLATEFORME, destinataire des frais (piege n.6 de NjanguiPay :
//      sans lui, les frais preleves n'ont aucun compte d'arrivee).
//    - 4 clients de demo, chacun avec un portefeuille courant approvisionne.
//    - 1 groupe "mixte" (caisse 1 + caisse 2) avec sa caisse-portefeuille,
//      ses 4 membres, son bureau et son pool de credit.
//
//  Idempotent : relancer ne cree pas de doublon. Toutes les adresses sont
//  en .local et les telephones dans une plage reservee, pour que ces comptes
//  restent identifiables et supprimables.
// =====================================================================

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const ENV = require('../config/index.js');
const models = require('../models/index.js');

const {
    db, Client, Portefeuille,
    TontineGroupe, TontineMembre, TontinePoolCredit
} = models;

const MARQUEUR = '@tontine.local';
const EMAIL_PLATEFORME = 'plateforme@tontine.local';
const MOT_DE_PASSE = 'Demo@2026';

const DEMOS = [
    { nom: 'Awa Ngo Bell', email: 'awa@tontine.local', telephone: 690000091, role: 'president' },
    { nom: 'Bertrand Fotso', email: 'bertrand@tontine.local', telephone: 690000092, role: 'tresorier' },
    { nom: 'Clarisse Mbarga', email: 'clarisse@tontine.local', telephone: 690000093, role: 'censeur' },
    { nom: 'Daniel Nkodo', email: 'daniel@tontine.local', telephone: 690000094, role: 'membre' }
];

const MONTANT_PAR_PERIODE = 25000;   // FCFA
const SOLDE_INITIAL = 150000;        // de quoi tenir plusieurs cycles

async function creer() {
    const hache = await bcrypt.hash(MOT_DE_PASSE, await bcrypt.genSalt(10));

    return db.transaction(async (t) => {
        // --- Client plateforme -------------------------------------
        const [plateforme, nouveauPf] = await Client.findOrCreate({
            where: { email: EMAIL_PLATEFORME },
            defaults: {
                nom: 'MoneyTrack Plateforme',
                email: EMAIL_PLATEFORME,
                telephone: 690000090,
                motDePasse: hache,
                isActive: true,
                isVerified: true
            },
            transaction: t
        });
        // La plateforme a besoin d'un portefeuille pour encaisser les frais :
        // sans lui, verser() degrade et ne preleve rien.
        const [pfPlateforme] = await Portefeuille.findOrCreate({
            where: { ClientPortefeuilleId: plateforme.id, typePortefeuille: 'courant' },
            defaults: {
                nom: 'Compte de frais plateforme', solde: 0, devise: 'XAF',
                typePortefeuille: 'courant', estPrincipal: true, estActif: true,
                ClientPortefeuilleId: plateforme.id
            },
            transaction: t
        });
        console.log((nouveauPf ? 'cree   ' : 'existe ') + ' client plateforme  id=' + plateforme.id +
            '  portefeuille=' + pfPlateforme.id);

        // --- Clients de demo ---------------------------------------
        const clients = [];
        for (const d of DEMOS) {
            const [c, nouveau] = await Client.findOrCreate({
                where: { email: d.email },
                defaults: {
                    nom: d.nom, email: d.email, telephone: d.telephone,
                    motDePasse: hache, isActive: true, isVerified: true
                },
                transaction: t
            });
            clients.push({ ...d, id: c.id });

            const [pf, nouveauW] = await Portefeuille.findOrCreate({
                where: { ClientPortefeuilleId: c.id, typePortefeuille: 'courant' },
                defaults: {
                    nom: 'Compte courant', solde: SOLDE_INITIAL, devise: 'XAF',
                    typePortefeuille: 'courant', estPrincipal: true, estActif: true,
                    ClientPortefeuilleId: c.id
                },
                transaction: t
            });
            console.log((nouveau ? 'cree   ' : 'existe ') + ' ' + d.nom.padEnd(18) +
                ' id=' + String(c.id).padEnd(4) + ' portefeuille=' + pf.id +
                ' solde=' + pf.solde + (nouveauW ? '' : ' (existant)'));
        }

        // --- Groupe de tontine -------------------------------------
        let groupe = await TontineGroupe.findOne({
            where: { nom: 'Njangi Demo' }, transaction: t
        });

        if (!groupe) {
            groupe = await TontineGroupe.create({
                nom: 'Njangi Demo',
                description: 'Groupe de demonstration : tour rotatif + caisse de credit.',
                type: 'mixte',
                montantParPeriode: MONTANT_PAR_PERIODE,
                devise: 'XAF',
                frequence: 'mensuelle',
                membresMax: DEMOS.length,
                membresActuels: DEMOS.length,
                modeOrdre: 'tirage',
                pourcentageCaution: ENV.TONTINE_CAUTION_DEFAUT,
                bareme: { retard: 1000, absence: 2000, indiscipline: 5000, autre: 1000 },
                destinationAmendes: 'epargne',
                modeAcces: 'prive',
                codeInvitation: crypto.randomBytes(4).toString('hex').toUpperCase(),
                statut: 'en_attente',
                createurId: clients[0].id,
                numeroCycleActuel: 0
            }, { transaction: t });

            // La caisse du groupe est un vrai portefeuille, sans proprietaire
            const caisse = await Portefeuille.create({
                nom: 'Caisse Njangi Demo',
                solde: 0,
                devise: 'XAF',
                typePortefeuille: 'tontine',
                estPrincipal: false,
                estActif: true,
                ClientPortefeuilleId: null,
                groupeTontineId: groupe.id,
                description: "Caisse du groupe. Ni retrait ni transfert par les routes client."
            }, { transaction: t });
            await groupe.update({ portefeuilleId: caisse.id }, { transaction: t });

            for (const c of clients) {
                await TontineMembre.create({
                    groupeId: groupe.id,
                    clientId: c.id,
                    role: c.role,
                    statut: 'actif',
                    cautionPayee: false,
                    dateAdhesion: new Date()
                }, { transaction: t });
            }

            await TontinePoolCredit.create({
                groupeId: groupe.id,
                tauxInteretDefaut: ENV.TONTINE_TAUX_CREDIT_DEFAUT,
                derniereMaj: new Date()
            }, { transaction: t });

            console.log('cree    groupe "Njangi Demo"  id=' + groupe.id +
                '  code=' + groupe.codeInvitation + '  caisse=' + caisse.id);
        } else {
            console.log('existe  groupe "Njangi Demo"  id=' + groupe.id +
                '  code=' + groupe.codeInvitation);
        }

        return { plateformeId: plateforme.id, groupeId: groupe.id };
    });
}

async function supprimer() {
    return db.transaction(async (t) => {
        const groupe = await TontineGroupe.findOne({ where: { nom: 'Njangi Demo' }, transaction: t });
        if (groupe) {
            // membres, pool, cycles... partent en cascade via les associations
            const caisseId = groupe.portefeuilleId;
            await groupe.destroy({ transaction: t });
            if (caisseId) await Portefeuille.destroy({ where: { id: caisseId }, transaction: t });
            console.log('supprime  groupe id=' + groupe.id);
        }
        const { Op } = require('sequelize');
        const comptes = await Client.findAll({
            where: { email: { [Op.like]: '%' + MARQUEUR } }, transaction: t
        });
        for (const c of comptes) {
            await Portefeuille.destroy({ where: { ClientPortefeuilleId: c.id }, transaction: t });
            await c.destroy({ transaction: t });
        }
        console.log('supprime  ' + comptes.length + ' comptes ' + MARQUEUR);
    });
}

(async () => {
    const undo = process.argv.includes('--undo');
    try {
        await db.authenticate();
        if (undo) {
            await supprimer();
            console.log('\nJeu de demonstration retire.');
        } else {
            const r = await creer();
            console.log('\nMot de passe des comptes de demo : ' + MOT_DE_PASSE);
            console.log('A ajouter dans PayFash/.env :');
            console.log('  TONTINE_CLIENT_PLATEFORME_ID=' + r.plateformeId);
        }
        await db.close();
    } catch (e) {
        console.error('ECHEC : ' + e.message);
        process.exit(1);
    }
})();

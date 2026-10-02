'use strict';

// =====================================================================
//  Module de tontine (tour rotatif) — tests d'integration.
//
//  Rien n'est simule : chaque test passe par les services reels, sur la
//  base reelle, et observe ce que l'argent fait. Un groupe dedie est
//  cree au debut et supprime a la fin ; les soldes sont restaures.
//
//  Lancer :  npx jest tests/modules/test_tontine.test.js
// =====================================================================

const { Op } = require('sequelize');
const models = require('../../models');
const {
    db, Client, Portefeuille, Transaction,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontineAmende, TontineCaution,
    TontineGarantie, LedgerMouvement, LedgerEcriture
} = models;

const GroupeService = require('../../services/tontine/groupe.service');
const CycleService = require('../../services/tontine/cycle.service');
const CautionService = require('../../services/tontine/caution.service');
const GarantieService = require('../../services/tontine/garantie.service');
const Fonds = require('../../services/fonds.service');
const { arrondir } = require('../../services/tontine/commun');

const EMAILS = ['awa@tontine.local', 'bertrand@tontine.local', 'clarisse@tontine.local'];
const MONTANT = 20000;
const NOM_GROUPE = 'Tontine — suite de tests';

const ok = (texte) => console.log(`✅ ${texte}`);
const courant = (clientId) => Portefeuille.findOne({
    where: { ClientPortefeuilleId: clientId, typePortefeuille: 'courant', estActif: true }
});
const solde = async (clientId) => arrondir((await courant(clientId)).solde);

jest.setTimeout(60000);

describe('Module de tontine (tour rotatif)', () => {
    const etat = { clients: [], groupe: null, cycle1: null, defaillant: null, epargne: null };
    const soldesInitiaux = {};
    let premierMouvement = 0;

    beforeAll(async () => {
        await db.authenticate();
        for (const email of EMAILS) {
            const c = await Client.findOne({ where: { email } });
            if (!c) throw new Error(`Compte de demonstration absent : ${email} (node scripts/seed-tontine-demo.js)`);
            etat.clients.push(c);
        }
        for (const c of etat.clients) {
            for (const pf of await Portefeuille.findAll({ where: { ClientPortefeuilleId: c.id } })) {
                soldesInitiaux[pf.id] = { solde: pf.solde, reserve: Number(pf.montantReserve) };
            }
        }
        premierMouvement = (await LedgerMouvement.max('id')) || 0;
        await TontineGroupe.destroy({ where: { nom: NOM_GROUPE } });
        // De quoi cotiser : l'approvisionnement passe par le grand livre.
        for (const c of etat.clients) {
            await Fonds.ajuster(await courant(c.id), 'credit', 4 * MONTANT, null, {
                type: 'ajustement', clientId: c.id, description: 'Mise en place des tests'
            });
        }
    });

    afterAll(async () => {
        const mouvements = await LedgerMouvement.findAll({
            where: { id: { [Op.gt]: premierMouvement } }, attributes: ['id']
        });
        if (mouvements.length) {
            await LedgerEcriture.destroy({ where: { mouvementId: mouvements.map(m => m.id) } });
            await LedgerMouvement.destroy({ where: { id: mouvements.map(m => m.id) } });
        }
        if (etat.groupe) {
            const g = await TontineGroupe.findByPk(etat.groupe.id);
            const portefeuilles = g ? [g.portefeuilleId, g.portefeuilleCautionId].filter(Boolean) : [];
            const garanties = await TontineGarantie.findAll({ where: { groupeId: etat.groupe.id }, attributes: ['id'] });
            await models.TontineGarantieMouvement.destroy({ where: { garantieId: garanties.map(x => x.id) } });
            await TontineGarantie.destroy({ where: { groupeId: etat.groupe.id } });
            await models.TontineConsentementGarantie.destroy({ where: { groupeId: etat.groupe.id } });
            await Transaction.destroy({ where: { groupeTontineId: etat.groupe.id } });
            if (g) await g.destroy();
            if (portefeuilles.length) await Portefeuille.destroy({ where: { id: { [Op.in]: portefeuilles } } });
        }
        for (const [id, avant] of Object.entries(soldesInitiaux)) {
            await Portefeuille.update({ montantReserve: 0 }, { where: { id } });
            await Portefeuille.update({ solde: avant.solde, montantReserve: avant.reserve }, { where: { id } });
        }
        await db.close();
        console.log('✅ Base de donnees fermee, groupe et soldes restaures');
    });

    test('ouvre un groupe et rend son code d\'invitation au president', async () => {
        etat.groupe = await GroupeService.creerGroupe(etat.clients[0].id, {
            nom: NOM_GROUPE, montantParPeriode: MONTANT, frequence: 'mensuelle',
            membresMax: 3, modeOrdre: 'tirage', pourcentageCaution: 50
        });
        expect(etat.groupe.codeInvitation).toMatch(/^[A-Z0-9]{8}$/);
        expect(etat.groupe.statut).toBe('en_attente');
        const president = await TontineMembre.findOne({
            where: { groupeId: etat.groupe.id, clientId: etat.clients[0].id }
        });
        expect(president.role).toBe('president');
        ok(`Groupe ouvert, code ${etat.groupe.codeInvitation}, cotisation ${MONTANT} FCFA`);
    });

    test('fait entrer un membre par le code d\'invitation', async () => {
        for (const c of etat.clients.slice(1)) {
            await GroupeService.rejoindreGroupe(c.id, etat.groupe.codeInvitation);
        }
        const membres = await TontineMembre.count({ where: { groupeId: etat.groupe.id, statut: 'actif' } });
        expect(membres).toBe(3);
        await expect(
            GroupeService.rejoindreGroupe(etat.clients[1].id, etat.groupe.codeInvitation)
        ).rejects.toMatchObject({ code: 409 });
        ok('3 membres actifs, et la meme personne ne peut pas entrer deux fois');
    });

    test('bloque la caution de chaque membre au sequestre du groupe', async () => {
        const attendue = CautionService.montantAttendu(await TontineGroupe.findByPk(etat.groupe.id));
        for (const c of etat.clients) await CautionService.bloquer(c.id, etat.groupe.id);
        const cautions = await TontineCaution.findAll({ where: { groupeId: etat.groupe.id } });
        expect(cautions).toHaveLength(3);
        expect(arrondir(cautions[0].montantBloque)).toBe(attendue);
        ok(`Caution de ${attendue} FCFA bloquee pour chacun (50 % de la cotisation)`);
    });

    test('refuse le demarrage a un membre qui n\'est pas president', async () => {
        await expect(
            GroupeService.demarrerGroupe(etat.clients[1].id, etat.groupe.id)
        ).rejects.toMatchObject({ code: 403 });
        const groupe = await TontineGroupe.findByPk(etat.groupe.id);
        expect(groupe.statut).toBe('en_attente');
        ok('Demarrage refuse a un simple membre (403), le groupe reste en attente');
    });

    test('tire l\'ordre de passage et ouvre le premier cycle au demarrage', async () => {
        await GroupeService.demarrerGroupe(etat.clients[0].id, etat.groupe.id);
        etat.cycle1 = await TontineCycle.findOne({ where: { groupeId: etat.groupe.id, numeroCycle: 1 } });
        const tours = await TontineMembre.findAll({
            where: { groupeId: etat.groupe.id }, order: [['ordreBeneficiaire', 'ASC']]
        });
        expect(tours.map(m => m.ordreBeneficiaire)).toEqual([1, 2, 3]);
        expect(arrondir(etat.cycle1.montantAttendu)).toBe(MONTANT * 2);
        ok(`Cycle 1 ouvert, pot attendu ${MONTANT * 2} FCFA : le beneficiaire ne cotise pas pour son tour`);
    });

    test('debite le cotisant et alimente la caisse, au centime', async () => {
        const cotisation = (await TontineCotisation.findAll({ where: { cycleId: etat.cycle1.id } }))[0];
        const avant = await solde(cotisation.clientId);
        const caisse = await Portefeuille.findByPk(
            (await TontineGroupe.findByPk(etat.groupe.id)).portefeuilleId);
        const caisseAvant = arrondir(caisse.solde);

        await CycleService.cotiser(cotisation.clientId, etat.cycle1.id);

        expect(await solde(cotisation.clientId)).toBe(arrondir(avant - MONTANT));
        await caisse.reload();
        expect(arrondir(caisse.solde)).toBe(arrondir(caisseAvant + MONTANT));
        const ligne = await TontineCotisation.findByPk(cotisation.id);
        expect(ligne.statut).toBe('payee');
        ok(`Cotisation de ${MONTANT} FCFA : membre debite, caisse creditee du meme montant`);
    });

    test('refuse de verser un pot incomplet', async () => {
        await expect(
            CycleService.verser({ clientId: etat.clients[0].id }, etat.cycle1.id)
        ).rejects.toMatchObject({ code: 409 });
        const cycle = await TontineCycle.findByPk(etat.cycle1.id);
        expect(cycle.statut).not.toBe('complete');
        ok('Versement refuse tant qu\'une cotisation manque (409)');
    });

    test('verse le pot au beneficiaire et fait tourner la rotation', async () => {
        const restantes = await TontineCotisation.findAll({
            where: { cycleId: etat.cycle1.id, statut: { [Op.ne]: 'payee' } }
        });
        for (const c of restantes) await CycleService.cotiser(c.clientId, etat.cycle1.id);

        const beneficiaire = etat.cycle1.beneficiaireId;
        const avant = await solde(beneficiaire);
        const r = await CycleService.verser({ clientId: etat.clients[0].id }, etat.cycle1.id);

        expect(arrondir(await solde(beneficiaire))).toBe(arrondir(avant + r.net));
        expect((await TontineCycle.findByPk(etat.cycle1.id)).statut).toBe('complete');
        expect(r.cycleSuivant).toBeTruthy();
        expect(r.cycleSuivant.numeroCycle).toBe(2);
        ok(`Pot de ${r.net} FCFA verse (frais ${r.frais}), cycle 2 ouvert dans la foulee`);
    });

    test('leve une amende de retard a l\'echeance et mobilise la garantie du defaillant', async () => {
        const cycle2 = await TontineCycle.findOne({ where: { groupeId: etat.groupe.id, numeroCycle: 2 } });
        const cotisations = await TontineCotisation.findAll({ where: { cycleId: cycle2.id } });
        etat.defaillant = etat.clients.find(c => c.id === cotisations[0].clientId);
        for (const c of cotisations.slice(1)) await CycleService.cotiser(c.clientId, cycle2.id);

        // Le defaillant garantit ses cotisations a venir sur son epargne.
        etat.epargne = await Portefeuille.findOne({
            where: { ClientPortefeuilleId: etat.defaillant.id, typePortefeuille: 'epargne', estActif: true }
        });
        await Fonds.ajuster(etat.epargne, 'credit', 3 * MONTANT, null, {
            type: 'ajustement', clientId: etat.defaillant.id, description: 'Epargne a garantir'
        });
        // Ce qui reste a couvrir, caution deduite : bloquer davantage serait
        // refuse, une garantie ne protegeant pas au-dela de l'engagement.
        const CouvertureService = require('../../services/tontine/couverture.service');
        const couverture = await CouvertureService.pourMembre(etat.defaillant.id, etat.groupe.id);
        const aGarantir = arrondir(couverture.exposition - couverture.couvert);
        expect(aGarantir).toBeGreaterThan(0);
        const simulation = await GarantieService.simuler(
            etat.defaillant.id, etat.groupe.id, etat.epargne.id, aGarantir);
        const affectation = await GarantieService.affecter(etat.defaillant.id, etat.groupe.id,
            { portefeuilleId: etat.epargne.id, montant: aGarantir, hashTexte: simulation.hashTexte });
        etat.garantieBloquee = arrondir(affectation.garantie.montantInitial);

        await cycle2.update({ dateFinPrevue: new Date(Date.now() - 86400000) });
        const rapport = await CycleService.traiterEcheances();

        const amende = await TontineAmende.findOne({
            where: { groupeId: etat.groupe.id, clientId: etat.defaillant.id, motif: 'retard' }
        });
        expect(amende).toBeTruthy();
        expect(rapport.montantRecouvre).toBe(MONTANT);
        expect(rapport.garantiesMobilisees).toBeGreaterThan(0);
        const impayee = await TontineCotisation.findOne({
            where: { cycleId: cycle2.id, clientId: etat.defaillant.id }
        });
        expect(impayee.statut).toBe('payee');
        expect(arrondir(impayee.montantRecouvre)).toBe(MONTANT);
        ok(`Retard constate : amende de ${arrondir(amende.montant)} FCFA, ${rapport.montantRecouvre} FCFA recouvres sur la caution et la garantie`);
    });

    test('ne preleve sur la garantie que le montant manquant', async () => {
        const garantie = await TontineGarantie.findOne({
            where: { groupeId: etat.groupe.id, clientId: etat.defaillant.id }
        });
        const utilise = arrondir(garantie.montantUtilise);
        expect(utilise).toBeGreaterThan(0);
        expect(utilise).toBeLessThanOrEqual(arrondir(garantie.montantInitial));
        const pf = await Portefeuille.findByPk(etat.epargne.id);
        expect(Fonds.reserve(pf)).toBe(arrondir(arrondir(garantie.montantInitial) - utilise));
        ok(`${utilise} FCFA preleves sur ${arrondir(garantie.montantInitial)} bloques : le reste demeure au membre`);
    });

    test('ecrit chaque mouvement d\'argent au grand livre, en partie double', async () => {
        const mouvements = await LedgerMouvement.findAll({ where: { groupeTontineId: etat.groupe.id } });
        expect(mouvements.length).toBeGreaterThan(0);
        const types = [...new Set(mouvements.map(m => m.type))];
        expect(types).toEqual(expect.arrayContaining(['cotisation', 'versement', 'caution_blocage']));

        for (const m of mouvements) {
            const faces = await LedgerEcriture.findAll({ where: { mouvementId: m.id } });
            const debits = arrondir(faces.filter(f => f.sens === 'debit').reduce((s, f) => s + Number(f.montant), 0));
            const credits = arrondir(faces.filter(f => f.sens === 'credit').reduce((s, f) => s + Number(f.montant), 0));
            expect(faces.length).toBeGreaterThanOrEqual(2);
            expect(debits).toBe(credits);
            expect(debits).toBe(arrondir(m.montant));
        }
        ok(`${mouvements.length} mouvements ecrits (${types.join(', ')}) : debits et credits s'equilibrent`);
    });

    test('interdit a un membre de consulter la tontine d\'un autre groupe', async () => {
        const etranger = await Client.findOne({ where: { email: 'daniel@tontine.local' } });
        if (!etranger) return ok('Compte temoin absent : controle de confidentialite ignore');
        await expect(
            GarantieService.garantiesGroupe(etranger.id, etat.groupe.id)
        ).rejects.toMatchObject({ code: 403 });
        ok('Un non-membre n\'accede ni aux garanties ni aux montants du groupe (403)');
    });
});

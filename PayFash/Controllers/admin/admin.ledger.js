const { Op } = require('sequelize');
const { db, LedgerMouvement, LedgerEcriture, LedgerCompte, Client, Portefeuille } = require('../../models/index');
const { LedgerService } = require('../../services/ledger.service');

// =====================================================================
//  Grand livre, cote administration (section 30).
//
//  Consultation seule : on ne corrige pas un grand livre, on ecrit un
//  mouvement inverse. Les ajustements passent par le maker-checker.
// =====================================================================

const nombre = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const arrondir = (v) => Math.round(nombre(v) * 100) / 100;

// GET /api/admin/ledger/etat — la sante du livre en quatre chiffres
const etat = async (req, res) => {
    try {
        const [[compte]] = await db.query(
            'SELECT COUNT(*) mouvements, COALESCE(SUM(montant), 0) total FROM ledger_mouvements');
        const [[balance]] = await db.query(
            "SELECT COALESCE(SUM(CASE WHEN sens = 'debit' THEN montant ELSE -montant END), 0) ecart FROM ledger_ecritures");
        const [desequilibres] = await db.query(`
            SELECT m.id FROM ledger_mouvements m
              LEFT JOIN ledger_ecritures e ON e.mouvementId = m.id
             GROUP BY m.id
            HAVING COUNT(e.id) < 2
                OR ABS(SUM(CASE WHEN e.sens = 'debit' THEN e.montant ELSE -e.montant END)) > 0.004`);
        const [ecarts] = await db.query(`
            SELECT c.code, p.solde,
                   COALESCE(SUM(CASE WHEN e.sens = 'credit' THEN e.montant ELSE -e.montant END), 0) livre
              FROM ledger_comptes c
              JOIN Portefeuilles p ON p.id = c.portefeuilleId
              LEFT JOIN ledger_ecritures e ON e.compteId = c.id
             WHERE c.type = 'PORTEFEUILLE'
             GROUP BY c.id
            HAVING ABS(p.solde - livre) > 0.004`);
        const [types] = await db.query(
            'SELECT type, COUNT(*) nombre, COALESCE(SUM(montant), 0) total FROM ledger_mouvements GROUP BY type ORDER BY nombre DESC');

        return res.json({
            success: true,
            data: {
                mouvements: Number(compte.mouvements),
                total: arrondir(compte.total),
                balance: arrondir(balance.ecart),
                desequilibres: desequilibres.length,
                portefeuillesEnEcart: ecarts.map(e => ({
                    compte: e.code, solde: arrondir(e.solde), livre: arrondir(e.livre),
                    ecart: arrondir(nombre(e.solde) - nombre(e.livre))
                })),
                parType: types.map(t => ({ type: t.type, nombre: Number(t.nombre), total: arrondir(t.total) }))
            }
        });
    } catch (e) {
        console.error('[ledger] etat', e);
        return res.status(500).json({ success: false, error: e.message });
    }
};

// GET /api/admin/ledger?page&limit&type&clientId&groupeId&reference
const journal = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
        const where = {};
        if (req.query.type) where.type = req.query.type;
        if (req.query.clientId) where.clientId = parseInt(req.query.clientId, 10);
        if (req.query.groupeId) where.groupeTontineId = parseInt(req.query.groupeId, 10);
        if (req.query.reference) where.reference = { [Op.like]: `%${req.query.reference}%` };

        const { rows, count } = await LedgerMouvement.findAndCountAll({
            where, order: [['date', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit
        });

        // Les faces de chaque mouvement, avec le nom des comptes : un
        // journal sans ses contreparties ne prouve rien.
        const ecritures = await LedgerEcriture.findAll({ where: { mouvementId: rows.map(m => m.id) } });
        const comptes = await LedgerCompte.findAll({
            where: { id: { [Op.in]: [...new Set(ecritures.map(e => e.compteId))] } }
        });
        const parCompte = new Map(comptes.map(c => [c.id, c]));
        const clients = await Client.findAll({
            where: { id: { [Op.in]: [...new Set(rows.map(m => m.clientId).filter(Boolean))] } },
            attributes: ['id', 'nom']
        });
        const nomClient = new Map(clients.map(c => [c.id, c.nom]));

        return res.json({
            success: true,
            data: rows.map(m => ({
                id: m.id, reference: m.reference, type: m.type, description: m.description,
                montant: arrondir(m.montant), date: m.date,
                clientId: m.clientId, client: nomClient.get(m.clientId) || null,
                groupeTontineId: m.groupeTontineId, cycleTontineId: m.cycleTontineId,
                faces: ecritures.filter(e => e.mouvementId === m.id).map(e => ({
                    sens: e.sens, montant: arrondir(e.montant),
                    compte: parCompte.get(e.compteId) ? parCompte.get(e.compteId).code : null,
                    libelle: parCompte.get(e.compteId) ? parCompte.get(e.compteId).libelle : null
                }))
            })),
            meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
        });
    } catch (e) {
        console.error('[ledger] journal', e);
        return res.status(500).json({ success: false, error: e.message });
    }
};

// GET /api/admin/ledger/compte/:portefeuilleId — le releve d'un portefeuille
const releve = async (req, res) => {
    try {
        const portefeuilleId = parseInt(req.params.portefeuilleId, 10);
        const concordance = await LedgerService.concorde(portefeuilleId);
        if (!concordance) return res.status(404).json({ success: false, error: 'Aucun compte pour ce portefeuille' });
        const compte = await LedgerCompte.findOne({ where: { portefeuilleId } });
        const ecritures = await LedgerEcriture.findAll({
            where: { compteId: compte.id }, order: [['id', 'DESC']], limit: 100
        });
        const mouvements = await LedgerMouvement.findAll({
            where: { id: { [Op.in]: ecritures.map(e => e.mouvementId) } }
        });
        const parId = new Map(mouvements.map(m => [m.id, m]));
        return res.json({
            success: true,
            data: {
                compte: { code: compte.code, libelle: compte.libelle },
                ...concordance,
                lignes: ecritures.map(e => {
                    const m = parId.get(e.mouvementId);
                    return {
                        date: m ? m.date : null, type: m ? m.type : null,
                        description: m ? m.description : null,
                        sens: e.sens, montant: arrondir(e.montant), mouvementId: e.mouvementId
                    };
                })
            }
        });
    } catch (e) {
        console.error('[ledger] releve', e);
        return res.status(500).json({ success: false, error: e.message });
    }
};

module.exports = { etat, journal, releve };

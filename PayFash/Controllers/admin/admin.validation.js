// Maker-Checker : les opérations financières sensibles sont créées par un admin (maker)
// puis exécutées seulement après approbation par un AUTRE admin (checker).
const { PendingAction, Transaction, Portefeuille } = require('../../models/index');
const { logAction } = require('./audit');

// --- Exécuteurs réels (appelés à l'approbation) ---
async function executeRefund(payload) {
    const tx = await Transaction.findByPk(payload.transactionId);
    if (!tx) throw new Error('Transaction introuvable');
    if (tx.statut === 'remboursée') throw new Error('Transaction déjà remboursée');

    let wallet = await Portefeuille.findOne({ where: { ClientPortefeuilleId: tx.ClientTransactionId, estPrincipal: true } });
    if (!wallet) wallet = await Portefeuille.findOne({ where: { ClientPortefeuilleId: tx.ClientTransactionId, typePortefeuille: 'courant' } });
    if (!wallet) throw new Error('Portefeuille introuvable');

    wallet.solde += tx.montant;
    await wallet.save();
    await Transaction.create({
        montant: tx.montant, date: new Date(), type: 'remboursement', statut: 'Succès',
        description: `Remboursement (validé) de la transaction #${tx.id}`, frais: 0, ClientTransactionId: tx.ClientTransactionId
    });
    tx.statut = 'remboursée';
    await tx.save();
    return { nouveauSolde: wallet.solde };
}

async function executeAdjust(payload) {
    const { walletId, montant, sens, motif } = payload;
    const wallet = await Portefeuille.findByPk(walletId);
    if (!wallet) throw new Error('Portefeuille introuvable');
    if (sens === 'debit' && wallet.solde < montant) throw new Error('Solde insuffisant');
    wallet.solde += sens === 'credit' ? montant : -montant;
    await wallet.save();
    await Transaction.create({
        montant, date: new Date(), type: sens === 'credit' ? 'ajustement_credit' : 'ajustement_debit',
        statut: 'Succès', description: `Ajustement validé : ${motif || 'n/c'}`, frais: 0,
        ClientTransactionId: wallet.ClientPortefeuilleId
    });
    return { nouveauSolde: wallet.solde };
}

// Versement force d'un pot de tontine.
//
// Le noyau refuse de verser tant qu'une cotisation n'est pas soldee — et
// c'est bien ainsi. Mais un arbitrage humain reste parfois necessaire :
// un membre injoignable, un groupe bloque depuis des semaines, un litige
// tranche en faveur du beneficiaire.
//
// Cette porte de sortie ne peut pas etre ouverte par un seul
// administrateur : elle passe par le maker-checker, exactement comme un
// remboursement. Deux personnes, et une trace.
async function executeVersementTontine(payload) {
    const { cycleId, motif } = payload;
    const { TontineCycle, TontineCotisation } = require('../../models/index');
    const CycleService = require('../../services/tontine/cycle.service');

    const cycle = await TontineCycle.findByPk(cycleId);
    if (!cycle) throw new Error('Cycle introuvable');
    if (cycle.statut === 'complete') throw new Error('Ce cycle est deja verse');

    const { Op } = require('sequelize');
    const manquantes = await TontineCotisation.findAll({
        where: { cycleId, statut: { [Op.ne]: 'payee' } }
    });

    // Les cotisations absentes sont constatees IMPAYEES, pas marquees
    // payees. Les passer en « payee » ferait tomber le controle sans que
    // l'argent soit la : le grand livre annoncerait un pot complet devant
    // une caisse a moitie vide. La dette reste donc une dette, recouvrable
    // ensuite par la caution ou le garant.
    for (const c of manquantes) {
        await c.update({ statut: 'impayee' });
    }

    // Le beneficiaire recoit ce qui a reellement ete collecte.
    const r = await CycleService.verser({ systeme: true }, cycleId, { force: true });
    return {
        montantVerse: r.net,
        potTheorique: r.potAttendu,
        manqueConstate: r.manque,
        beneficiaireId: r.beneficiaireId,
        cotisationsImpayees: manquantes.length,
        motif: motif || null,
        cycleSuivant: r.cycleSuivant ? r.cycleSuivant.numeroCycle : null
    };
}

const EXECUTORS = {
    REFUND: executeRefund,
    WALLET_ADJUST: executeAdjust,
    TONTINE_VERSEMENT_FORCE: executeVersementTontine
};

// POST /api/admin/validation/demande   body: { type, payload, description }
const creerDemande = async (req, res) => {
    try {
        const { type, payload, description } = req.body;
        if (!EXECUTORS[type]) {
            return res.status(400).json({ success: false, error: 'Type d\'action non supporté' });
        }
        if (!payload) return res.status(400).json({ success: false, error: 'Payload requis' });

        const action = await PendingAction.create({
            type, payload, description: description || null,
            demandeurId: req.admin.id, demandeurEmail: req.admin.email
        });
        await logAction(req, 'PENDING_CREATE', `PendingAction#${action.id}`, { type });
        return res.status(201).json({ success: true, message: 'Demande créée, en attente de validation', data: action });
    } catch (error) {
        console.error('creerDemande:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/admin/validation/pending
const listePending = async (req, res) => {
    try {
        const actions = await PendingAction.findAll({ where: { statut: 'EN_ATTENTE' }, order: [['createdAt', 'DESC']] });
        return res.json({ success: true, data: actions });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/admin/validation/:id/approuver  — checker (≠ maker) exécute l'action
const approuver = async (req, res) => {
    try {
        const action = await PendingAction.findByPk(req.params.id);
        if (!action) return res.status(404).json({ success: false, error: 'Action introuvable' });
        if (action.statut !== 'EN_ATTENTE') {
            return res.status(400).json({ success: false, error: `Action déjà traitée (${action.statut})` });
        }
        if (action.demandeurId === req.admin.id) {
            return res.status(403).json({ success: false, error: 'Le validateur doit être différent du demandeur (maker-checker)' });
        }

        const payload = typeof action.payload === 'string' ? JSON.parse(action.payload) : action.payload;
        const result = await EXECUTORS[action.type](payload);

        action.statut = 'APPROUVE';
        action.validateurId = req.admin.id;
        await action.save();
        await logAction(req, 'PENDING_APPROVE', `PendingAction#${action.id}`, { type: action.type, result });
        return res.json({ success: true, message: 'Action validée et exécutée', data: { action, result } });
    } catch (error) {
        console.error('approuver pending:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/admin/validation/:id/rejeter   body: { motif }
const rejeter = async (req, res) => {
    try {
        const action = await PendingAction.findByPk(req.params.id);
        if (!action) return res.status(404).json({ success: false, error: 'Action introuvable' });
        if (action.statut !== 'EN_ATTENTE') {
            return res.status(400).json({ success: false, error: `Action déjà traitée (${action.statut})` });
        }
        action.statut = 'REJETE';
        action.validateurId = req.admin.id;
        action.motifRejet = req.body?.motif || null;
        await action.save();
        await logAction(req, 'PENDING_REJECT', `PendingAction#${action.id}`);
        return res.json({ success: true, message: 'Action rejetée', data: action });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { creerDemande, listePending, approuver, rejeter };

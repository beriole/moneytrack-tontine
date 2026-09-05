// Maker-Checker : les opérations financières sensibles sont créées par un admin (maker)
// puis exécutées seulement après approbation par un AUTRE admin (checker).
const { db, PendingAction, Transaction, Portefeuille } = require('../../models/index');
const { logAction } = require('./audit');

// Les mouvements internes d'une tontine ne se remboursent pas ici : l'argent
// est dans une caisse de groupe, pas chez la plateforme. Recrediter le client
// sans debiter la caisse creerait de la monnaie. Ces operations ont leurs
// propres voies de sortie (saisie de caution, appel au garant, versement
// force par le maker-checker).
const TYPES_NON_REMBOURSABLES = [
    'cotisation', 'versement', 'caution_blocage', 'caution_saisie', 'caution_liberation',
    'amende', 'apport_epargne', 'credit_decaissement', 'credit_remboursement',
    'partage_epargne', 'decote_enchere', 'frais_plateforme', 'appel_garant', 'echange_tour'
];

// --- Exécuteurs réels (appelés à l'approbation) ---
async function executeRefund(payload) {
    // Verrouille pour que deux approbations concurrentes ne remboursent pas
    // deux fois, et rend l'ecriture atomique avec le credit du solde.
    return db.transaction(async (t) => {
        const tx = await Transaction.findByPk(payload.transactionId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!tx) throw new Error('Transaction introuvable');
        if (tx.statut === 'remboursée') throw new Error('Transaction déjà remboursée');
        if (tx.groupeTontineId || TYPES_NON_REMBOURSABLES.includes(tx.type)) {
            throw new Error(`Une ecriture de tontine ne se rembourse pas par cette voie (type "${tx.type}")`);
        }
        if (!tx.ClientTransactionId) throw new Error('Transaction sans client rattaché');

        const base = { ClientPortefeuilleId: tx.ClientTransactionId };
        const verrou = { transaction: t, lock: t.LOCK.UPDATE };
        let wallet = await Portefeuille.findOne({ where: { ...base, estPrincipal: true }, ...verrou });
        if (!wallet) wallet = await Portefeuille.findOne({ where: { ...base, typePortefeuille: 'courant' }, ...verrou });
        if (!wallet) throw new Error('Portefeuille introuvable');

        await wallet.update({ solde: wallet.solde + tx.montant }, { transaction: t });
        await Transaction.create({
            montant: tx.montant, date: new Date(), type: 'remboursement', statut: 'Succès',
            description: `Remboursement (validé) de la transaction #${tx.id}`, frais: 0,
            ClientTransactionId: tx.ClientTransactionId
        }, { transaction: t });
        await tx.update({ statut: 'remboursée' }, { transaction: t });

        return { nouveauSolde: wallet.solde };
    });
}

async function executeAdjust(payload) {
    const { walletId, montant, sens, motif } = payload;
    const valeur = parseFloat(montant);
    if (!walletId || !(valeur > 0) || !['credit', 'debit'].includes(sens)) {
        throw new Error('Paramètres invalides (walletId, montant>0, sens credit|debit)');
    }

    return db.transaction(async (t) => {
        const wallet = await Portefeuille.findByPk(walletId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!wallet) throw new Error('Portefeuille introuvable');
        // Une caisse de tontine n'a pas de proprietaire : l'ecriture serait
        // orpheline, et le solde du groupe ne correspondrait plus a ses
        // cotisations. On refuse plutot que de desequilibrer un groupe.
        if (wallet.typePortefeuille === 'tontine') {
            throw new Error("Une caisse de tontine ne s'ajuste pas ici : passez par le module tontine");
        }
        if (sens === 'debit' && wallet.solde < valeur) throw new Error('Solde insuffisant');

        await wallet.update({ solde: wallet.solde + (sens === 'credit' ? valeur : -valeur) }, { transaction: t });
        await Transaction.create({
            montant: valeur, date: new Date(), type: sens === 'credit' ? 'ajustement_credit' : 'ajustement_debit',
            statut: 'Succès', description: `Ajustement validé : ${motif || 'n/c'}`, frais: 0,
            ClientTransactionId: wallet.ClientPortefeuilleId
        }, { transaction: t });

        return { nouveauSolde: wallet.solde };
    });
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
    const { TontineCycle } = require('../../models/index');
    const CycleService = require('../../services/tontine/cycle.service');

    const cycle = await TontineCycle.findByPk(cycleId);
    if (!cycle) throw new Error('Cycle introuvable');
    if (cycle.statut === 'complete') throw new Error('Ce cycle est deja verse');

    // Le constat des cotisations absentes appartient au versement lui-meme :
    // il se fait dans SA transaction (cycle.service.js). Le faire ici, avant
    // l'appel, laissait les cotisations marquees impayees meme quand le
    // versement echouait ensuite — par exemple sur une caisse vide.
    const r = await CycleService.verser({ systeme: true }, cycleId, { force: true });
    return {
        montantVerse: r.net,
        potTheorique: r.potAttendu,
        manqueConstate: r.manque,
        beneficiaireId: r.beneficiaireId,
        cotisationsImpayees: r.cotisationsImpayees,
        motif: motif || null,
        cycleSuivant: r.cycleSuivant ? r.cycleSuivant.numeroCycle : null
    };
}

const EXECUTORS = {
    REFUND: executeRefund,
    WALLET_ADJUST: executeAdjust,
    TONTINE_VERSEMENT_FORCE: executeVersementTontine
};

/**
 * Ouvre le volet « maker » d'une operation sensible.
 *
 * Expose separement pour que les anciennes routes d'execution directe
 * (/transaction/:id/rembourser, /transaction/wallet/ajuster) deposent une
 * demande au lieu d'agir : elles contournaient le maker-checker que le reste
 * du back-office impose, alors qu'elles font exactement le meme mouvement.
 */
async function ouvrirDemande(req, type, payload, description) {
    if (!EXECUTORS[type]) throw new Error("Type d'action non supporté");
    if (!payload) throw new Error('Payload requis');

    const action = await PendingAction.create({
        type, payload, description: description || null,
        demandeurId: req.admin.id, demandeurEmail: req.admin.email
    });
    await logAction(req, 'PENDING_CREATE', `PendingAction#${action.id}`, { type });
    return action;
}

// POST /api/admin/validation/demande   body: { type, payload, description }
const creerDemande = async (req, res) => {
    try {
        const { type, payload, description } = req.body;
        if (!EXECUTORS[type]) {
            return res.status(400).json({ success: false, error: 'Type d\'action non supporté' });
        }
        if (!payload) return res.status(400).json({ success: false, error: 'Payload requis' });

        const action = await ouvrirDemande(req, type, payload, description);
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

module.exports = { creerDemande, listePending, approuver, rejeter, ouvrirDemande };

'use strict';

const { Op } = require('sequelize');
const { LedgerCompte, LedgerMouvement, LedgerEcriture, Portefeuille } = require('../models');

// =====================================================================
//  Grand livre en partie double (section 30).
//
//  « Ne jamais faire simplement wallet.balance -= amount. » Le solde d'un
//  portefeuille restait modifie d'un cote, une ligne descriptive ecrite de
//  l'autre, sans qu'aucun lien n'impose que les deux se repondent. Ici,
//  tout mouvement s'ecrit en au moins deux faces :
//
//    debit   l'argent SORT de ce compte
//    credit  l'argent ENTRE dans ce compte
//
//  et la somme des debits egale la somme des credits. Un mouvement qui ne
//  s'equilibre pas est refuse : il n'y a pas de demi-ecriture.
//
//  Les comptes : un par portefeuille, plus le monde exterieur (Mobile
//  Money), l'ouverture (reprise des soldes) et les ajustements de
//  l'administration. Un mouvement vers le monde exterieur est equilibre
//  lui aussi — c'est la frontiere de MoneyTrack, pas un trou.
//
//  Le grand livre s'ecrit DANS la transaction de l'appelant : si le
//  mouvement d'argent est annule, son ecriture l'est avec lui.
// =====================================================================

const EXTERNE_MOBILE_MONEY = 'EXT:MOBILE_MONEY';
const SYS_AJUSTEMENT = 'SYS:AJUSTEMENT';
const SYS_OUVERTURE = 'SYS:OUVERTURE';

class ErreurLedger extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ErreurLedger';
    }
}

const nombre = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};
const arrondir = (v) => Math.round(nombre(v) * 100) / 100;

class LedgerService {

    static get COMPTES() {
        return { EXTERNE_MOBILE_MONEY, SYS_AJUSTEMENT, SYS_OUVERTURE };
    }

    /**
     * Le compte d'un portefeuille. Cree a la volee : un portefeuille ouvert
     * apres la mise en place du grand livre doit pouvoir s'en servir tout
     * de suite, et son compte part alors de zero, comme son solde.
     */
    static async comptePortefeuille(portefeuille, t = null) {
        const id = typeof portefeuille === 'object' ? portefeuille.id : Number(portefeuille);
        const existant = await LedgerCompte.findOne({ where: { portefeuilleId: id }, transaction: t });
        if (existant) return existant;
        // Un compte dont le portefeuille a ete supprime garde son code : il
        // n'est pas recree, il est repris.
        const ancien = await LedgerCompte.findOne({ where: { code: `PF:${id}` }, transaction: t });
        if (ancien) return ancien;

        const pf = typeof portefeuille === 'object' && portefeuille.nom !== undefined
            ? portefeuille
            : await Portefeuille.findByPk(id, { transaction: t });
        if (!pf) throw new ErreurLedger(404, `Portefeuille ${id} introuvable : aucun compte a ouvrir`);
        return LedgerCompte.create({
            code: `PF:${id}`,
            type: 'PORTEFEUILLE',
            libelle: `${pf.nom || pf.typePortefeuille || 'Portefeuille'} #${id}`,
            portefeuilleId: id,
            devise: pf.devise || 'XAF'
        }, { transaction: t });
    }

    /** Un compte de systeme, par son code. */
    static async compte(code, t = null) {
        const c = await LedgerCompte.findOne({ where: { code }, transaction: t });
        if (!c) throw new ErreurLedger(500, `Compte de grand livre absent : ${code}`);
        return c;
    }

    /**
     * Enregistre un mouvement et ses ecritures, dans la transaction de
     * l'appelant. Refuse tout ce qui ne tient pas debout : moins de deux
     * faces, un montant nul ou negatif, un desequilibre au centime.
     *
     *   ecritures : [{ compte | compteId | portefeuille, sens, montant }]
     */
    static async enregistrer({ reference = null, type, description = null, clientId = null,
        groupeTontineId = null, cycleTontineId = null, transactionId = null, date = null, ecritures = [] }, t = null) {

        if (!type) throw new ErreurLedger(400, 'Un mouvement de grand livre a un type');
        if (!Array.isArray(ecritures) || ecritures.length < 2) {
            throw new ErreurLedger(400, "Un mouvement s'ecrit en deux faces au moins : d'ou vient l'argent, ou il va");
        }

        const lignes = [];
        let debits = 0;
        let credits = 0;
        for (const e of ecritures) {
            const montant = arrondir(e.montant);
            if (!(montant > 0)) throw new ErreurLedger(400, 'Chaque ecriture porte un montant strictement positif');
            if (e.sens !== 'debit' && e.sens !== 'credit') {
                throw new ErreurLedger(400, `Sens d'ecriture inconnu : ${e.sens}`);
            }
            const compte = e.compte
                || (e.portefeuille ? await this.comptePortefeuille(e.portefeuille, t) : null)
                || (e.compteId ? await LedgerCompte.findByPk(e.compteId, { transaction: t }) : null);
            if (!compte) throw new ErreurLedger(400, 'Ecriture sans compte');
            lignes.push({ compteId: compte.id, sens: e.sens, montant });
            if (e.sens === 'debit') debits = arrondir(debits + montant);
            else credits = arrondir(credits + montant);
        }

        if (debits !== credits) {
            throw new ErreurLedger(409,
                `Mouvement desequilibre : ${debits} au debit, ${credits} au credit. Rien n'est enregistre.`);
        }

        // Rejeu : la meme reference designe le meme mouvement, deja ecrit.
        if (reference) {
            const deja = await LedgerMouvement.findOne({ where: { reference }, transaction: t });
            if (deja) return deja;
        }

        const mouvement = await LedgerMouvement.create({
            reference, type, description: description ? String(description).slice(0, 255) : null,
            montant: debits, clientId, groupeTontineId, cycleTontineId, transactionId,
            date: date || new Date()
        }, { transaction: t });

        await LedgerEcriture.bulkCreate(
            lignes.map(l => ({ ...l, mouvementId: mouvement.id })), { transaction: t });
        return mouvement;
    }

    /** Raccourci : d'un portefeuille a un autre. */
    static async transfert(source, destination, montant, contexte, t = null) {
        return this.enregistrer({
            ...contexte,
            ecritures: [
                { portefeuille: source, sens: 'debit', montant },
                { portefeuille: destination, sens: 'credit', montant }
            ]
        }, t);
    }

    /**
     * Raccourci : de l'argent qui entre dans MoneyTrack ou qui en sort.
     * `sens` est celui du PORTEFEUILLE : 'credit' pour une recharge,
     * 'debit' pour un retrait.
     */
    static async mouvementExterne(portefeuille, sens, montant, contexte, t = null, codeExterne = EXTERNE_MOBILE_MONEY) {
        const externe = await this.compte(codeExterne, t);
        return this.enregistrer({
            ...contexte,
            ecritures: [
                { portefeuille, sens, montant },
                { compte: externe, sens: sens === 'credit' ? 'debit' : 'credit', montant }
            ]
        }, t);
    }

    // -----------------------------------------------------------------
    //  Lecture
    // -----------------------------------------------------------------
    /** Solde d'un compte selon le grand livre : credits moins debits. */
    static async soldeCompte(compteId, t = null) {
        const [[r]] = await LedgerMouvement.sequelize.query(`
            SELECT COALESCE(SUM(CASE WHEN sens = 'credit' THEN montant ELSE -montant END), 0) solde
              FROM ledger_ecritures WHERE compteId = ?`,
        { replacements: [compteId], transaction: t });
        return arrondir(r.solde);
    }

    /** Le grand livre et le portefeuille disent-ils la meme chose ? */
    static async concorde(portefeuilleId, t = null) {
        const compte = await LedgerCompte.findOne({ where: { portefeuilleId }, transaction: t });
        const pf = await Portefeuille.findByPk(portefeuilleId, { transaction: t });
        if (!compte || !pf) return null;
        const livre = await this.soldeCompte(compte.id, t);
        return { portefeuilleId, solde: arrondir(pf.solde), livre, ecart: arrondir(arrondir(pf.solde) - livre) };
    }

    /** Les mouvements d'un client, les plus recents d'abord. */
    static async mouvementsClient(clientId, limite = 50) {
        return LedgerMouvement.findAll({
            where: { clientId }, order: [['date', 'DESC'], ['id', 'DESC']], limit: Math.min(200, limite)
        });
    }

    /** Le detail d'un mouvement : ses faces, avec le nom des comptes. */
    static async detail(mouvementId) {
        const mouvement = await LedgerMouvement.findByPk(mouvementId);
        if (!mouvement) throw new ErreurLedger(404, 'Mouvement introuvable');
        const ecritures = await LedgerEcriture.findAll({ where: { mouvementId }, order: [['id', 'ASC']] });
        const comptes = await LedgerCompte.findAll({
            where: { id: { [Op.in]: [...new Set(ecritures.map(e => e.compteId))] } }
        });
        const nom = new Map(comptes.map(c => [c.id, c]));
        return {
            mouvement,
            ecritures: ecritures.map(e => ({
                sens: e.sens, montant: arrondir(e.montant),
                compte: nom.get(e.compteId) ? nom.get(e.compteId).code : null,
                libelle: nom.get(e.compteId) ? nom.get(e.compteId).libelle : null
            }))
        };
    }
}

module.exports = { LedgerService, ErreurLedger };

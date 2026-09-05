const ExcelJS = require('exceljs');
const { fn, col, Op } = require('sequelize');
const {
    db, Client, Portefeuille, Transaction,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation,
    TontineAmende, TontineCaution, TontinePoolCredit, TontineDemandeCredit,
    TontineVote, TontinePartage
} = require('../../models/index');
const { logAction } = require('./audit');

// =====================================================================
//  Back-office tontine.
//
//  Il se branche sur l'existant plutot que de refaire : le RBAC a sept
//  roles, le journal d'audit, le maker-checker et les exports Excel sont
//  deja la. Ce fichier ne fait qu'ouvrir la tontine a ces outils.
//
//  Un principe gouverne tout : l'administrateur OBSERVE et ARBITRE, il ne
//  se substitue pas au groupe. Un versement force ne peut donc pas etre
//  decide seul — il passe par le maker-checker, comme un remboursement.
// =====================================================================

const nombre = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const arrondir = (v) => Math.round(nombre(v) * 100) / 100;
const jours = (n) => new Date(Date.now() - n * 86400000);

// GET /api/admin/tontine/stats
const stats = async (req, res) => {
    try {
        const [
            groupes, actifs, enAttente, termines,
            membres, cycles, cyclesEnDefaut,
            cotisations, cotisationsImpayees,
            amendesDues, cautionsBloquees, credits, nouveaux30j
        ] = await Promise.all([
            TontineGroupe.count(),
            TontineGroupe.count({ where: { statut: 'actif' } }),
            TontineGroupe.count({ where: { statut: 'en_attente' } }),
            TontineGroupe.count({ where: { statut: 'termine' } }),
            TontineMembre.count({ where: { statut: 'actif' } }),
            TontineCycle.count(),
            TontineCycle.count({ where: { statut: 'en_defaut' } }),
            TontineCotisation.count(),
            TontineCotisation.count({ where: { statut: { [Op.in]: ['en_retard', 'impayee'] } } }),
            TontineAmende.sum('montant', { where: { statut: 'due' } }),
            TontineCaution.sum('montantBloque', { where: { statut: { [Op.ne]: 'liberee' } } }),
            TontineDemandeCredit.count({ where: { statut: 'decaissee' } }),
            TontineGroupe.count({ where: { createdAt: { [Op.gte]: jours(30) } } }),
        ]);

        // Encours reel : ce que les caisses detiennent a cet instant.
        const encours = await Portefeuille.sum('solde', { where: { typePortefeuille: 'tontine' } });

        // Les frais preleves par la plateforme sur les versements.
        const frais = await Transaction.sum('montant', { where: { type: 'frais_plateforme' } });
        const volumeVerse = await Transaction.sum('montant', { where: { type: 'versement' } });

        // Taux de defaut : le seul indicateur qui dit si le produit tient.
        const tauxDefaut = cotisations > 0
            ? Math.round((cotisationsImpayees / cotisations) * 10000) / 100
            : 0;

        return res.status(200).json({
            groupes: { total: groupes, actifs, enAttente, termines, nouveaux30j },
            membres,
            cycles: { total: cycles, enDefaut: cyclesEnDefaut },
            cotisations: { total: cotisations, impayees: cotisationsImpayees, tauxDefaut },
            encoursCaisses: arrondir(encours),
            amendesDues: arrondir(amendesDues),
            cautionsBloquees: arrondir(cautionsBloquees),
            creditsEnCours: credits,
            volumeVerse: arrondir(volumeVerse),
            fraisPerçus: arrondir(frais),
            sante: {
                tauxDefaut,
                alerte: tauxDefaut > 15
                    ? `Taux de defaut eleve (${tauxDefaut} %) : la discipline des groupes se degrade.`
                    : null
            }
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

// GET /api/admin/tontine/groupes?statut=&q=&page=&taille=
const listeGroupes = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const taille = Math.min(100, parseInt(req.query.taille, 10) || 25);
        const where = {};
        if (req.query.statut) where.statut = req.query.statut;
        if (req.query.q) where.nom = { [Op.like]: `%${req.query.q}%` };

        const { rows, count } = await TontineGroupe.findAndCountAll({
            where,
            include: [{ model: Client, as: 'createur', attributes: ['id', 'nom', 'email'] }],
            order: [['createdAt', 'DESC']],
            limit: taille,
            offset: (page - 1) * taille
        });

        // On enrichit avec ce qui interesse un administrateur : l'argent
        // detenu et les impayes, pas les champs de configuration.
        const groupes = await Promise.all(rows.map(async (g) => {
            const caisse = g.portefeuilleId ? await Portefeuille.findByPk(g.portefeuilleId) : null;
            const cycles = await TontineCycle.findAll({ where: { groupeId: g.id }, attributes: ['id'] });
            const impayees = cycles.length
                ? await TontineCotisation.count({
                    where: { cycleId: { [Op.in]: cycles.map(c => c.id) }, statut: { [Op.in]: ['en_retard', 'impayee'] } }
                })
                : 0;
            return {
                ...g.toJSON(),
                soldeCaisse: caisse ? arrondir(caisse.solde) : 0,
                cotisationsImpayees: impayees
            };
        }));

        return res.status(200).json({ groupes, total: count, page, taille });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

// GET /api/admin/tontine/groupes/:id
const detailGroupe = async (req, res) => {
    try {
        const groupe = await TontineGroupe.findByPk(req.params.id, {
            include: [
                { model: Client, as: 'createur', attributes: ['id', 'nom', 'email', 'telephone'] },
                {
                    model: TontineMembre, as: 'membres',
                    include: [{ model: Client, as: 'client', attributes: ['id', 'nom', 'email', 'telephone'] }]
                },
                { model: TontinePoolCredit, as: 'poolCredit', required: false }
            ],
            order: [[{ model: TontineMembre, as: 'membres' }, 'ordreBeneficiaire', 'ASC']]
        });
        if (!groupe) return res.status(404).json({ error: 'Groupe introuvable' });

        const cycles = await TontineCycle.findAll({
            where: { groupeId: groupe.id },
            include: [{ model: Client, as: 'beneficiaire', attributes: ['id', 'nom'] }],
            order: [['numeroCycle', 'ASC']]
        });

        const cycleCourant = cycles.find(c => c.numeroCycle === groupe.numeroCycleActuel) || null;
        const cotisations = cycleCourant
            ? await TontineCotisation.findAll({
                where: { cycleId: cycleCourant.id },
                include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }]
            })
            : [];

        const portefeuilles = {};
        for (const [cle, id] of [['caisse', groupe.portefeuilleId],
                                 ['cautions', groupe.portefeuilleCautionId],
                                 ['epargne', groupe.portefeuilleEpargneId]]) {
            if (!id) { portefeuilles[cle] = null; continue; }
            const pf = await Portefeuille.findByPk(id);
            portefeuilles[cle] = pf ? { id: pf.id, nom: pf.nom, solde: arrondir(pf.solde) } : null;
        }

        const [amendes, cautions, credits, votes, partages] = await Promise.all([
            TontineAmende.findAll({
                where: { groupeId: groupe.id },
                include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }],
                order: [['createdAt', 'DESC']], limit: 50
            }),
            TontineCaution.findAll({
                where: { groupeId: groupe.id },
                include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }]
            }),
            groupe.poolCredit
                ? TontineDemandeCredit.findAll({
                    where: { poolId: groupe.poolCredit.id },
                    include: [{ model: Client, as: 'emprunteur', attributes: ['id', 'nom'] }]
                })
                : [],
            TontineVote.findAll({ where: { groupeId: groupe.id }, order: [['createdAt', 'DESC']], limit: 20 }),
            TontinePartage.findAll({ where: { groupeId: groupe.id }, order: [['exercice', 'DESC']] }),
        ]);

        return res.status(200).json({
            groupe, portefeuilles, cycles, cycleCourant, cotisations,
            amendes, cautions, credits, votes, partages
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

// GET /api/admin/tontine/anomalies
//
// Ce que l'administrateur doit voir en premier : les groupes qui ne
// tournent plus rond, sans avoir a les ouvrir un par un.
const anomalies = async (req, res) => {
    try {
        const liste = [];

        const enDefaut = await TontineCycle.findAll({
            where: { statut: 'en_defaut' },
            include: [{ model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom'] }],
            limit: 100
        });
        for (const c of enDefaut) {
            const impayees = await TontineCotisation.count({
                where: { cycleId: c.id, statut: { [Op.ne]: 'payee' } }
            });
            liste.push({
                gravite: 'haute', type: 'cycle_en_defaut',
                groupeId: c.groupeId, groupe: c.groupe?.nom,
                message: `Cycle ${c.numeroCycle} en defaut : ${impayees} cotisation(s) non soldee(s).`,
                depuis: c.dateFinPrevue
            });
        }

        // Une caisse qui garde de l'argent apres un versement signale une
        // rupture de l'invariant : elle doit revenir a zero.
        const caisses = await Portefeuille.findAll({
            where: { typePortefeuille: 'tontine', groupeTontineId: { [Op.ne]: null }, solde: { [Op.gt]: 0 } }
        });
        for (const pf of caisses) {
            const g = await TontineGroupe.findByPk(pf.groupeTontineId);
            if (!g || g.portefeuilleId !== pf.id) continue;   // sequestre ou epargne : normal
            const cycle = await TontineCycle.findOne({
                where: { groupeId: g.id, numeroCycle: g.numeroCycleActuel }
            });
            if (cycle && arrondir(cycle.montantCollecte) === arrondir(pf.solde)) continue; // collecte en cours
            liste.push({
                gravite: 'moyenne', type: 'caisse_non_vidangee',
                groupeId: g.id, groupe: g.nom,
                message: `La caisse detient ${arrondir(pf.solde)} FCFA hors collecte en cours.`
            });
        }

        const bloques = await TontineGroupe.findAll({
            where: { statut: 'en_attente', createdAt: { [Op.lte]: jours(60) } },
            limit: 50
        });
        for (const g of bloques) {
            liste.push({
                gravite: 'basse', type: 'groupe_jamais_demarre',
                groupeId: g.id, groupe: g.nom,
                message: `Cree il y a plus de 60 jours et jamais demarre (${g.membresActuels}/${g.membresMax} membres).`
            });
        }

        const ordre = { haute: 0, moyenne: 1, basse: 2 };
        liste.sort((a, b) => ordre[a.gravite] - ordre[b.gravite]);
        return res.status(200).json({ anomalies: liste, total: liste.length });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

// POST /api/admin/tontine/groupes/:id/geler   body: { motif }
//
// Geler suspend le groupe sans toucher a l'argent : les cotisations et
// versements s'arretent, les soldes restent ou ils sont. C'est une mesure
// conservatoire, pas une sanction.
const geler = async (req, res) => {
    try {
        const groupe = await TontineGroupe.findByPk(req.params.id);
        if (!groupe) return res.status(404).json({ error: 'Groupe introuvable' });
        if (groupe.statut === 'suspendu') return res.status(409).json({ error: 'Ce groupe est deja gele' });
        if (groupe.statut === 'termine') return res.status(409).json({ error: 'Ce groupe est termine' });

        const ancien = groupe.statut;
        await groupe.update({ statut: 'suspendu' });
        await logAction(req, 'TONTINE_GEL', `groupe:${groupe.id}`,
            { nom: groupe.nom, statutAvant: ancien, motif: req.body.motif || null });

        return res.status(200).json({
            message: `Groupe « ${groupe.nom} » gele. Les cotisations et versements sont suspendus ; aucun solde n'a bouge.`,
            groupe
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

// POST /api/admin/tontine/groupes/:id/degeler
const degeler = async (req, res) => {
    try {
        const groupe = await TontineGroupe.findByPk(req.params.id);
        if (!groupe) return res.status(404).json({ error: 'Groupe introuvable' });
        if (groupe.statut !== 'suspendu') return res.status(409).json({ error: "Ce groupe n'est pas gele" });

        // On rend au groupe l'etat qui correspond a sa realite : s'il a un
        // cycle en cours, il est actif ; sinon il attend son demarrage.
        const statut = groupe.numeroCycleActuel > 0 ? 'actif' : 'en_attente';
        await groupe.update({ statut });
        await logAction(req, 'TONTINE_DEGEL', `groupe:${groupe.id}`, { nom: groupe.nom, statutRendu: statut });

        return res.status(200).json({ message: `Groupe « ${groupe.nom} » reactive (${statut}).`, groupe });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

// GET /api/admin/tontine/membres/:clientId
// La fiche tontine d'un client, pour le support qui recoit un appel.
const ficheClient = async (req, res) => {
    try {
        const client = await Client.findByPk(req.params.clientId, {
            attributes: ['id', 'nom', 'email', 'telephone', 'isActive']
        });
        if (!client) return res.status(404).json({ error: 'Client introuvable' });

        const adhesions = await TontineMembre.findAll({
            where: { clientId: client.id },
            include: [{ model: TontineGroupe, as: 'groupe', attributes: ['id', 'nom', 'statut', 'montantParPeriode'] }]
        });

        const [amendes, cautions, impayees] = await Promise.all([
            TontineAmende.findAll({ where: { clientId: client.id }, order: [['createdAt', 'DESC']], limit: 50 }),
            TontineCaution.findAll({ where: { clientId: client.id } }),
            TontineCotisation.count({ where: { clientId: client.id, statut: { [Op.in]: ['en_retard', 'impayee'] } } }),
        ]);

        const total = await TontineCotisation.count({ where: { clientId: client.id } });
        const payees = await TontineCotisation.count({ where: { clientId: client.id, statut: 'payee' } });

        return res.status(200).json({
            client,
            adhesions,
            amendes,
            cautions,
            ponctualite: {
                cotisations: total,
                payees,
                impayees,
                taux: total > 0 ? Math.round((payees / total) * 10000) / 100 : null
            }
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

// GET /api/admin/tontine/export
const exporter = async (req, res) => {
    try {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'MoneyTrack';
        wb.created = new Date();

        const wsG = wb.addWorksheet('Groupes');
        wsG.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Nom', key: 'nom', width: 30 },
            { header: 'Type', key: 'type', width: 12 },
            { header: 'Statut', key: 'statut', width: 12 },
            { header: 'Cotisation', key: 'montant', width: 14 },
            { header: 'Frequence', key: 'frequence', width: 14 },
            { header: 'Membres', key: 'membres', width: 10 },
            { header: 'Cycle', key: 'cycle', width: 8 },
            { header: 'Caisse (FCFA)', key: 'caisse', width: 15 },
            { header: 'Organisateur', key: 'createur', width: 24 },
            { header: 'Cree le', key: 'cree', width: 14 },
        ];

        const groupes = await TontineGroupe.findAll({
            include: [{ model: Client, as: 'createur', attributes: ['nom'] }],
            order: [['createdAt', 'DESC']]
        });
        for (const g of groupes) {
            const caisse = g.portefeuilleId ? await Portefeuille.findByPk(g.portefeuilleId) : null;
            wsG.addRow({
                id: g.id, nom: g.nom, type: g.type, statut: g.statut,
                montant: arrondir(g.montantParPeriode), frequence: g.frequence,
                membres: `${g.membresActuels}/${g.membresMax}`, cycle: g.numeroCycleActuel,
                caisse: caisse ? arrondir(caisse.solde) : 0,
                createur: g.createur?.nom || '—',
                cree: g.createdAt ? new Date(g.createdAt).toLocaleDateString('fr-FR') : ''
            });
        }

        const wsC = wb.addWorksheet('Cotisations impayees');
        wsC.columns = [
            { header: 'Groupe', key: 'groupe', width: 28 },
            { header: 'Cycle', key: 'cycle', width: 8 },
            { header: 'Membre', key: 'membre', width: 24 },
            { header: 'Du', key: 'du', width: 12 },
            { header: 'Paye', key: 'paye', width: 12 },
            { header: 'Reste', key: 'reste', width: 12 },
            { header: 'Statut', key: 'statut', width: 12 },
            { header: 'Echeance', key: 'echeance', width: 14 },
        ];
        const impayees = await TontineCotisation.findAll({
            where: { statut: { [Op.in]: ['en_retard', 'impayee', 'partielle'] } },
            include: [
                { model: Client, as: 'client', attributes: ['nom'] },
                { model: TontineCycle, as: 'cycle', include: [{ model: TontineGroupe, as: 'groupe', attributes: ['nom'] }] }
            ],
            limit: 5000
        });
        for (const c of impayees) {
            wsC.addRow({
                groupe: c.cycle?.groupe?.nom || '—',
                cycle: c.cycle?.numeroCycle || '—',
                membre: c.client?.nom || `#${c.clientId}`,
                du: arrondir(c.montantDu), paye: arrondir(c.montantPaye),
                reste: arrondir(nombre(c.montantDu) - nombre(c.montantPaye)),
                statut: c.statut,
                echeance: c.dateEcheance ? new Date(c.dateEcheance).toLocaleDateString('fr-FR') : ''
            });
        }

        for (const ws of [wsG, wsC]) {
            ws.getRow(1).font = { bold: true };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
            ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        }

        await logAction(req, 'TONTINE_EXPORT', 'tontine', { groupes: groupes.length, impayees: impayees.length });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="tontines.xlsx"');
        await wb.xlsx.write(res);
        return res.end();
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

module.exports = { stats, listeGroupes, detailGroupe, anomalies, geler, degeler, ficheClient, exporter };

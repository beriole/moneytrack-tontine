const { db, Epargne, TransactionEpargne, EpargneAutomatique, Portefeuille, Transaction } = require('../../models');
const { STATUTS } = require('../../services/statutTransaction');
const Fonds = require('../../services/fonds.service');
const { Op } = require('sequelize');

// ============================================
// ÉPARGNE AVANCÉE - Taux, Objectifs, Automatique, Tire-lire
// ============================================

// Citations motivantes
const CITATIONS = [
    "L'épargne est la vertu des gens prévoyants.",
    "Un tiens vaut mieux que deux tu l'auras.",
    "Épargnez pour votre avenir, pas pour les urgences.",
    "Les petits ruisseaux font les grandes rivières.",
    "L'argent économisé est argent gagné.",
    "Commencez où vous êtes, utilisez ce que vous avez, faites ce que vous pouvez.",
    "La meilleure время d'épargner était hier. La prochaine meilleure est aujourd'hui.",
    "Votre avenir commence par vos économies d'aujourd'hui."
];

// Créer une épargne avec options avancées
const creerEpargneAvancee = async (req, res) => {
    const clientId = req.user.id;
    const {
        objectif,
        date_debut,
        date_fin,
        montant_total,
        // Nouveaux champs
        tauxInteret = 0,
        imageObjectif,
        couleur = '#3498db',
        icone = 'piggy-bank',
        descriptionMotivation,
        frequenceDepot,
        montantRecurrent,
        estTireLire = false,
        estSecrete = false,
        motivationQuote
    } = req.body;

    try {
        // Validation des dates
        const debut = new Date(date_debut);
        const fin = date_fin ? new Date(date_fin) : null;
        
        if (isNaN(debut.getTime())) {
            return res.status(400).json({ error: "Date de début invalide" });
        }

        // Calculer la progression initiale
        const progression = 0;

        const epargne = await Epargne.create({
            // Le proprietaire n'etait pas renseigne : l'objectif cree ici
            // naissait orphelin, introuvable ensuite par son auteur comme
            // par tous les autres ecrans.
            user_id: clientId,
            objectif,
            date_debut: debut,
            date_fin: fin,
            montant_total,
            montant_cumule: 0,
            statut: 'en cours',
            // Nouveaux champs
            tauxInteret,
            capitalInitial: 0,
            interetCumule: 0,
            imageObjectif,
            couleur,
            icone,
            descriptionMotivation,
            frequenceDepot,
            montantRecurrent,
            estTireLire,
            estSecrete,
            motivationQuote: motivationQuote || CITATIONS[Math.floor(Math.random() * CITATIONS.length)],
            progression
        });

        res.status(201).json({
            message: "Épargne créée avec succès",
            epargne
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création de l'épargne" });
    }
};

// Déposer sur une épargne avec calcul d'intérêts
// =====================================================================
//  Argent reel et compteur d'objectif.
//
//  Un objectif d'epargne est un COMPTEUR : y deposer ne met, par defaut,
//  aucun argent de cote. Deux parametres le reliaient pourtant a des
//  portefeuilles, et ils etaient dangereux :
//
//    - le depot debitait `portefeuilleSourceId` sans en verifier le
//      proprietaire, sans transaction, sans rien crediter en face — l'argent
//      disparaissait — et avec un montant NEGATIF le « debit » creditait le
//      portefeuille : de l'argent cree a partir de rien ;
//    - le retrait creditait `portefeuilleCibleId` — n'importe lequel — sans
//      rien debiter nulle part : un objectif rempli gratuitement par la
//      route ordinaire se vidait en argent reel.
//
//  La regle est desormais qu'aucun franc n'est cree ni detruit :
//
//    depot avec source   source (au client)  ->  portefeuille epargne
//    retrait avec cible  portefeuille epargne ->  cible (au client)
//
//  Le portefeuille epargne, cree a l'inscription, est celui ou l'argent
//  d'un objectif vit reellement. Sans ces parametres, seul le compteur
//  bouge, comme avant.
// =====================================================================

function erreur(statut, message, details = {}) {
    return Object.assign(new Error(message), { statut, ...details });
}

/** Un montant strictement positif, au centime. */
function montantValide(montant) {
    const m = Math.round(Number(montant) * 100) / 100;
    if (!Number.isFinite(m) || m <= 0) throw erreur(400, 'Le montant doit etre un nombre strictement positif');
    return m;
}

/**
 * Charge et verrouille les portefeuilles dans l'ordre croissant des
 * identifiants. Un depot verrouille (source, epargne), un retrait
 * (epargne, cible) : dans l'ordre d'arrivee, deux operations croisees
 * pourraient s'attendre mutuellement.
 */
async function verrouiller(clientId, ids, t) {
    const tries = [...new Set(ids)].sort((x, y) => x - y);
    const charges = {};
    for (const id of tries) {
        const pf = await Portefeuille.findOne({
            where: { id, ClientPortefeuilleId: clientId, estActif: true },
            transaction: t, lock: t.LOCK.UPDATE
        });
        if (!pf) throw erreur(404, 'Portefeuille introuvable');
        if (pf.typePortefeuille === 'tontine') throw erreur(409, "Une caisse de tontine ne sert pas a l'epargne");
        charges[id] = pf;
    }
    return charges;
}

async function portefeuilleEpargneId(clientId, t) {
    const pf = await Portefeuille.findOne({
        where: { ClientPortefeuilleId: clientId, typePortefeuille: 'epargne', estActif: true },
        attributes: ['id'], transaction: t
    });
    if (!pf) throw erreur(409, "Vous n'avez pas de portefeuille epargne pour recevoir cet argent");
    return pf.id;
}

/** Traduit une erreur de fonds en erreur HTTP du controleur. */
function traduire(e) {
    if (e instanceof Fonds.ErreurFonds) return erreur(e.code, e.message, e.details);
    return e;
}

function repondreErreur(res, e, defaut) {
    if (e && e.statut) {
        const { statut, message, ...details } = e;
        return res.status(statut).json({ error: message, ...details });
    }
    console.error(e);
    return res.status(500).json({ error: defaut });
}

const deposerEpargne = async (req, res) => {
    const clientId = req.user.id;
    const { epargneId } = req.params;
    const { portefeuilleSourceId } = req.body;

    try {
        const somme = montantValide(req.body.montant);

        const epargne = await db.transaction(async (t) => {
            const ep = await Epargne.findOne({
                where: { id: epargneId, user_id: clientId }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!ep) throw erreur(404, "Épargne introuvable");
            if (ep.statut === 'termine') throw erreur(400, "Cette épargne est déjà terminée");

            // L'argent d'abord : si le portefeuille ne peut pas payer, le
            // compteur ne bouge pas. Il avancait jusqu'ici quand meme.
            if (portefeuilleSourceId) {
                const cibleId = await portefeuilleEpargneId(clientId, t);
                const sourceId = parseInt(portefeuilleSourceId, 10);
                if (sourceId !== cibleId) {
                    const pfs = await verrouiller(clientId, [sourceId, cibleId], t);
                    try {
                        await Fonds.transferer(pfs[sourceId], pfs[cibleId], somme, t);
                    } catch (e) { throw traduire(e); }
                    await Transaction.create({
                        montant: somme, date: new Date(), type: 'epargne_depot', statut: STATUTS.SUCCESS, frais: 0,
                        description: `Mise de cote pour l'objectif « ${ep.objectif} »`,
                        ClientTransactionId: clientId
                    }, { transaction: t });
                }
                // Source = portefeuille epargne : l'argent y est deja.
            }

            ep.montant_cumule = Math.round((Number(ep.montant_cumule) + somme) * 100) / 100;
            if (ep.capitalInitial === 0 || ep.capitalInitial === null) ep.capitalInitial = somme;
            if (ep.tauxInteret > 0) await calculerInterets(ep);
            ep.progression = Math.min(100, (ep.montant_cumule / ep.montant_total) * 100);
            if (ep.montant_cumule >= ep.montant_total && ep.statut !== 'termine') {
                ep.statut = 'termine';
                if (ep.tauxInteret > 0) await calculerInterets(ep);
            }
            await ep.save({ transaction: t });

            await TransactionEpargne.create({
                Epargne_id: epargneId,
                type: 'depot',
                montant: somme,
                description: `Dépôt sur l'épargne "${ep.objectif}"`,
                date: new Date()
            }, { transaction: t });

            return ep;
        });

        return res.json({
            message: "Dépôt effectué",
            epargne,
            progression: {
                actuel: epargne.montant_cumule,
                objectif: epargne.montant_total,
                pourcentage: epargne.progression,
                restant: Math.max(0, epargne.montant_total - epargne.montant_cumule),
                objectifAtteint: epargne.montant_cumule >= epargne.montant_total,
                interets: epargne.interetCumule
            },
            celebration: epargne.montant_cumule >= epargne.montant_total
        });
    } catch (e) {
        return repondreErreur(res, e, "Erreur lors du dépôt");
    }
};

const retirerEpargne = async (req, res) => {
    const clientId = req.user.id;
    const { epargneId } = req.params;
    const { portefeuilleCibleId } = req.body;

    try {
        const somme = montantValide(req.body.montant);

        const epargne = await db.transaction(async (t) => {
            const ep = await Epargne.findOne({
                where: { id: epargneId, user_id: clientId }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!ep) throw erreur(404, "Épargne introuvable");
            if (Number(ep.montant_cumule) < somme) {
                throw erreur(400, "Solde insuffisant", { disponible: ep.montant_cumule });
            }

            // Le retrait vers un portefeuille crediait la cible sans debiter
            // quoi que ce soit : l'argent sort maintenant du portefeuille
            // epargne, ou il a ete mis de cote — et seulement de sa part
            // disponible, pas de celle qui garantit une tontine.
            if (portefeuilleCibleId) {
                const sourceId = await portefeuilleEpargneId(clientId, t);
                const cibleId = parseInt(portefeuilleCibleId, 10);
                if (sourceId !== cibleId) {
                    const pfs = await verrouiller(clientId, [sourceId, cibleId], t);
                    try {
                        await Fonds.transferer(pfs[sourceId], pfs[cibleId], somme, t);
                    } catch (e) { throw traduire(e); }
                    await Transaction.create({
                        montant: somme, date: new Date(), type: 'epargne_retrait', statut: STATUTS.SUCCESS, frais: 0,
                        description: `Retrait de l'objectif « ${ep.objectif} »`,
                        ClientTransactionId: clientId
                    }, { transaction: t });
                }
            }

            const avant = Number(ep.montant_cumule);
            ep.montant_cumule = Math.round((avant - somme) * 100) / 100;
            // Interets au prorata du capital retire.
            if (ep.tauxInteret > 0 && ep.interetCumule > 0) {
                const ratio = avant / (avant + Number(ep.interetCumule));
                ep.interetCumule = Math.floor(Number(ep.interetCumule) * ratio);
            }
            ep.progression = Math.min(100, (ep.montant_cumule / ep.montant_total) * 100);
            if (ep.montant_cumule < ep.montant_total && ep.statut === 'termine') ep.statut = 'en cours';
            await ep.save({ transaction: t });

            await TransactionEpargne.create({
                Epargne_id: epargneId,
                type: 'retrait',
                montant: somme,
                description: `Retrait de l'épargne "${ep.objectif}"`,
                date: new Date()
            }, { transaction: t });

            return ep;
        });

        return res.json({ message: "Retrait effectué", epargne });
    } catch (e) {
        return repondreErreur(res, e, "Erreur lors du retrait");
    }
};

// Calculer les intérêts composés
async function calculerInterets(epargne) {
    const maintenant = new Date();
    const dernierCalcul = epargne.dernierCalculInterets || epargne.date_debut;
    
    // Calculer le nombre de jours depuis le dernier calcul
    const jours = Math.floor((maintenant - new Date(dernierCalcul)) / (1000 * 60 * 60 * 24));
    
    if (jours > 0 && epargne.montant_cumule > 0) {
        // Intérêts composés: I = P * (1 + r/n)^(nt) - P
        // Pour simplifier: intérêts journaliers
        const tauxJournalier = epargne.tauxInteret / 100 / 365;
        const interets = Math.floor(epargne.montant_cumule * tauxJournalier * jours);
        
        epargne.interetCumule += interets;
        epargne.dernierCalculInterets = maintenant;
    }
    
    return epargne;
}

// Obtenir le simulateur d'intérêts
const simulatorInterets = async (req, res) => {
    const { montant, taux, periodeAnnees, frequenceComposition = 'mensuel' } = req.query;

    if (!montant || !taux || !periodeAnnees) {
        return res.status(400).json({ error: "Paramètres manquants" });
    }

    const capital = parseFloat(montant);
    const tauxAnnuel = parseFloat(taux);
    const annees = parseFloat(periodeAnnees);

    // Différentes fréquences de composition
    const frequences = {
        'quotidien': 365,
        'mensuel': 12,
        'trimestriel': 4,
        'annuel': 1
    };

    const n = frequences[frequenceComposition] || 12;
    const tauxPeriodique = tauxAnnuel / n;

    // Calculer le montant final avec intérêts composés
    const montantFinal = capital * Math.pow(1 + tauxPeriodique, n * annees);
    const interetsTotaux = montantFinal - capital;

    // Tableau d'évolution année par année
    const evolution = [];
    for (let annee = 1; annee <= annees; annee++) {
        const valeur = capital * Math.pow(1 + tauxPeriodique, n * annee);
        evolution.push({
            annee,
            valeur: Math.floor(valeur),
            interets: Math.floor(valeur - capital)
        });
    }

    res.json({
        simulation: {
            capitalInitial: capital,
            tauxAnnuel: `${tauxAnnuel}%`,
            periodeAnnees: annees,
            composition: frequenceComposition,
            montantFinal: Math.floor(montantFinal),
            interetsTotaux: Math.floor(interetsTotaux),
            valeurActuelle: Math.floor(capital * Math.pow(1 + tauxAnnuel/100, annees))
        },
        evolution
    });
};

// Obtenir les objectifs d'épargne avec progression
const getEpargnesAvecProgression = async (req, res) => {
    const clientId = req.user.id;
    const { inclureTerminees = true } = req.query;

    try {
        const whereClause = { user_id: clientId };
        
        if (!inclureTerminees) {
            whereClause.statut = { [Op.ne]: 'termine' };
        }

        const epargnes = await Epargne.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']]
        });

        // Enrichir avec les données de progression
        const epargnesCompletees = epargnes.map(epargne => {
            const progression = {
                actuel: epargne.montant_cumule,
                objectif: epargne.montant_total,
                pourcentage: Math.min(100, ((epargne.montant_cumule + epargne.interetCumule) / epargne.montant_total) * 100).toFixed(1),
                restant: Math.max(0, epargne.montant_total - epargne.montant_cumule),
                interets: epargne.interetCumule,
                objectifAtteint: epargne.montant_cumule >= epargne.montant_total,
                joursRestants: epargne.date_fin 
                    ? Math.ceil((new Date(epargne.date_fin) - new Date()) / (1000 * 60 * 60 * 24))
                    : null,
                montantAvecInterets: epargne.montant_cumule + epargne.interetCumule
            };

            return {
                ...epargne.toJSON(),
                progression,
                estCachee: epargne.estSecrete
            };
        });

        // Statistiques globales
        const stats = {
            totalEpargnes: epargnesCompletees.length,
            enCours: epargnesCompletees.filter(e => e.statut === 'en cours').length,
            terminees: epargnesCompletees.filter(e => e.statut === 'termine').length,
            totalAccumule: epargnesCompletees.reduce((sum, e) => sum + e.montant_cumule, 0),
            totalInterets: epargnesCompletees.reduce((sum, e) => sum + e.interetCumule, 0),
            totalObjectifs: epargnesCompletees.reduce((sum, e) => sum + e.montant_total, 0)
        };

        // Filtrer les cacher si l'utilisateur ne veut pas voir les détaillées
        const visibleEpargnes = epargnesCompletees.map(e => {
            if (e.estSecrete) {
                return {
                    ...e,
                    montant_cumule: '***',
                    interetCumule: '***',
                    progression: { ...e.progression, actuel: '***', interets: '***' }
                };
            }
            return e;
        });

        res.json({
            epargnes: visibleEpargnes,
            statistiques: stats
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération" });
    }
};

// ============================================
// ÉPARGNE AUTOMATIQUE (Round-up)
// ============================================

// Configurer l'épargne automatique
const configurerEpargneAutomatique = async (req, res) => {
    const clientId = req.user.id;
    const {
        type = 'arrondi',
        arrondiSuperieur = true,
        pasArrondi = 100,
        montantFixe,
        pourcentageDepot,
        frequence = 'a_chaque_depot',
        portefeuilleCibleId,
        depotMinimal = 100,
        depotMaximal,
        jourDepot,
        notifierArrondi = true
    } = req.body;

    try {
        // Vérifier si une规则 existe déjà
        const existante = await EpargneAutomatique.findOne({
            where: { userId: clientId, estActif: true }
        });

        if (existante) {
            // Mettre à jour l'existante
            existante.type = type;
            existante.arrondiSuperieur = arrondiSuperieur;
            existante.pasArrondi = pasArrondi;
            existante.montantFixe = montantFixe;
            existante.pourcentageDepot = pourcentageDepot;
            existante.frequence = frequence;
            existante.portefeuilleCibleId = portefeuilleCibleId;
            existante.depotMinimal = depotMinimal;
            existante.depotMaximal = depotMaximal;
            existante.jourDepot = jourDepot;
            existante.notifierArrondi = notifierArrondi;
            
            await existante.save();
            
            return res.json({
                message: "Règle d'épargne automatique mise à jour",
                regle: existante
            });
        }

        // Créer une nouvelle règle
        const regle = await EpargneAutomatique.create({
            userId: clientId,
            type,
            arrondiSuperieur,
            pasArrondi,
            montantFixe,
            pourcentageDepot,
            frequence,
            portefeuilleCibleId,
            depotMinimal,
            depotMaximal,
            jourDepot,
            notifierArrondi
        });

        res.status(201).json({
            message: "Règle d'épargne automatique créée",
            regle
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la configuration" });
    }
};

// Obtenir la règle d'épargne automatique
const getEpargneAutomatique = async (req, res) => {
    const clientId = req.user.id;

    try {
        const regle = await EpargneAutomatique.findOne({
            where: { userId: clientId, estActif: true }
        });

        if (!regle) {
            return res.json({
                message: "Aucune règle configurée",
                configuree: false
            });
        }

        res.json({
            configuree: true,
            regle,
            statistiques: {
                totalEpargne: regle.totalEpargne,
                nbOperations: regle.nbOperations,
                dernierArrondi: regle.dernierArrondi
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la récupération" });
    }
};

// Calculer l'arrondi (appelé lors d'un dépôt)
const triggerArrondi = async (req, res) => {
    const clientId = req.user.id;
    const { montantDepense } = req.body;

    try {
        const regle = await EpargneAutomatique.findOne({
            where: { userId: clientId, estActif: true, frequence: 'a_chaque_depot' }
        });

        if (!regle || !montantDepense) {
            return res.json({ applicable: false, raison: "Aucune règle active ou montant invalide" });
        }

        // Vérifier le dépôt minimum
        if (montantDepense < regle.depotMinimal) {
            return res.json({ 
                applicable: false, 
                raison: `Dépôt minimum de ${regle.depotMinimal} non atteint` 
            });
        }

        let montantEpargne = 0;

        switch (regle.type) {
            case 'arrondi':
                // Arrondir au prochain multiple
                const reste = montantDepense % regle.pasArrondi;
                if (regle.arrondiSuperieur && reste > 0) {
                    montantEpargne = regle.pasArrondi - reste;
                } else if (!regle.arrondiSuperieur) {
                    montantEpargne = reste;
                }
                break;
                
            case 'montant_fixe':
                montantEpargne = regle.montantFixe;
                break;
                
            case 'pourcentage_depot':
                montantEpargne = (montantDepense * (regle.pourcentageDepot / 100));
                break;
                
            case 'solde_arrondi':
                // Arrondir le solde restant à 0
                // Cette option nécessite le solde du wallet
                break;
        }

        // Limiter le montant maximum
        if (regle.depotMaximal && montantEpargne > regle.depotMaximal) {
            montantEpargne = regle.depotMaximal;
        }

        // Mettre à jour les statistiques
        if (montantEpargne > 0) {
            regle.totalEpargne += montantEpargne;
            regle.nbOperations += 1;
            regle.dernierArrondi = new Date();
            await regle.save();
        }

        res.json({
            applicable: montantEpargne > 0,
            montantDepense,
            montantEpargne,
            regle: regle.type,
            message: montantEpargne > 0 
                ? `Vous allez épargner ${montantEpargne} XAF automatiquement!`
                : "Aucun arrondi applicable"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors du calcul" });
    }
};

// Activer/désactiver l'épargne automatique
const toggleEpargneAutomatique = async (req, res) => {
    const clientId = req.user.id;
    const { actif } = req.body;

    try {
        const regle = await EpargneAutomatique.findOne({
            where: { userId: clientId }
        });

        if (!regle) {
            return res.status(404).json({ error: "Aucune règle configurée" });
        }

        regle.estActif = actif;
        await regle.save();

        res.json({
            message: actif ? "Épargne automatique activée" : "Épargne automatique désactivée",
            regle
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la modification" });
    }
};

// Supprimer la règle d'épargne automatique
const supprimerEpargneAutomatique = async (req, res) => {
    const clientId = req.user.id;

    try {
        const regle = await EpargneAutomatique.findOne({
            where: { userId: clientId }
        });

        if (!regle) {
            return res.status(404).json({ error: "Aucune règle configurée" });
        }

        await regle.destroy();

        res.json({ message: "Règle d'épargne automatique supprimée" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la suppression" });
    }
};

// ============================================
// TIRE-LIRE (Piggy Bank)
// ============================================

// Créer une tire-lire
const creerTireLire = async (req, res) => {
    const clientId = req.user.id;
    const {
        objectif,
        montant_total,
        date_fin,
        couleur = '#FF6B6B',
        icone = 'piggy-bank',
        motivationQuote,
        estSecrete = false
    } = req.body;

    try {
        const epargne = await Epargne.create({
            objectif,
            date_debut: new Date(),
            date_fin: date_fin ? new Date(date_fin) : null,
            montant_total,
            montant_cumule: 0,
            statut: 'en cours',
            estTireLire: true,
            couleur,
            icone,
            motivationQuote: motivationQuote || CITATIONS[Math.floor(Math.random() * CITATIONS.length)],
            estSecrete,
            progression: 0
        });

        res.status(201).json({
            message: "Tire-lire créée! � piggy-bank",
            tirelire: epargne
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de la création de la tire-lire" });
    }
};

// Obtenir une citation motivante aléatoire
const getCitationMotivation = async (req, res) => {
    const citation = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
    res.json({ citation });
};

module.exports = {
    creerEpargneAvancee,
    deposerEpargne,
    retirerEpargne,
    simulatorInterets,
    getEpargnesAvecProgression,
    configurerEpargneAutomatique,
    getEpargneAutomatique,
    triggerArrondi,
    toggleEpargneAutomatique,
    supprimerEpargneAutomatique,
    creerTireLire,
    getCitationMotivation
};

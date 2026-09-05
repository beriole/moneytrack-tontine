'use strict';

const {
    db, Portefeuille, Budget, Categorie, OneBudget, depense: Depense,
    TontineGroupe, TontineMembre
} = require('../../models');
const { ErreurTontine, nombre, arrondir, exigerRole } = require('./commun');

// =====================================================================
//  Le pont entre la tontine et le reste de MoneyTrack.
//
//  Sans lui, les deux domaines cohabitent sans se parler : le budget
//  ignore une cotisation de 25 000 qui tombe chaque mois, et le tour
//  atterrit dans le courant ou il se dilue, au lieu de financer le projet
//  pour lequel on a rejoint la tontine.
//
//  Deux liens, poses par le membre lui-meme :
//
//    lierBudget     la cotisation s'inscrit comme depense dans une
//                   categorie de son budget ;
//    routerTour     le pot atterrit dans le portefeuille de son choix —
//                   un projet, une epargne — au lieu du courant.
// =====================================================================

const NOM_CATEGORIE = 'Tontine';

class IntegrationService {

    // -----------------------------------------------------------------
    //  Budget
    // -----------------------------------------------------------------
    /**
     * Rattache la cotisation d'un membre a une categorie de budget.
     * Si aucune categorie n'est fournie, on en cree une au nom du groupe
     * et on l'attache au budget avec le montant de la cotisation : le
     * budget porte alors l'engagement reel, pas une estimation.
     */
    static async lierBudget(clientId, groupeId, options = {}) {
        const { budgetId, categorieId } = options;

        return db.transaction(async (t) => {
            const membre = await exigerRole(groupeId, clientId, [], t);
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

            let budget;
            if (budgetId) {
                budget = await Budget.findOne({
                    where: { id: budgetId, ClientBudgetId: clientId }, transaction: t
                });
                if (!budget) throw new ErreurTontine(404, "Ce budget ne vous appartient pas");
            } else {
                // Le budget actif le plus recent : celui que l'utilisateur
                // consulte, donc celui qu'il faut ne pas laisser mentir.
                budget = await Budget.findOne({
                    where: { ClientBudgetId: clientId, estActif: true },
                    order: [['createdAt', 'DESC']], transaction: t
                });
                if (!budget) {
                    throw new ErreurTontine(409,
                        "Vous n'avez aucun budget actif. Creez-en un d'abord, puis reliez-y la tontine.");
                }
            }

            let categorie;
            if (categorieId) {
                categorie = await Categorie.findByPk(categorieId, { transaction: t });
                if (!categorie) throw new ErreurTontine(404, 'Categorie introuvable');
            } else {
                const nom = `${NOM_CATEGORIE} — ${groupe.nom}`;
                [categorie] = await Categorie.findOrCreate({
                    where: { nomCategorie: nom },
                    defaults: { nomCategorie: nom, description: `Engagement de cotisation pour ${groupe.nom}` },
                    transaction: t
                });
            }

            // Rattachement au budget avec le montant reellement engage.
            const montant = arrondir(groupe.montantParPeriode);
            const [pivot, cree] = await OneBudget.findOrCreate({
                where: { budgetId: budget.id, categorieId: categorie.id },
                defaults: { budgetId: budget.id, categorieId: categorie.id, montant },
                transaction: t
            });
            if (!cree && nombre(pivot.montant) !== montant) {
                await pivot.update({ montant }, { transaction: t });
            }

            await membre.update({ budgetId: budget.id, categorieId: categorie.id }, { transaction: t });

            return {
                budget: { id: budget.id, nom: budget.nom },
                categorie: { id: categorie.id, nom: categorie.nomCategorie },
                montantEngage: montant,
                message: `La cotisation de ${montant} FCFA apparait desormais dans le budget « ${budget.nom} ».`
            };
        });
    }

    static async delierBudget(clientId, groupeId) {
        const membre = await exigerRole(groupeId, clientId, [], null);
        await membre.update({ budgetId: null, categorieId: null });
        return { message: 'La cotisation ne sera plus imputee au budget.' };
    }

    /**
     * Ecrit la depense budgetaire correspondant a une cotisation.
     * Appele depuis cotiser(), dans SA transaction : si l'ecriture
     * budgetaire echoue, la cotisation echoue aussi — on ne veut pas d'un
     * budget qui derive silencieusement du grand livre.
     */
    static async imputerCotisation(membre, groupe, montant, libelle, t) {
        if (!membre.budgetId || !membre.categorieId) return null;

        const budget = await Budget.findByPk(membre.budgetId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!budget) return null;   // budget supprime depuis : on n'echoue pas pour autant

        const ligne = await Depense.create({
            montant: arrondir(montant),
            date: new Date(),
            description: libelle,
            categorieId: membre.categorieId
        }, { transaction: t });

        await budget.update({
            montantDepense: arrondir(nombre(budget.montantDepense) + arrondir(montant))
        }, { transaction: t });

        return ligne;
    }

    // -----------------------------------------------------------------
    //  Destination du tour
    // -----------------------------------------------------------------
    /**
     * Choisit ou tombe le pot quand le tour arrive. C'est le geste qui
     * transforme une tontine en moyen de financement : le pot va droit au
     * projet, sans passer par le courant ou il se serait dilue.
     */
    static async routerTour(clientId, groupeId, portefeuilleId) {
        const membre = await exigerRole(groupeId, clientId, [], null);

        if (!portefeuilleId) {
            await membre.update({ portefeuilleDestinationId: null });
            return { message: 'Votre tour tombera sur votre portefeuille courant.' };
        }

        const pf = await Portefeuille.findOne({
            where: { id: portefeuilleId, ClientPortefeuilleId: clientId, estActif: true }
        });
        if (!pf) throw new ErreurTontine(404, "Ce portefeuille ne vous appartient pas");
        if (pf.typePortefeuille === 'tontine') {
            throw new ErreurTontine(409, "Une caisse de tontine ne peut pas recevoir un tour");
        }

        await membre.update({ portefeuilleDestinationId: pf.id });
        return {
            portefeuille: { id: pf.id, nom: pf.nom, type: pf.typePortefeuille },
            message: `Votre tour sera verse directement sur « ${pf.nom || pf.typePortefeuille} ».`
        };
    }

    /**
     * Portefeuille qui doit encaisser le tour. Retombe sur le courant si
     * la destination choisie a disparu ou a ete desactivee entre-temps.
     */
    static async destinationTour(clientId, groupeId, t) {
        const membre = await TontineMembre.findOne({
            where: { groupeId, clientId }, transaction: t
        });
        if (!membre || !membre.portefeuilleDestinationId) return null;

        const pf = await Portefeuille.findOne({
            where: {
                id: membre.portefeuilleDestinationId,
                ClientPortefeuilleId: clientId,
                estActif: true
            },
            transaction: t, lock: t ? t.LOCK.UPDATE : undefined
        });
        return pf && pf.typePortefeuille !== 'tontine' ? pf : null;
    }

    // -----------------------------------------------------------------
    //  Ce que le membre peut choisir
    // -----------------------------------------------------------------
    /**
     * Destinations possibles pour un tour, enrichies de leur contexte :
     * un portefeuille de projet affiche ce qu'il reste a financer, une
     * epargne affiche ce qu'il manque pour atteindre l'objectif.
     */
    static async destinationsPossibles(clientId, groupeId) {
        const membre = await exigerRole(groupeId, clientId, [], null);

        const portefeuilles = await Portefeuille.findAll({
            where: { ClientPortefeuilleId: clientId, estActif: true }
        });

        const options = portefeuilles
            .filter(p => p.typePortefeuille !== 'tontine')
            .map(p => {
                // Le contexte vient du portefeuille lui-meme : c'est lui qui
                // porte l'objectif. Aller le chercher dans la table Projet
                // obligerait a deviner quel projet correspond a quel
                // portefeuille — un lien qui n'existe pas.
                let contexte = null;
                const objectif = nombre(p.objectifMontant);
                if (objectif > 0) {
                    const manque = arrondir(objectif - nombre(p.solde));
                    contexte = manque > 0
                        ? `Objectif ${arrondir(objectif)} FCFA — il manque ${manque} FCFA (${Math.round((nombre(p.solde) / objectif) * 100)} % atteint)`
                        : `Objectif de ${arrondir(objectif)} FCFA deja atteint`;
                } else if (p.typePortefeuille === 'projet') {
                    contexte = 'Portefeuille de projet, sans objectif chiffre';
                } else if (p.typePortefeuille === 'epargne') {
                    contexte = 'Epargne libre, sans objectif fixe';
                }
                return {
                    id: p.id,
                    nom: p.nom || p.typePortefeuille,
                    type: p.typePortefeuille,
                    solde: arrondir(p.solde),
                    contexte,
                    choisi: membre.portefeuilleDestinationId === p.id
                };
            });

        return {
            options,
            actuelle: membre.portefeuilleDestinationId,
            defaut: 'Portefeuille courant'
        };
    }

    /**
     * Etat des liens d'un membre : ce qui est deja branche, ce qui ne
     * l'est pas, et pourquoi ca vaut la peine de le brancher.
     */
    static async etatLiens(clientId, groupeId) {
        const membre = await exigerRole(groupeId, clientId, [], null);
        const groupe = await TontineGroupe.findByPk(groupeId);

        const budget = membre.budgetId ? await Budget.findByPk(membre.budgetId) : null;
        const categorie = membre.categorieId ? await Categorie.findByPk(membre.categorieId) : null;
        const destination = membre.portefeuilleDestinationId
            ? await Portefeuille.findByPk(membre.portefeuilleDestinationId) : null;

        return {
            budget: budget
                ? { lie: true, id: budget.id, nom: budget.nom, categorie: categorie?.nomCategorie }
                : {
                    lie: false,
                    pourquoi: `Sans lien, votre budget ignore les ${arrondir(groupe.montantParPeriode)} FCFA que cette tontine vous prend chaque periode.`
                },
            destinationTour: destination
                ? { definie: true, id: destination.id, nom: destination.nom, type: destination.typePortefeuille }
                : {
                    definie: false,
                    pourquoi: 'Votre tour tombera sur le courant, ou il se melangera au reste. Le diriger vers un projet ou une epargne lui donne une destination.'
                }
        };
    }
}

module.exports = IntegrationService;

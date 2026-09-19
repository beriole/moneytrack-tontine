'use strict';

// =====================================================================
//  Retrait de la boutique, des prets et des roles secondaires.
//
//  Trois suppressions decidees ensemble, et qui se tiennent :
//
//  1. La boutique marchande (table Produits)
//      Le controleur client renvoyait des messages fixes — et plantait,
//      puisqu'il appelait res.status.json au lieu de res.status().json.
//      L'espace vendeur repondait « vous etes connecter » a tout. Rien
//      n'etait branche sur une base. Le modele Produit n'etait meme pas
//      enregistre dans models/index.js : sur la plupart des installations
//      la table n'a jamais ete creee, et la suppression est un no-op.
//
//      A NE PAS CONFONDRE avec le catalogue de PLANS d'abonnement, qui
//      reste en place : c'est lui que sert /plan et qu'affiche l'onglet
//      « Souscrire » de l'application. Le back-office continue de le gerer
//      sous /api/admin/produit — un nom trompeur, conserve pour ne pas
//      casser l'interface existante.
//
//  2. Les prets entre utilisateurs (table Prets)
//      Le pair-a-pair n'a jamais existe : souscrire, rembourser, chiffrer
//      et mettre a jour renvoyaient 501, et le modele ne portait qu'un
//      seul clientId — un emprunteur, aucun preteur. Ce qui fonctionnait
//      etait un pret PLATEFORME -> client, decaisse par un administrateur
//      seul, sans maker-checker, sur un modele sans echeancier.
//
//      Le besoin est couvert par la caisse 2 de la tontine : demande
//      soumise au vote du groupe, decaissement par le bureau, echeancier
//      genere au franc pres, remboursement possible meme sur un groupe
//      termine.
//
//  3. Les roles censeur, secretaire et garant
//      Le censeur infligeait les amendes, le secretaire redigeait le
//      reglement : deux charges qui reviennent au bureau (president,
//      tresorier). Le retard, lui, est constate par la regle — le
//      planificateur leve l'amende sans que personne ait a denoncer.
//
//      Le garant est le retrait qui compte vraiment. Il faisait reposer
//      la defaillance d'un membre sur le portefeuille d'un autre, et
//      transformait une dette envers le groupe en dette entre deux
//      personnes que l'application n'avait aucun moyen de faire honorer.
//      La cascade de recours devient : amende de retard -> saisie de la
//      caution -> exclusion. La caution est de l'argent deja immobilise
//      par le defaillant lui-meme.
//
//  Les donnees existantes sont menagees, pas ecrasees :
//      - les membres 'censeur' et 'secretaire' deviennent 'membre' AVANT
//        que l'ENUM ne se retrecisse, sinon MySQL les viderait en silence ;
//      - les administrateurs 'AGENT_SELLER' deviennent 'SUPPORT' ;
//      - les ecritures comptables de type 'appel_garant' deja passees ne
//        sont pas touchees : elles decrivent des mouvements reels, et le
//        back-office continue de les proteger d'un remboursement.
//
//  Toutes les operations sont gardees : relancer la migration ne fait
//  rien de plus.
//
//  ATTENTION : faire un dump de la base avant d'executer.
//    mysqldump -u <user> -p <base> > backup.sql
// =====================================================================

async function decrire(qi, table) {
    try { return await qi.describeTable(table); } catch (e) { return null; }
}

async function retirerSiPresente(qi, table, colonne) {
    const description = await decrire(qi, table);
    if (!description) return;
    if (!Object.prototype.hasOwnProperty.call(description, colonne)) return;
    await qi.removeColumn(table, colonne);
}

async function ajouterSiAbsente(qi, table, colonne, definition) {
    const description = await decrire(qi, table);
    if (!description) return;
    if (Object.prototype.hasOwnProperty.call(description, colonne)) return;
    await qi.addColumn(table, colonne, definition);
}

async function supprimerTableSiPresente(qi, table) {
    if (!await decrire(qi, table)) return;
    await qi.dropTable(table);
}

module.exports = {
    async up(qi, Sequelize) {
        // --- 1. Les roles disparus reviennent au rang de membre ---------
        // Cet ordre n'est pas negociable : MySQL remplace par la chaine
        // vide toute valeur absente du nouvel ENUM. Reclasser d'abord,
        // retrecir ensuite.
        if (await decrire(qi, 'tontine_membres')) {
            await qi.sequelize.query(
                "UPDATE tontine_membres SET role = 'membre' WHERE role IN ('censeur', 'secretaire')"
            );
            await qi.changeColumn('tontine_membres', 'role', {
                type: Sequelize.ENUM('president', 'tresorier', 'membre'),
                allowNull: false,
                defaultValue: 'membre'
            });
        }

        if (await decrire(qi, 'Admins')) {
            await qi.sequelize.query(
                "UPDATE Admins SET role = 'SUPPORT' WHERE role = 'AGENT_SELLER'"
            );
            await qi.changeColumn('Admins', 'role', {
                type: Sequelize.ENUM(
                    'SUPER_ADMIN', 'ADMIN_FINANCE', 'SUPPORT',
                    'COMPLIANCE', 'MARKETING', 'AGENT_KYC'
                ),
                allowNull: false,
                defaultValue: 'SUPPORT'
            });
        }

        // --- 2. Les colonnes du garant ---------------------------------
        await retirerSiPresente(qi, 'tontine_membres', 'garantId');
        await retirerSiPresente(qi, 'tontine_cotisations', 'garantPayeurId');
        await retirerSiPresente(qi, 'tontine_cotisations', 'montantAvanceGarant');

        // --- 3. Les tables des modules retires -------------------------
        await supprimerTableSiPresente(qi, 'Prets');
        await supprimerTableSiPresente(qi, 'Produits');
    },

    async down(qi, Sequelize) {
        // Le retour en arriere restitue la STRUCTURE, jamais les donnees :
        // les lignes des tables supprimees et les garants designes sont
        // perdus. C'est la raison du dump exige plus haut.
        await ajouterSiAbsente(qi, 'tontine_cotisations', 'montantAvanceGarant', {
            type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0
        });
        await ajouterSiAbsente(qi, 'tontine_cotisations', 'garantPayeurId', {
            type: Sequelize.INTEGER, allowNull: true
        });
        await ajouterSiAbsente(qi, 'tontine_membres', 'garantId', {
            type: Sequelize.INTEGER, allowNull: true
        });

        if (await decrire(qi, 'Admins')) {
            await qi.changeColumn('Admins', 'role', {
                type: Sequelize.ENUM(
                    'SUPER_ADMIN', 'ADMIN_FINANCE', 'SUPPORT',
                    'COMPLIANCE', 'MARKETING', 'AGENT_KYC', 'AGENT_SELLER'
                ),
                allowNull: false,
                defaultValue: 'SUPPORT'
            });
        }

        if (await decrire(qi, 'tontine_membres')) {
            await qi.changeColumn('tontine_membres', 'role', {
                type: Sequelize.ENUM('president', 'tresorier', 'censeur', 'secretaire', 'membre'),
                allowNull: false,
                defaultValue: 'membre'
            });
        }

        if (!await decrire(qi, 'Prets')) {
            await qi.createTable('Prets', {
                id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
                montant: { type: Sequelize.FLOAT, allowNull: false },
                tauxInteret: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 5 },
                dureeMois: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 12 },
                motif: { type: Sequelize.STRING, allowNull: true },
                statut: {
                    type: Sequelize.ENUM('demande', 'approuve', 'rejete', 'actif', 'rembourse', 'defaut'),
                    allowNull: false, defaultValue: 'demande'
                },
                montantRembourse: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
                montantTotalDu: { type: Sequelize.FLOAT, allowNull: true },
                dateApprobation: { type: Sequelize.DATE, allowNull: true },
                dateEcheance: { type: Sequelize.DATE, allowNull: true },
                motifRejet: { type: Sequelize.STRING, allowNull: true },
                clientId: { type: Sequelize.INTEGER, allowNull: false },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
        }

        if (!await decrire(qi, 'Produits')) {
            await qi.createTable('Produits', {
                id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
                non: { type: Sequelize.STRING, allowNull: true },
                description: { type: Sequelize.TEXT, allowNull: true },
                prix: { type: Sequelize.FLOAT, allowNull: false },
                reduction: { type: Sequelize.INTEGER, allowNull: true },
                Stock: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
        }
    }
};

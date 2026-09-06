'use strict';

// =====================================================================
//  Colonnes manquantes derriere six correctifs.
//
//  tontine_groupes.preuveTirage
//      L'empreinte du tirage d'ordre etait calculee au demarrage puis
//      renvoyee une seule fois dans la reponse HTTP, et jamais stockee.
//      Le commentaire promettait pourtant a chacun de « verifier a
//      posteriori que l'ordre n'a pas ete rejoue » : impossible.
//
//  tontine_groupes.cautionObligatoire
//      pourcentageCaution etait configure a la creation et affiche dans
//      l'application, mais rien n'exigeait jamais le blocage. La cascade
//      de recours caution -> garant pouvait donc etre vide des le depart.
//      Le drapeau est a false par defaut : aucun groupe existant ne change
//      de comportement.
//
//  tontine_cycles.enchereOuverteJusqu
//      ouvrir() ne persistait rien. Les offres etaient acceptees hors de
//      toute fenetre et l'adjudication pouvait tomber n'importe quand.
//
//  tontine_membres.motifExclusion / dateExclusion
//      Le motif d'une exclusion etait consigne dans une TontineAmende de
//      0 FCFA au statut 'annulee' — une fausse amende qui apparaissait
//      ensuite dans la liste des amendes du membre.
//
//  tontine_cotisations.garantPayeurId / montantAvanceGarant
//      « La dette n'est pas effacee, elle change de debiteur », disait le
//      commentaire de l'appel au garant. Rien ne l'enregistrait : la
//      cotisation passait payee et il ne restait qu'une description.
//
//  Notifications.cle
//      Le planificateur passe toutes les 6 h. Sans cle d'idempotence, un
//      rappel « cotisation due dans 3 jours » partait quatre fois pour la
//      meme echeance, et un rappel de retard repartait indefiniment.
//
//  Toutes les operations sont gardees : sur une base neuve, db.sync() a
//  deja cree ces colonnes a partir des modeles, et la migration est un
//  no-op.
//
//  ATTENTION : faire un dump de la base avant d'executer.
//    mysqldump -u <user> -p <base> > backup.sql
// =====================================================================

async function decrire(qi, table) {
    try { return await qi.describeTable(table); } catch (e) { return null; }
}

async function ajouterSiAbsente(qi, table, colonne, definition) {
    const description = await decrire(qi, table);
    if (!description) return;   // table absente : rien a faire
    if (Object.prototype.hasOwnProperty.call(description, colonne)) return;
    await qi.addColumn(table, colonne, definition);
}

async function retirerSiPresente(qi, table, colonne) {
    const description = await decrire(qi, table);
    if (!description) return;
    if (!Object.prototype.hasOwnProperty.call(description, colonne)) return;
    await qi.removeColumn(table, colonne);
}

module.exports = {
    async up(qi, Sequelize) {
        await ajouterSiAbsente(qi, 'tontine_groupes', 'preuveTirage', {
            type: Sequelize.STRING(64), allowNull: true
        });
        await ajouterSiAbsente(qi, 'tontine_groupes', 'cautionObligatoire', {
            type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
        });

        await ajouterSiAbsente(qi, 'tontine_cycles', 'enchereOuverteJusqu', {
            type: Sequelize.DATE, allowNull: true
        });

        await ajouterSiAbsente(qi, 'tontine_membres', 'motifExclusion', {
            type: Sequelize.STRING(255), allowNull: true
        });
        await ajouterSiAbsente(qi, 'tontine_membres', 'dateExclusion', {
            type: Sequelize.DATE, allowNull: true
        });

        await ajouterSiAbsente(qi, 'tontine_cotisations', 'garantPayeurId', {
            type: Sequelize.INTEGER, allowNull: true
        });
        await ajouterSiAbsente(qi, 'tontine_cotisations', 'montantAvanceGarant', {
            type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0
        });

        await ajouterSiAbsente(qi, 'Notifications', 'cle', {
            type: Sequelize.STRING(140), allowNull: true, unique: true
        });
    },

    async down(qi) {
        await retirerSiPresente(qi, 'Notifications', 'cle');
        await retirerSiPresente(qi, 'tontine_cotisations', 'montantAvanceGarant');
        await retirerSiPresente(qi, 'tontine_cotisations', 'garantPayeurId');
        await retirerSiPresente(qi, 'tontine_membres', 'dateExclusion');
        await retirerSiPresente(qi, 'tontine_membres', 'motifExclusion');
        await retirerSiPresente(qi, 'tontine_cycles', 'enchereOuverteJusqu');
        await retirerSiPresente(qi, 'tontine_groupes', 'cautionObligatoire');
        await retirerSiPresente(qi, 'tontine_groupes', 'preuveTirage');
    }
};

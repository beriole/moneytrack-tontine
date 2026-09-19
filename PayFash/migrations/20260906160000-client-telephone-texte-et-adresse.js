'use strict';

// =====================================================================
//  clients.telephone : INTEGER -> VARCHAR(20)
//  clients.addresse  : colonne manquante
//
//  Un numero de telephone n'est pas un nombre. Stocke en INTEGER :
//
//    - un zero initial disparaissait ;
//    - un numero avec indicatif (237670000000) depassait la capacite d'un
//      INT signe, 2 147 483 647 : l'insertion echouait, ou MySQL en mode
//      permissif ecrivait la valeur plafond ;
//    - toute comparaison avec le reste du code, qui manipule des chaines
//      (FapshiService.normaliserTelephone, modifierprofil), passait par
//      une conversion implicite.
//
//  La conversion INT -> VARCHAR est sure : MySQL ecrit la representation
//  decimale de la valeur. Un numero camerounais a 9 chiffres devient
//  "670000000", ce qu'il aurait toujours du etre. L'index unique survit a
//  un MODIFY COLUMN : on ne le redeclare pas, sous peine d'en creer un
//  second.
//
//  addresse, elle, etait lue dans le corps de /auth/register, passee a
//  Client.create et renvoyee dans la reponse — sans exister au modele.
//  Sequelize la jetait en silence : acceptee, jamais enregistree.
//
//  Sur une base neuve, db.sync() a deja cree les deux : la migration est
//  alors un no-op.
//
//  ATTENTION : faire un dump de la base avant d'executer.
//    mysqldump -u <user> -p <base> > backup.sql
// =====================================================================

// Le modele est defini en minuscules ("client") : Sequelize pluralise en
// "clients". On sonde les deux graphies plutot que de parier.
const CANDIDATES = ['clients', 'Clients'];

async function trouverTable(qi) {
    for (const nom of CANDIDATES) {
        try {
            const description = await qi.describeTable(nom);
            if (description) return { nom, description };
        } catch (e) { /* table absente sous cette graphie */ }
    }
    // Rendre la main en silence enregistrait la migration comme appliquee
    // alors qu'elle n'avait rien fait. C'est exactement ce qui s'est produit :
    // jouee avant que db.sync() ne cree la table, elle a ete inscrite dans
    // SequelizeMeta sans ajouter addresse — et /auth/login a repondu 500
    // pour tous les comptes, sans qu'aucune migration ne reste a jouer.
    // Une migration qui ne trouve pas sa table doit echouer bruyamment.
    throw new Error(
        `Table introuvable sous les graphies ${CANDIDATES.join(' / ')} : ` +
        'creez le schema (db.sync) avant de jouer les migrations.'
    );
}

module.exports = {
    async up(qi, Sequelize) {
        const table = await trouverTable(qi);

        const colonne = table.description.telephone;
        // On ne convertit que si la colonne est encore numerique.
        if (colonne && /int/i.test(String(colonne.type))) {
            await qi.changeColumn(table.nom, 'telephone', {
                type: Sequelize.STRING(20),
                allowNull: false
            });
        }

        if (!Object.prototype.hasOwnProperty.call(table.description, 'addresse')) {
            await qi.addColumn(table.nom, 'addresse', {
                type: Sequelize.STRING(255),
                allowNull: true
            });
        }
    },

    async down(qi, Sequelize) {
        const table = await trouverTable(qi);

        if (Object.prototype.hasOwnProperty.call(table.description, 'addresse')) {
            await qi.removeColumn(table.nom, 'addresse');
        }

        // Retour a INTEGER : perdant par nature — tout numero non
        // representable en INT signe serait tronque. On ne le fait que si la
        // table ne contient rien qui l'interdise.
        const [lignes] = await qi.sequelize.query(
            `SELECT COUNT(*) AS n FROM \`${table.nom}\` WHERE telephone NOT REGEXP '^[0-9]{1,10}$' OR telephone > 2147483647`
        );
        const problematiques = Number(lignes && lignes[0] ? lignes[0].n : 0);
        if (problematiques > 0) {
            throw new Error(
                `${problematiques} numero(s) ne tiennent pas dans un INTEGER : retour arriere refuse pour ne pas les tronquer.`
            );
        }
        await qi.changeColumn(table.nom, 'telephone', {
            type: Sequelize.INTEGER,
            allowNull: false
        });
    }
};

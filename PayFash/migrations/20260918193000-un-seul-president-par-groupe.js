'use strict';

// =====================================================================
//  Un groupe, un president.
//
//  La presidence se lisait a deux endroits qui pouvaient se contredire :
//  TontineMembre.role d'un cote, TontineGroupe.createurId de l'autre, ce
//  dernier valant president permanent dans exigerRole. L'exception a ete
//  levee ; la presidence ne vit plus que sur l'adhesion.
//
//  Reste a garantir qu'elle y soit unique. PresidenceService libere la
//  place avant de l'occuper, dans une transaction et sous verrou — mais un
//  script, une reprise de donnees ou un UPDATE a la main passeraient a
//  cote. Deux presidents, c'est deux personnes qui peuvent demarrer un
//  cycle, exclure un membre et adjuger une enchere sans se voir.
//
//  Pourquoi deux declencheurs plutot qu'un index :
//
//    - MySQL et MariaDB ne connaissent pas l'index unique partiel ;
//    - le contournement habituel — une colonne generee valant groupeId
//      pour le seul president et NULL ailleurs — est refuse ici, parce que
//      groupeId porte une cle etrangere ON UPDATE CASCADE et qu'une
//      colonne generee ne peut pas dependre d'une colonne en cascade.
//
//  Les declencheurs sont invisibles pour Sequelize : ils ne genent ni
//  db.sync ni describeTable, et mysqldump --triggers les emporte.
// =====================================================================

const TABLE = 'tontine_membres';
const TRG_INS = 'trg_presidence_unique_insert';
const TRG_UPD = 'trg_presidence_unique_update';
const MESSAGE = 'Ce groupe a deja un president : transmettez la presidence au lieu de la dupliquer';

/** Les doublons existants survivraient au declencheur : on les nomme avant. */
async function verifierUnicite(qi) {
    const [doublons] = await qi.sequelize.query(
        `SELECT groupeId, COUNT(*) n FROM \`${TABLE}\`
          WHERE role = 'president' GROUP BY groupeId HAVING n > 1`
    );
    if (doublons.length) {
        const liste = doublons.map(d => `groupe ${d.groupeId} (${d.n})`).join(', ');
        throw new Error(
            `Plusieurs presidents sur : ${liste}. ` +
            "Ne gardez qu'une adhesion au role 'president' par groupe, puis rejouez la migration."
        );
    }
}

module.exports = {
    async up(queryInterface) {
        await verifierUnicite(queryInterface);

        await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS \`${TRG_INS}\``);
        await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS \`${TRG_UPD}\``);

        await queryInterface.sequelize.query(
            `CREATE TRIGGER \`${TRG_INS}\` BEFORE INSERT ON \`${TABLE}\` FOR EACH ROW
               IF NEW.role = 'president'
                  AND (SELECT COUNT(*) FROM \`${TABLE}\`
                        WHERE groupeId = NEW.groupeId AND role = 'president') > 0
               THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${MESSAGE}';
               END IF`
        );

        // A la modification, la ligne elle-meme ne compte pas : un president
        // qu'on met a jour pour une autre raison reste legitime.
        await queryInterface.sequelize.query(
            `CREATE TRIGGER \`${TRG_UPD}\` BEFORE UPDATE ON \`${TABLE}\` FOR EACH ROW
               IF NEW.role = 'president'
                  AND (SELECT COUNT(*) FROM \`${TABLE}\`
                        WHERE groupeId = NEW.groupeId AND role = 'president' AND id <> NEW.id) > 0
               THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${MESSAGE}';
               END IF`
        );
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS \`${TRG_INS}\``);
        await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS \`${TRG_UPD}\``);
    }
};

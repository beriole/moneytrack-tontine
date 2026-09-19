'use strict';

// =====================================================================
//  La tontine se limite a la caisse 1 : le tour rotatif.
//
//  Elle comptait plusieurs caisses. La caisse 2 — epargne commune des
//  membres, credits entre membres, casse annuelle — est retiree, avec les
//  formules « credit » et « mixte » qui la portaient. La caisse de
//  solidarite, elle, n'avait jamais ete construite.
//
//  Ce que fait cette migration :
//
//    1. refuse de s'executer s'il reste de l'argent ou une dette en
//       caisse 2 : un credit decaisse, une echeance impayee, du capital
//       dans un pool, un solde dans une caisse d'epargne. On ne supprime
//       pas une dette en supprimant sa table ;
//    2. supprime les caisses d'epargne vides ;
//    3. supprime les quatre tables de la caisse 2 ;
//    4. retire les colonnes devenues sans objet : le type du groupe, la
//       destination des amendes (sur le groupe et sur l'amende) et la
//       reference a la caisse d'epargne ;
//    5. retire le sujet de vote « approuver_credit ».
//
//  LES AMENDES. Elles pouvaient aller a la caisse d'epargne ou au pot du
//  cycle. Il ne reste qu'une regle : l'amende indemnise le membre lese,
//  c'est-a-dire le beneficiaire du cycle concerne. Elle n'est plus figee
//  sur l'amende a l'infliction mais resolue au reglement — voir
//  AmendeService.destinataire. D'ou la suppression de la colonne.
//
//  Le down() recree la structure a l'identique, vide. Les donnees, s'il y
//  en avait, se recuperent depuis le dump pris avant l'execution.
//    backups/smartpay-avant-caisse-unique-*.sql
// =====================================================================

const TABLES_CAISSE_2 = {
    "tontine_pool_credit": "CREATE TABLE `tontine_pool_credit` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `groupeId` int(11) NOT NULL,\n  `capitalTotal` decimal(15,2) NOT NULL DEFAULT 0.00,\n  `capitalDisponible` decimal(15,2) NOT NULL DEFAULT 0.00,\n  `capitalEngage` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Capital sorti en credits non encore rembourses',\n  `apportsMembres` decimal(15,2) NOT NULL DEFAULT 0.00,\n  `interetsCumules` decimal(15,2) NOT NULL DEFAULT 0.00,\n  `amendesCumulees` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Produit de la caisse 4 quand destinationAmendes = ''epargne''',\n  `tauxInteretDefaut` decimal(5,2) NOT NULL DEFAULT 5.00 COMMENT 'Taux mensuel en pourcentage, usage courant au Cameroun : 5 a 10',\n  `derniereMaj` datetime DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `groupeId` (`groupeId`),\n  CONSTRAINT `tontine_pool_credit_ibfk_1` FOREIGN KEY (`groupeId`) REFERENCES `tontine_groupes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "tontine_partages": "CREATE TABLE `tontine_partages` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `groupeId` int(11) NOT NULL,\n  `exercice` int(11) NOT NULL COMMENT 'Annee de l''exercice cloture',\n  `capitalPartage` decimal(15,2) NOT NULL DEFAULT 0.00,\n  `interetsPartages` decimal(15,2) NOT NULL DEFAULT 0.00,\n  `amendesPartagees` decimal(15,2) NOT NULL DEFAULT 0.00,\n  `nbBeneficiaires` smallint(6) NOT NULL DEFAULT 0,\n  `detail` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Part par membre : [{ clientId, apports, partCapital, partInterets }]' CHECK (json_valid(`detail`)),\n  `statut` enum('en_cours','cloture') NOT NULL DEFAULT 'en_cours',\n  `dateCloture` datetime DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  `dernierApportId` int(11) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `tontine_partages_groupe_id_exercice` (`groupeId`,`exercice`),\n  CONSTRAINT `tontine_partages_ibfk_1` FOREIGN KEY (`groupeId`) REFERENCES `tontine_groupes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "tontine_demandes_credit": "CREATE TABLE `tontine_demandes_credit` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `poolId` int(11) NOT NULL,\n  `membreId` int(11) NOT NULL,\n  `clientId` int(11) NOT NULL,\n  `montant` decimal(15,2) NOT NULL,\n  `tauxInteret` decimal(5,2) NOT NULL COMMENT 'Fige a l''approbation, ne suit pas les changements du pool',\n  `dureeMois` smallint(6) NOT NULL,\n  `totalARembourser` decimal(15,2) NOT NULL,\n  `motif` text DEFAULT NULL,\n  `statut` enum('en_attente','approuvee','rejetee','decaissee','remboursee','en_defaut') NOT NULL DEFAULT 'en_attente',\n  `voteId` int(11) DEFAULT NULL COMMENT 'Vote d''approbation du groupe',\n  `dateApprobation` datetime DEFAULT NULL,\n  `dateDecaissement` datetime DEFAULT NULL,\n  `dateEcheance` datetime DEFAULT NULL,\n  `transactionDecaissementId` int(11) DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `membreId` (`membreId`),\n  KEY `voteId` (`voteId`),\n  KEY `tontine_demandes_credit_pool_id_statut` (`poolId`,`statut`),\n  KEY `tontine_demandes_credit_client_id_statut` (`clientId`,`statut`),\n  CONSTRAINT `tontine_demandes_credit_ibfk_1` FOREIGN KEY (`poolId`) REFERENCES `tontine_pool_credit` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,\n  CONSTRAINT `tontine_demandes_credit_ibfk_2` FOREIGN KEY (`membreId`) REFERENCES `tontine_membres` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,\n  CONSTRAINT `tontine_demandes_credit_ibfk_3` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,\n  CONSTRAINT `tontine_demandes_credit_ibfk_4` FOREIGN KEY (`voteId`) REFERENCES `tontine_votes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "tontine_remboursements_credit": "CREATE TABLE `tontine_remboursements_credit` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `demandeId` int(11) NOT NULL,\n  `numeroEcheance` smallint(6) NOT NULL,\n  `montantDu` decimal(15,2) NOT NULL,\n  `montantPaye` decimal(15,2) NOT NULL DEFAULT 0.00,\n  `partCapital` decimal(15,2) NOT NULL COMMENT 'Separee de l''interet : seul l''interet alimente interetsCumules',\n  `partInteret` decimal(15,2) NOT NULL,\n  `dateEcheance` datetime NOT NULL,\n  `datePaiement` datetime DEFAULT NULL,\n  `statut` enum('attendu','paye','en_retard','impaye') NOT NULL DEFAULT 'attendu',\n  `transactionId` int(11) DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `tontine_remboursements_credit_demande_id_numero_echeance` (`demandeId`,`numeroEcheance`),\n  CONSTRAINT `tontine_remboursements_credit_ibfk_1` FOREIGN KEY (`demandeId`) REFERENCES `tontine_demandes_credit` (`id`) ON DELETE CASCADE ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
};

// Ordre impose par les cles etrangeres : les echeances pointent vers les
// demandes, les demandes vers le pool.
const ORDRE_SUPPRESSION = [
    'tontine_remboursements_credit',
    'tontine_demandes_credit',
    'tontine_pool_credit',
    'tontine_partages'
];

async function existe(qi, table) {
    try { await qi.describeTable(table); return true; } catch (e) { return false; }
}

async function colonne(qi, table, nom) {
    const d = await qi.describeTable(table);
    return Object.prototype.hasOwnProperty.call(d, nom);
}

async function premier(qi, sql) {
    const [r] = await qi.sequelize.query(sql);
    return r && r[0] ? r[0] : {};
}

/** Tout ce qui interdit de supprimer la caisse 2 sans perdre de l'argent. */
async function verifierQueRienNeReste(qi) {
    const obstacles = [];

    if (await existe(qi, 'tontine_pool_credit')) {
        const p = await premier(qi,
            'SELECT COALESCE(SUM(capitalTotal),0) capital, COALESCE(SUM(capitalEngage),0) engage FROM tontine_pool_credit');
        if (Number(p.capital) !== 0 || Number(p.engage) !== 0) {
            obstacles.push(`capital en caisse de credit : ${p.capital} FCFA, dont ${p.engage} engages`);
        }
    }
    if (await existe(qi, 'tontine_demandes_credit')) {
        const n = await premier(qi,
            "SELECT COUNT(*) n FROM tontine_demandes_credit WHERE statut IN ('en_attente','approuvee','decaissee','en_defaut')");
        if (Number(n.n) > 0) obstacles.push(`${n.n} demande(s) de credit non close(s)`);
    }
    if (await existe(qi, 'tontine_remboursements_credit')) {
        const n = await premier(qi,
            "SELECT COUNT(*) n, COALESCE(SUM(montantDu - montantPaye),0) du FROM tontine_remboursements_credit WHERE statut <> 'paye'");
        if (Number(n.n) > 0) obstacles.push(`${n.n} echeance(s) de credit impayee(s), ${n.du} FCFA dus`);
    }
    if (await colonne(qi, 'tontine_groupes', 'portefeuilleEpargneId')) {
        const c = await premier(qi,
            `SELECT COUNT(*) n, COALESCE(SUM(p.solde),0) total
               FROM tontine_groupes g JOIN Portefeuilles p ON p.id = g.portefeuilleEpargneId
              WHERE p.solde <> 0`);
        if (Number(c.n) > 0) obstacles.push(`${c.n} caisse(s) d'epargne non vide(s), ${c.total} FCFA`);
    }

    if (obstacles.length) {
        throw new Error(
            'Suppression de la caisse 2 refusee — il reste de l\'argent ou des dettes :\n  - '
            + obstacles.join('\n  - ')
            + "\nSoldez ou restituez ces montants avant de rejouer la migration."
        );
    }
}

module.exports = {
    async up(queryInterface) {
        await verifierQueRienNeReste(queryInterface);

        // Caisses d'epargne vides : elles n'ont plus de groupe a servir.
        if (await colonne(queryInterface, 'tontine_groupes', 'portefeuilleEpargneId')) {
            await queryInterface.sequelize.query(
                `DELETE p FROM Portefeuilles p
                   JOIN tontine_groupes g ON g.portefeuilleEpargneId = p.id
                  WHERE p.solde = 0`
            );
        }

        for (const table of ORDRE_SUPPRESSION) {
            if (await existe(queryInterface, table)) await queryInterface.dropTable(table);
        }

        for (const [table, nom] of [
            ['tontine_groupes', 'type'],
            ['tontine_groupes', 'destinationAmendes'],
            ['tontine_groupes', 'portefeuilleEpargneId'],
            ['tontine_amendes', 'destination']
        ]) {
            if (await colonne(queryInterface, table, nom)) await queryInterface.removeColumn(table, nom);
        }

        const credit = await premier(queryInterface,
            "SELECT COUNT(*) n FROM tontine_votes WHERE sujet = 'approuver_credit'");
        if (Number(credit.n) > 0) {
            // Des scrutins historiques : leur sujet deviendrait invalide.
            throw new Error(`${credit.n} scrutin(s) d'approbation de credit en base : sujet impossible a retirer`);
        }
        await queryInterface.sequelize.query(
            `ALTER TABLE tontine_votes MODIFY sujet
               ENUM('admettre','exclure','modifier_regles','dissoudre','elire_ordre') NOT NULL`
        );
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(
            `ALTER TABLE tontine_votes MODIFY sujet
               ENUM('admettre','exclure','modifier_regles','dissoudre','elire_ordre','approuver_credit') NOT NULL`
        );

        const colonnes = [
            ['tontine_groupes', 'type',
             "ENUM('rotative','credit','mixte') NOT NULL DEFAULT 'rotative'"],
            ['tontine_groupes', 'destinationAmendes',
             "ENUM('epargne','pot_cycle') NOT NULL DEFAULT 'pot_cycle'"],
            ['tontine_groupes', 'portefeuilleEpargneId', 'INT(11) NULL'],
            ['tontine_amendes', 'destination',
             "ENUM('epargne','pot_cycle') NOT NULL DEFAULT 'pot_cycle'"]
        ];
        for (const [table, nom, def] of colonnes) {
            if (!(await colonne(queryInterface, table, nom))) {
                await queryInterface.sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${nom}\` ${def}`);
            }
        }

        // Ordre inverse de la suppression : le pool avant les demandes, les
        // demandes avant les echeances.
        for (const table of ['tontine_pool_credit', 'tontine_partages',
                             'tontine_demandes_credit', 'tontine_remboursements_credit']) {
            if (!(await existe(queryInterface, table))) {
                await queryInterface.sequelize.query(TABLES_CAISSE_2[table]);
            }
        }
    }
};

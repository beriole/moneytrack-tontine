// =====================================================================
//  Module tontine — modeles et associations internes au module.
//
//  Perimetre : caisse 1 (le tour), caisse 2 (epargne / credit),
//  caisse 4 (amendes). La caisse de solidarite est hors perimetre.
//
//  Les associations vers Client, Portefeuille et Transaction sont
//  declarees dans models/index.js, la ou ces modeles sont en portee :
//  les declarer ici creerait une dependance circulaire.
// =====================================================================

const TontineGroupe = require('./model.groupe');
const TontineMembre = require('./model.membre');
const TontineCycle = require('./model.cycle');
const TontineCotisation = require('./model.cotisation');
const TontineCaution = require('./model.caution');
const TontineAmende = require('./model.amende');
const TontineVote = require('./model.vote');
const TontineVoteReponse = require('./model.voteReponse');
const TontineEchangeTour = require('./model.echangeTour');
const TontineEnchere = require('./model.enchere');
const TontinePoolCredit = require('./model.poolCredit');
const TontineDemandeCredit = require('./model.demandeCredit');
const TontineRemboursementCredit = require('./model.remboursementCredit');
const TontinePartage = require('./model.partage');
const TontineContrat = require('./model.contrat');
const TontineSignature = require('./model.signature');

// ---------------------------------------------------------------
//  Caisse 1 — le tour
// ---------------------------------------------------------------

// Groupe <-> Membres
TontineGroupe.hasMany(TontineMembre, { foreignKey: 'groupeId', as: 'membres', onDelete: 'CASCADE', hooks: true });
TontineMembre.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });

// Groupe <-> Cycles
TontineGroupe.hasMany(TontineCycle, { foreignKey: 'groupeId', as: 'cycles', onDelete: 'CASCADE', hooks: true });
TontineCycle.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });

// Cycle <-> Cotisations : la ligne qui dit qui a paye pour ce cycle
TontineCycle.hasMany(TontineCotisation, { foreignKey: 'cycleId', as: 'cotisations', onDelete: 'CASCADE', hooks: true });
TontineCotisation.belongsTo(TontineCycle, { foreignKey: 'cycleId', as: 'cycle' });

// Membre <-> Cotisations
TontineMembre.hasMany(TontineCotisation, { foreignKey: 'membreId', as: 'cotisations', onDelete: 'CASCADE', hooks: true });
TontineCotisation.belongsTo(TontineMembre, { foreignKey: 'membreId', as: 'membre' });

// Marche des tours
TontineGroupe.hasMany(TontineEchangeTour, { foreignKey: 'groupeId', as: 'echangesTour', onDelete: 'CASCADE', hooks: true });
TontineEchangeTour.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });

// Encheres sur le pot d'un cycle
TontineCycle.hasMany(TontineEnchere, { foreignKey: 'cycleId', as: 'encheres', onDelete: 'CASCADE', hooks: true });
TontineEnchere.belongsTo(TontineCycle, { foreignKey: 'cycleId', as: 'cycle' });
TontineMembre.hasMany(TontineEnchere, { foreignKey: 'membreId', as: 'encheres' });
TontineEnchere.belongsTo(TontineMembre, { foreignKey: 'membreId', as: 'membre' });

// ---------------------------------------------------------------
//  Caisse 4 — discipline et garanties
// ---------------------------------------------------------------

// Caution : une par membre et par groupe
TontineGroupe.hasMany(TontineCaution, { foreignKey: 'groupeId', as: 'cautions', onDelete: 'CASCADE', hooks: true });
TontineCaution.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });
TontineMembre.hasOne(TontineCaution, { foreignKey: 'membreId', as: 'caution', onDelete: 'CASCADE', hooks: true });
TontineCaution.belongsTo(TontineMembre, { foreignKey: 'membreId', as: 'membre' });

// Amendes
TontineGroupe.hasMany(TontineAmende, { foreignKey: 'groupeId', as: 'amendes', onDelete: 'CASCADE', hooks: true });
TontineAmende.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });
TontineMembre.hasMany(TontineAmende, { foreignKey: 'membreId', as: 'amendes', onDelete: 'CASCADE', hooks: true });
TontineAmende.belongsTo(TontineMembre, { foreignKey: 'membreId', as: 'membre' });
TontineCycle.hasMany(TontineAmende, { foreignKey: 'cycleId', as: 'amendes' });
TontineAmende.belongsTo(TontineCycle, { foreignKey: 'cycleId', as: 'cycle' });

// ---------------------------------------------------------------
//  Gouvernance
// ---------------------------------------------------------------

TontineGroupe.hasMany(TontineVote, { foreignKey: 'groupeId', as: 'votes', onDelete: 'CASCADE', hooks: true });
TontineVote.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });

TontineVote.hasMany(TontineVoteReponse, { foreignKey: 'voteId', as: 'reponses', onDelete: 'CASCADE', hooks: true });
TontineVoteReponse.belongsTo(TontineVote, { foreignKey: 'voteId', as: 'vote' });

// Reglement interieur signe
TontineGroupe.hasMany(TontineContrat, { foreignKey: 'groupeId', as: 'contrats', onDelete: 'CASCADE', hooks: true });
TontineContrat.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });
TontineContrat.hasMany(TontineSignature, { foreignKey: 'contratId', as: 'signatures', onDelete: 'CASCADE', hooks: true });
TontineSignature.belongsTo(TontineContrat, { foreignKey: 'contratId', as: 'contrat' });
TontineContrat.belongsTo(TontineContrat, { foreignKey: 'contratAmendeId', as: 'versionPrecedente' });

// ---------------------------------------------------------------
//  Caisse 2 — epargne et credit
// ---------------------------------------------------------------

TontineGroupe.hasOne(TontinePoolCredit, { foreignKey: 'groupeId', as: 'poolCredit', onDelete: 'CASCADE', hooks: true });
TontinePoolCredit.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });

TontinePoolCredit.hasMany(TontineDemandeCredit, { foreignKey: 'poolId', as: 'demandes', onDelete: 'CASCADE', hooks: true });
TontineDemandeCredit.belongsTo(TontinePoolCredit, { foreignKey: 'poolId', as: 'pool' });

TontineMembre.hasMany(TontineDemandeCredit, { foreignKey: 'membreId', as: 'demandesCredit' });
TontineDemandeCredit.belongsTo(TontineMembre, { foreignKey: 'membreId', as: 'membre' });

// Une demande de credit passe par un vote d'approbation du groupe
TontineDemandeCredit.belongsTo(TontineVote, { foreignKey: 'voteId', as: 'vote' });

TontineDemandeCredit.hasMany(TontineRemboursementCredit, { foreignKey: 'demandeId', as: 'echeances', onDelete: 'CASCADE', hooks: true });
TontineRemboursementCredit.belongsTo(TontineDemandeCredit, { foreignKey: 'demandeId', as: 'demande' });

// La casse annuelle
TontineGroupe.hasMany(TontinePartage, { foreignKey: 'groupeId', as: 'partages', onDelete: 'CASCADE', hooks: true });
TontinePartage.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });

module.exports = {
    TontineGroupe,
    TontineMembre,
    TontineCycle,
    TontineCotisation,
    TontineCaution,
    TontineAmende,
    TontineVote,
    TontineVoteReponse,
    TontineEchangeTour,
    TontineEnchere,
    TontinePoolCredit,
    TontineDemandeCredit,
    TontineRemboursementCredit,
    TontinePartage,
    TontineContrat,
    TontineSignature
};

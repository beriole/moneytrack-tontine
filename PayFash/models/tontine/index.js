// =====================================================================
//  Module tontine — modeles et associations internes au module.
//
//  Perimetre : le tour rotatif, et la discipline qui le protege
//  (caution et amendes).
//
//  La tontine comptait plusieurs caisses. Elle se limite desormais a la
//  premiere : chacun cotise, le pot revient a un membre par periode.
//  La caisse d'epargne et le credit entre membres (ex-caisse 2) ont ete
//  retires ; la caisse de solidarite n'avait jamais ete construite.
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
const TontineContrat = require('./model.contrat');
const TontineSignature = require('./model.signature');
const TontineGarantie = require('./model.garantie');
const TontineGarantieMouvement = require('./model.garantieMouvement');
const TontineConsentementGarantie = require('./model.consentementGarantie');
const TontineEvaluationEligibilite = require('./model.evaluationEligibilite');
const TontineIncidentDefaut = require('./model.incidentDefaut');

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
//  Discipline — ce qui protege le tour
// ---------------------------------------------------------------

// Caution : une par membre et par groupe
TontineGroupe.hasMany(TontineCaution, { foreignKey: 'groupeId', as: 'cautions', onDelete: 'CASCADE', hooks: true });
TontineCaution.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });
TontineMembre.hasOne(TontineCaution, { foreignKey: 'membreId', as: 'caution', onDelete: 'CASCADE', hooks: true });
TontineCaution.belongsTo(TontineMembre, { foreignKey: 'membreId', as: 'membre' });

// Garanties : des fonds du membre bloques sur son propre portefeuille
TontineGroupe.hasMany(TontineGarantie, { foreignKey: 'groupeId', as: 'garanties', onDelete: 'CASCADE', hooks: true });
TontineGarantie.belongsTo(TontineGroupe, { foreignKey: 'groupeId', as: 'groupe' });
TontineMembre.hasMany(TontineGarantie, { foreignKey: 'membreId', as: 'garanties', onDelete: 'CASCADE', hooks: true });
TontineGarantie.belongsTo(TontineMembre, { foreignKey: 'membreId', as: 'membre' });
TontineGarantie.hasMany(TontineGarantieMouvement, { foreignKey: 'garantieId', as: 'mouvements', onDelete: 'CASCADE', hooks: true });
TontineGarantieMouvement.belongsTo(TontineGarantie, { foreignKey: 'garantieId', as: 'garantie' });
TontineGarantie.belongsTo(TontineConsentementGarantie, { foreignKey: 'consentementId', as: 'consentement' });

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

// Incidents de defaut : ce que le recouvrement n'a pas couvert
TontineGroupe.hasMany(TontineIncidentDefaut, { foreignKey: 'groupeId', as: 'incidents', onDelete: 'CASCADE', hooks: true });
TontineIncidentDefaut.belongsTo(TontineCotisation, { foreignKey: 'cotisationId', as: 'cotisation' });
TontineIncidentDefaut.belongsTo(TontineCycle, { foreignKey: 'cycleId', as: 'cycle' });

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
    TontineContrat,
    TontineSignature,
    TontineGarantie,
    TontineGarantieMouvement,
    TontineConsentementGarantie,
    TontineEvaluationEligibilite,
    TontineIncidentDefaut
};

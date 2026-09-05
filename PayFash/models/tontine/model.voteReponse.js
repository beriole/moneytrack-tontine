const { DataTypes } = require('sequelize');
const db = require('../../config/bd');

const TontineVoteReponse = db.define("TontineVoteReponse", {
    voteId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    choix: {
        type: DataTypes.ENUM('pour', 'contre', 'abstention'),
        allowNull: false
    },
    commentaire: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    dateReponse: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'tontine_vote_reponses',
    timestamps: true,
    indexes: [
        // Invariant metier : une voix par membre et par vote
        { unique: true, fields: ['voteId', 'clientId'] }
    ]
});

module.exports = TontineVoteReponse;

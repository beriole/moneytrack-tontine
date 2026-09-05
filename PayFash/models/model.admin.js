const { DataTypes } = require('sequelize');
const db = require('../config/bd');

const Admin = db.define("Admin", {
    nom: {
        type: DataTypes.STRING,
        allowNull: false
    },
    prenom: {
        type: DataTypes.STRING,
        allowNull: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
    },
    motDePasse: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { len: [8, 1000] }
    },
    // RBAC : rôle de l'administrateur / agent
    role: {
        type: DataTypes.ENUM(
            'SUPER_ADMIN',
            'ADMIN_FINANCE',
            'SUPPORT',
            'COMPLIANCE',
            'MARKETING',
            'AGENT_KYC',
            'AGENT_SELLER'
        ),
        allowNull: false,
        defaultValue: 'SUPPORT'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    lastLogin: {
        type: DataTypes.DATE,
        allowNull: true
    }
});

module.exports = Admin;

const {DataTypes}=require('sequelize');
const db=require('../config/bd');

const TransactionEpargne = db.define('TransactionEpargne', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  montant: { type: DataTypes.FLOAT, allowNull: false },
  date_transaction: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  description: { type: DataTypes.STRING }
}, {
  tableName: 'savings_transactions'
});




module.exports= TransactionEpargne;

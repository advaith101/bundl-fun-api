const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Token = sequelize.define('Token', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  ticker: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: null,
  },
  supply: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  burnTaxBuy: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  burnTaxSell: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  lpTaxBuy: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  lpTaxSell: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  marketingTaxBuy: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  marketingTaxSell: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  maxWalletRatio: {
    type: DataTypes.BIGINT,
    defaultValue: 1,
  },
  clogRatio: {
    type: DataTypes.BIGINT,
    defaultValue: 1,
  },
  contractAddress: {
    type: DataTypes.STRING,
    defaultValue: null,
  },
  deploymentTx: {
    type: DataTypes.TEXT,
    defaultValue: null,
  },
  initialLiquidity: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  bundleAmount: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  bundleDistribution: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  deployerWallet: {
    type: DataTypes.STRING,
    defaultValue: null,
  },
  operatorWalletPrivateKey: {
    type: DataTypes.STRING,
    defaultValue: null,
  },
  paymentReceived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

module.exports = Token;
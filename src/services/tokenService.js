const Token = require('../models/Token');
const contractService = require('./contractService');

class TokenService {
  async createToken(tokenData) {
    const operator = await contractService.generateOperatingWallet();
    tokenData.operatorWalletPrivateKey = operator.privateKey;
    const token = await Token.create(tokenData);
    const deployInfo = await contractService.generateDeploymentTransaction(token);
    return {
        id: token.id,
        operatorWallet: operator.address,
        deployInfo: deployInfo
    };
  }

  async updateTokenWithContract(id, deployedAddress, deployer) {
    const token = await Token.findByPk(id);
    if (!token) throw new Error('Token not found');
    await token.update({ contractAddress: deployedAddress, deployerWallet: deployer });
    return token;
  }

  async updateInitialLiquidity(id, initialLiquidity) {
    const token = await Token.findByPk(id);
    if (!token) throw new Error('Token not found');
    await token.update({ initialLiquidity });
    return token;
  }

  async bundle(id, bundleData) {
    const token = await Token.findByPk(id);
    if (!token) throw new Error('Token not found');
    const bundleResult = await contractService.bundle(token, bundleData);
    return bundleResult;
  }
}

module.exports = new TokenService();
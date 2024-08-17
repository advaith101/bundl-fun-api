const tokenService = require('../services/tokenService');

class TokenController {
  async createToken(req, res) {
    try {
      const token = await tokenService.createToken(req.body);
      res.status(201).json(token);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateTokenWithContract(req, res) {
    try {
      const { id } = req.params;
      //req.body is json with contractAddress and deployerWallet as keys
      const contractAddress = req.body.contractAddress;
      const deployerWallet = req.body.deployerWallet;
      const token = await tokenService.updateTokenWithContract(id, contractAddress, deployerWallet);
      res.status(200).json(token);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateInitialLiquidity(req, res) {
    try {
      const { id } = req.params;
      const { initialLiquidity } = req.body;
      const token = await tokenService.updateInitialLiquidity(id, initialLiquidity);
      res.status(200).json(token);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async bundle(req, res) {
    try {
      const { id } = req.params;
      const bundleResult = await tokenService.bundle(id, req.body);
      res.status(200).json(bundleResult);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new TokenController();
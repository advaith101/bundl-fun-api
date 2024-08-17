const ethers = require('ethers');
const solc = require('solc');
const flashbots = require("@flashbots/ethers-provider-bundle");
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const tokenAbi = require('../abis/token.json');

class ContractService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`, 1);
    this.authSigner = ethers.Wallet.createRandom();
    this.flashbotsProvider = null;
    this.initializeFlashbots();
  }

  async initializeFlashbots() {
    this.flashbotsProvider = await flashbots.FlashbotsBundleProvider.create(
      this.provider,
      this.authSigner,
      "https://relay.flashbots.net",
      1
    );
  }

  async compileContract(sourceCode) {
    const input = {
      language: 'Solidity',
      sources: {
        'Token.sol': {
          content: sourceCode,
        },
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['*'],
          },
        },
      },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const contract = output.contracts['Token.sol']['Token'];
    return {
      abi: contract.abi,
      bytecode: contract.evm.bytecode.object,
    };
  }

  async generateOperatingWallet() {
    return ethers.Wallet.createRandom();
  }

  async generateDeploymentTransaction(tokenData) {
    const templatePath = path.join(__dirname, '../contracts/contractTemplate.sol');
    let contractTemplate = await fs.readFile(templatePath, 'utf8');

    const operator = ethers.Wallet.createRandom();


    // Replace placeholders in the contract template
    contractTemplate = contractTemplate.replace('_NAME_', tokenData.name)
      .replace('_TICKER_', tokenData.ticker)
      .replace('_SUPPLY_', tokenData.supply)
      .replace('_BURN_TAX_BUY_', tokenData.burnTaxBuy)
      .replace('_BURN_TAX_SELL_', tokenData.burnTaxSell)
      .replace('_LP_TAX_BUY_', tokenData.lpTaxBuy)
      .replace('_LP_TAX_SELL_', tokenData.lpTaxSell)
      .replace('_MARKETING_TAX_BUY_', tokenData.marketingTaxBuy)
      .replace('_MARKETING_TAX_SELL_', tokenData.marketingTaxSell)
      .replace('_MAX_WALLET_RATIO_', tokenData.maxWalletRatio)
      .replace('_CLOG_RATIO_', tokenData.clogRatio)
      .replace('_OPERATOR_WALLET_', tokenData.operatorWallet);

    const compiledContract = await this.compileContract(contractTemplate);

    const factory = new ethers.ContractFactory(compiledContract.abi, compiledContract.bytecode);
    const unsignedTx = factory.getDeployTransaction();

    return {
      id: tokenData.id,
      data: unsignedTx.data,
      abi: compiledContract.abi,
      bytecode: compiledContract.bytecode,
      gasLimit: 5000000,
    };
  }

  async generateEnableTradingTransaction(tokenData) {
    const feeData = await this.provider.getFeeData();
    let maxFeePerGas = parseInt(feeData.maxFeePerGas * 8n / 10n);
    let maxPriorityFeePerGas = maxFeePerGas;

    const token = new ethers.Contract(tokenData.contractAddress, tokenAbi, this.provider);

    const tx = await token.populateTransaction.openTrading({
      type: 2,
      from: tokenData.deployerWallet,
      nonce: await deployer.getTransactionCount(),
      gasLimit: 50000,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    });
    tx.chainId = 1;
    return tx;
  }

  async generateSetTaxesTransaction(tokenData) {
    const feeData = await this.provider.getFeeData();
    let maxFeePerGas = parseInt(feeData.maxFeePerGas * 8n / 10n);
    let maxPriorityFeePerGas = maxFeePerGas;

    const token = new ethers.Contract(tokenData.contractAddress, tokenAbi, this.provider);

    const tx = await token.populateTransaction.setTaxes(
      tokenData.burnTaxBuy,
      tokenData.burnTaxSell,
      tokenData.lpTaxBuy,
      tokenData.lpTaxSell,
      tokenData.marketingTaxBuy,
      tokenData.marketingTaxSell,
      {
        type: 2,
        from: tokenData.deployerWallet,
        nonce: await deployer.getTransactionCount() + 1,
        gasLimit: 120000,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
      }
    );
    tx.chainId = 1;
    return tx;
  }

  async setMaxWalletSizeTransaction(tokenData) {
    const feeData = await this.provider.getFeeData();
    let maxFeePerGas = parseInt(feeData.maxFeePerGas * 8n / 10n);
    let maxPriorityFeePerGas = maxFeePerGas;

    const token = new ethers.Contract(tokenData.contractAddress, tokenAbi, this.provider);

    const tx = await token.populateTransaction.setMaxWalletSize(
      tokenData.maxWalletSize,
      {
        type: 2,
        from: tokenData.deployerWallet,
        nonce: await deployer.getTransactionCount() + 2,
        gasLimit: 50000,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
      }
    );
    tx.chainId = 1;
    return tx;
  }

  async bundle(tokenData, bundleData) {
    const sniper = new ethers.Wallet(tokenData.operatorWalletPrivateKey, this.provider);
    const token = new ethers.Contract(tokenData.contractAddress, tokenAbi, this.provider);
    const uniswap = new ethers.Contract(process.env.UNISWAP_ROUTER_ADDRESS, require('./abis/uniswapV2router.json'), this.provider);
    const uniswapPairAddress = await token.uniswapV2Pair();
    const uniswapPair = new ethers.Contract(uniswapPairAddress, require('./abis/uniswapV2pair.json'), this.provider);

    const isToken0 = await uniswapPair.token0() === token.address;
    const reserves = await uniswapPair.getReserves();
    const liquidityETH = isToken0 ? reserves[1] : reserves[0];

    let iteration = 0;
    while (true) {
      if (iteration >= 10) {
        console.warn('Max iterations reached');
        return { success: false, error: 'Max iterations reached' };
      }

      // Bundles
      const flashBundle = [];
      const beaverBundle = [];

      // Get fee data
      const feeData = await this.provider.getFeeData();
      let maxFeePerGas = parseInt(feeData.maxFeePerGas * 8n / 10n);
      let maxPriorityFeePerGas = maxFeePerGas;


      const fee = ethers.utils.parseEther("0.03");
      const sniperBalance = await this.provider.getBalance(sniper.address) - fee;
      const snipeGas = 250000 * maxFeePerGas;
      const transferGas = 120000 * maxFeePerGas;
      const enableTradingGas = 50000 * maxFeePerGas;
      const resetMaxWalletGas = 50000 * maxFeePerGas;
      const totalGas = snipeGas + transferGas * tokenData.distroWallets.length + enableTradingGas + resetMaxWalletGas;
      const bundleAmount = sniperBalance - totalGas;
      
      // Add transactions to the bundle
      // Enable trading
      //TODO: maybe separate operator and sniper wallets
      let enableTradingTx = await this.createTransaction(token, 'openTrading', [], sniper, maxFeePerGas, maxPriorityFeePerGas, 50000);
      flashBundle.push({ signer: sniper, transaction: enableTradingTx });
      beaverBundle.push(await sniper.signTransaction(enableTradingTx));

      // Snipe transaction
      let snipeTx = await this.createUniswapBuyTransaction(uniswap, token.address, sniperWallet, maxFeePerGas, maxPriorityFeePerGas, bundleAmount);
      flashBundle.push({ signer: sniper, transaction: snipeTx });
      beaverBundle.push(await sniper.signTransaction(snipeTx));

      // Transfer to distro wallets
      const totalSupply = await token.totalSupply();
      const outputAmount = this.calculateOutputAmount(bundleAmount, liquidityETH, totalSupply);
      const averageAmount = outputAmount / bundleData.distroWallets.length;
      let lastAmount = 0;
      let amounts = [];
      for (let i = 0; i < bundleData.distroWallets.length; i++) {
        let amount;
        if (i % 2 == 0) {
          amount = parseInt(averageAmount * (1 -  Math.random() * 0.1));
        } else {
          amount = averageAmount * 2 - lastAmount;
        }
        if (i == bundleData.distroWallets.length - 1 && bundleData.distroWallets.length % 2 == 1) {
          amount = averageAmount;
        }
        lastAmount = amount;
        amounts.push(amount);
        let transferTx = await this.createTransaction(token, 'transfer', [bundleData.distroWallets[i], amount], sniper, maxFeePerGas, maxPriorityFeePerGas, 120000);
        flashBundle.push({ signer: sniper, transaction: transferTx });
        beaverBundle.push(await sniper.signTransaction(transferTx));
      }

      // Calculate max wallet
      const maxAmount = Math.max(...amounts);
      //round maxAmount to the 1st most significant digit, rounding up
      const maxWalletSize = BigInt(Math.ceil(maxAmount / 10 ** Math.floor(Math.log10(maxAmount))) * 10 ** Math.floor(Math.log10(maxAmount))); //TODO: check

      //  Reset max wallet size
      let resetMaxWalletTx = await this.createTransaction(token, 'setMaxWalletSize', [maxWalletSize], sniper, maxFeePerGas, maxPriorityFeePerGas);
      flashBundle.push({ signer: sniper, transaction: resetMaxWalletTx });
      beaverBundle.push(await sniper.signTransaction(resetMaxWalletTx));

      // Simulate the bundle
      const targetBlockNumber = await this.provider.getBlockNumber() + 2;
      const simulation = await this.flashbotsProvider.simulate(beaverBundle, targetBlockNumber);

      if ('error' in simulation) {
        console.warn(`Simulation Error: ${simulation.error.message}`);
        return { success: false, error: simulation.error.message };
      }

      // Send the bundle
      const bundleResponse = await this.sendBundle(beaverBundle, targetBlockNumber);
      if (!bundleResponse.success) {
        console.warn(`Bundle Error: ${bundleResponse.error}`);
        return { success: false, error: bundleResponse.error };
      }

      // Check if bundle was included in block and if not, try again
      let blockNumber = await provider.getBlockNumber();
      while (blockNumber < targetBlockNumber) {
        //sleep 1 second
        console.log('Waiting for target block');
        await new Promise(resolve => setTimeout(resolve, 1000));
        blockNumber = await provider.getBlockNumber();
      }
      console.log('Target block reached');
      const block = await provider.getBlock(targetBlockNumber);
      let included = false;
      // check if txns are included
      for (let i = 0; i < block.transactions.length; i++) {
          //get txn info from hash
          const txn = await provider.getTransaction(block.transactions[i]);
          if (txn.from == sniper.address) {
              console.log('Bundle included in block');
              included = true;
              break;
          }
      }
      if (included) return bundleResponse;
      console.log('Bundle not included in block');
      console.log('Trying again...\n\n');
      iteration++;
    }
  }

  async createTransaction(contract, method, params, signer, maxFeePerGas, maxPriorityFeePerGas, gasLimit = 250000) {
    const nonce = await signer.getTransactionCount();
    const tx = await contract.populateTransaction[method](...params, {
      type: 2,
      from: signer.address,
      nonce: nonce,
      gasLimit: gasLimit,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    });
    tx.chainId = 1;
    return tx;
  }

  async createUniswapBuyTransaction(uniswap, tokenAddress, sniperWallet, maxFeePerGas, maxPriorityFeePerGas, bundleAmount) {
    const buyAmount = ethers.utils.parseEther(sniperWallet.amount.toString());
    
    const tx = await uniswap.populateTransaction.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      [await uniswap.WETH(), tokenAddress],
      sniperWallet.address,
      ethers.constants.MaxUint256, //max uint256
      {
        type: 2,
        from: sniperWallet.address,
        nonce: await this.provider.getTransactionCount(sniperWallet.address),
        value: bundleAmount,
        gasLimit: 250000,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
      }
    );
    tx.chainId = 1;
    return tx;
  }

  //TODO: check
  calculateOutputAmount(inputAmount, inputReserve, outputReserve) {
    const inputAmountWithFee = inputAmount * 997;
    const numerator = inputAmountWithFee * outputReserve;
    const denominator = inputReserve * 1000 + inputAmountWithFee;
    return numerator / denominator;
  }

  //TODO: check
  calculateInputAmount(outputAmount, inputReserve, outputReserve) {
    const numerator = inputReserve * outputAmount * 1000;
    const denominator = (outputReserve - outputAmount) * 997;
    return numerator / denominator + 1;
  }

  async sendBundle(beaverBundle, targetBlockNumber) {
    const url = "https://rpc.beaverbuild.org/";
    const headers = { "Content-Type": "application/json" };
    const payload = {
      txs: beaverBundle,
      blockNumber: targetBlockNumber,
      uuid: uuidv4()
    };
    const data = {
      jsonrpc: "2.0",
      method: "eth_sendBundle",
      params: [payload],
      id: 1
    };

    try {
      const response = await axios.post(url, data, { headers: headers });
      return { success: true, response: response.data };
    } catch (error) {
      console.error("Error sending bundle:", error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ContractService();
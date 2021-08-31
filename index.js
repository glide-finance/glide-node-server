// Importing required libraries
const cron = require("node-cron");
const express = require("express");
const ethers = require("ethers");
const fs = require("fs");
const secrets = require("./secrets.json");


const mnemonic = secrets.mnemonic;
  
const app = express(); // Initializing app

const url = "http://localhost:8545";
//const url = "https://api.elastos.io/eth";
const feeDistributorContractAddress = "0x68DADa9Bf98d7357514cCe0E20782074F6e3C7D3";
const routerContractAddress = "0x684F1b593901e802eA0995E1E8b1Bb89ceD151FE";
const swapRewardsChefAddress = "0x18f63149c8e228e5f1f0b8305aaF7a2279cc74Ba";
const wETHAddress = "0x517E9e5d46C1EA8aB6f78677d6114Ef47F71f6c4";

const customHttpProvider = new ethers.providers.JsonRpcProvider(url);
const mnemonicWallet = ethers.Wallet.fromMnemonic(mnemonic).connect(customHttpProvider);
const signer = customHttpProvider.getSigner();

const feeDistibutorContractParse = JSON.parse(fs.readFileSync('./contracts/FeeDistributor.json', 'utf8'));
const feeDistibutorContractABI = JSON.stringify(feeDistibutorContractParse.abi);

const IERC20ContractParse = JSON.parse(fs.readFileSync('./contracts/IERC20.json', 'utf8'));
const IERC20ContractAbi = JSON.stringify(IERC20ContractParse.abi);

const feeDistibutorContract = new ethers.Contract(feeDistributorContractAddress, feeDistibutorContractABI, signer);

// Creating a cron job which runs on every 10 second - */10 * * * * *
// Creating a cron job which runs on every 6 hour - 0 */6 * * *
cron.schedule("*/10 * * * * *", async function() {
    console.log("START");

    //Get block number to check is network working
    const blockNumber = await customHttpProvider.getBlockNumber();
    console.log("Current block number: " + blockNumber);

    // Get wallet address to check is correct wallet connected
    const walletAddress = await mnemonicWallet.getAddress();
    console.log("Wallet address: " + walletAddress);

    // Get balance for lp test token one - test token two before remove liquidity
    const LP_TestTokenOne_TestTokenTwo_Addr = "0x758619B58502213CD171B5B04EC756596966A735";
    const testTokenOneAddress = "0x9Eb377aad7d009E750BCd380f5a428FC223Db420";
    const concretePairInstance = new ethers.Contract(LP_TestTokenOne_TestTokenTwo_Addr, IERC20ContractAbi, signer);
    var balanceBeforeRemoveLiquidity;
    try {
        balanceBeforeRemoveLiquidity = await concretePairInstance.balanceOf(feeDistributorContractAddress);
        console.log("BalanceBeforeRemoveLiquidity: " + balanceBeforeRemoveLiquidity);
    } catch(error) {
        console.log(error);
    }

    // Remove liquidity from feeDistributor contract
    try {
        if (balanceBeforeRemoveLiquidity > 0) {
            await feeDistibutorContract.removeLiquidity(routerContractAddress, LP_TestTokenOne_TestTokenTwo_Addr);
        }
    } catch(error) {
        console.log(error);
    }

    // Get balance for lp test token one - test token two after remove liquidity
    var balanceAfterRemoveLiquidity;
    try {
        balanceAfterRemoveLiquidity = await concretePairInstance.balanceOf(feeDistributorContractAddress);
        console.log("balanceAfterRemoveLiquidity: " + balanceAfterRemoveLiquidity);
    } catch(error) {
        console.log(error);
    }

    // Get balance for test token one before sell tokens
    const testTokenOneInstance = new ethers.Contract(testTokenOneAddress, IERC20ContractAbi, signer);
    var balanceBeforeSellTokens;
    try {
        balanceBeforeSellTokens = await testTokenOneInstance.balanceOf(feeDistributorContractAddress);
        console.log("BalanceBeforeSellTokens: " + balanceBeforeSellTokens);
    } catch(error) {
        console.log(error);
    }

    // Sell tokens on fee distributor contract
    try {
        if (balanceBeforeSellTokens > 0) {
            await feeDistibutorContract.sellTokens(routerContractAddress,
                testTokenOneAddress,
                wETHAddress,
                [testTokenOneAddress, wETHAddress]);
        }
    } catch(error) {
        console.log(error);
    }

    // Get balance for test token one after sell tokens
    var balanceAfterSellTokens;
    try {
        balanceAfterSellTokens = await testTokenOneInstance.balanceOf(feeDistributorContractAddress);
        console.log("BalanceAfterSellTokens: " + balanceAfterSellTokens);
    } catch(error) {
        console.log(error);
    }


    // wETH balance for feeDistributor contract
    const wETHInstance = new ethers.Contract(wETHAddress, IERC20ContractAbi, signer);
    var balanceBeforeDistributeFee;
    try {
        balanceBeforeDistributeFee = await wETHInstance.balanceOf(feeDistributorContractAddress);
        console.log("BalanceBeforeDistributeFee: " + balanceBeforeDistributeFee);
    } catch(error) {
        console.log(error);
    }

    //distribute fee on fee distributor
    try {
        await feeDistibutorContract.distributeFees();
    } catch(error) {
        console.log(error);
    }

    // wETH balance for swapRewardsChef contract after distribute fees
    var balanceAfterDistributeFee;
    try {
        balanceAfterDistributeFee = await wETHInstance.balanceOf(swapRewardsChefAddress);
        console.log("BalanceAfterDistributeFee: " + balanceAfterDistributeFee);
    } catch(error) {
        console.log(error);
    }

    console.log("END");
});
  
app.listen(3000);
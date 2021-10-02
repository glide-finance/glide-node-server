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

const feeDistributorContractAddress = "0xc4B300C91045cd0c62aB3c712f6c55DD2aDd5708";
const routerContractAddress = "0xfFa69bD192D214D6FC8DBA007BD92Ee7Dc4D3e18";
const swapRewardsChefAddress = "0x1F4eF86ccE9b92b65fA2cd96b4C39E9816a4C432";

const wElaAddress = "0x517E9e5d46C1EA8aB6f78677d6114Ef47F71f6c4";

const tokenAddresses = [{
        name : "TTONE", 
        address: "0x629D7c7f744D2EF90bD3E26E9040265cAb860Ef1", 
        path: ["TTONE", "ELA"]
    },{
        name : "TTWO", 
        address: "0x8dB0bCF86f85E90FEAF7b327139BA285515793D2", 
        path: ["TTWO", "TTONE", "ELA"]
    },{
        name : "USDC", 
        address: "0xA06be0F5950781cE28D965E5EFc6996e88a8C141",
        path: ["UDSC", "ELA"]
    },{
        name : "HUSD", 
        address: "0xF9Ca2eA3b1024c0DB31adB224B407441bECC18BB",
        path: ["HUSD", "USDC", "ELA"],
    },{
        name : "ETH", 
        address: "0x802c3e839E4fDb10aF583E3E759239ec7703501e",
        path: ["ETH", "ELA"]
    },{
        name : "HT", 
        address: "0xeceefC50f9aAcF0795586Ed90a8b9E24f55Ce3F3",
        path: ["HT", "ELA"]
    },{
        name : "GLIDE", 
        address: "0x3983cD2787A1e63c6Fb189CE0C06B9B44E382c31",
        path: ["GLIDE", "ELA"]
    }
];

const lpContracts = [{
        name: "TTONE-TTWO",
        address: "0x9817FCCefc730120950712abc7279667d2d0Ff3A"
    },{
        name: "TTONE-ELA",
        address: "0x9E0B4F1E95289951D9f960067d54cB3ECB2Cca61"
    },{
        name: "GLIDE-ELA",
        address: "0xE4225468888E06A870B1Ec85F4E7761C9032DD50"
    },{
        name: "USDC-ELA",
        address: "0x6860bd8a7CEDEC7CD79480EdFD8583Aa8Fac5a2E"
    }, {
        name: "GLIDE-USDC",
        address: "0xC556F765766151823258545b2b402796C16916D4"
    }, {
        name: "ETH-ELA",
        address: "0xF660A325594999835C2506b0Ec79051D1F7A6EF1"
    }, {
        name: "HT-ELA",
        address: "0x48056B7bB775eC158Ba6e379C017fc9720d3Db11"
    },{
        name: "HUSD-USDC",
        address: "0xc8596312A0e6eaEaBB2D8c2c02e6Ec2cd426b731"
    }
];

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
cron.schedule("*/30 * * * * *", async function() {
    console.log("START");

    //Get block number to check is network working
    const blockNumber = await customHttpProvider.getBlockNumber();
    console.log("Current block number: " + blockNumber);

    // Get wallet address to check is correct wallet connected
    const walletAddress = await mnemonicWallet.getAddress();
    console.log("Wallet address: " + walletAddress);
    
    await Promise.all(lpContracts.map(async (element) => {
        // Get balance for lp test token one - test token two before remove liquidity
        const concretePairInstance = new ethers.Contract(element.address, IERC20ContractAbi, signer);
        var balanceBeforeRemoveLiquidity;
        try {
            balanceBeforeRemoveLiquidity = await concretePairInstance.balanceOf(feeDistributorContractAddress);
            console.log(element.name + ": balanceBeforeRemoveLiquidity: " + balanceBeforeRemoveLiquidity);
        } catch(error) {
            console.log(element.name + ": " + error);
        }

        // Remove liquidity from feeDistributor contract
        try {
            if (balanceBeforeRemoveLiquidity > 0) {
                await feeDistibutorContract.removeLiquidity(routerContractAddress, element.address);
            }
        } catch(error) {
            console.log(error);
        }

        // Get balance for lp test token one - test token two after remove liquidity
        var balanceAfterRemoveLiquidity;
        try {
            balanceAfterRemoveLiquidity = await concretePairInstance.balanceOf(feeDistributorContractAddress);
            console.log(element.name + ": balanceAfterRemoveLiquidity: " + balanceAfterRemoveLiquidity);
        } catch(error) {
            console.log(element.name + ": " + error);
        }
    }));
    
    await Promise.all(tokenAddresses.map(async (element)=>{
        function getAddressForToken(tokenName) {
            var returnAddress = null;
            tokenAddresses.forEach(element=> {
                if (element.name === tokenName) {
                    returnAddress = element.address;
                    return;
                }
            });
            return returnAddress;
        }

        // Get balance for test token one before sell tokens
        const tokenInstance = new ethers.Contract(element.address, IERC20ContractAbi, signer);
        var balanceBeforeSellTokens;
        try {
            balanceBeforeSellTokens = await tokenInstance.balanceOf(feeDistributorContractAddress);
            console.log(element.name + ": balanceBeforeSellTokens: " + balanceBeforeSellTokens);
        } catch(error) {
            console.log(element.name + ": " + error);
        }

        var path = [];
        for(var counter = 0; counter < element.path.length; counter++) {
            if (counter == 0) {
                path.push(element.address);
            } else {
                if (element.path[counter] !== "ELA") {
                    const elementAddress = getAddressForToken(element.path[counter]);
                    if (elementAddress !== null) {
                        path.push(elementAddress);
                    } else {
                        console.log("ERROR: " + element.path[counter] + " does not exist !!!");
                        continue;
                    }
                } else {
                    path.push(wElaAddress);
                }
            }
        }

        // Sell tokens on fee distributor contract
        try {
            if (balanceBeforeSellTokens > 0) {
                await feeDistibutorContract.sellTokens(routerContractAddress,
                    element.address,
                    wElaAddress,
                    path
                );
            }
        } catch(error) {
            console.log(element.name + ": " + error);
        }

        // Get balance for test token one after sell tokens
        var balanceAfterSellTokens;
        try {
            balanceAfterSellTokens = await tokenInstance.balanceOf(feeDistributorContractAddress);
            console.log(element.name + ": balanceAfterSellTokens: " + balanceAfterSellTokens);
        } catch(error) {
            console.log(element.name + ": " + error);
        }
    }));
    
    // wEla balance for feeDistributor contract
    const wElaInstance = new ethers.Contract(wElaAddress, IERC20ContractAbi, signer);
    var balanceBeforeDistributeFee;
    try {
        balanceBeforeDistributeFee = await wElaInstance.balanceOf(feeDistributorContractAddress);
        console.log("FeeDistributor: BalanceBeforeDistributeFee: " + balanceBeforeDistributeFee);
    } catch(error) {
        console.log(error);
    }
    // wEla balance for swapRewardsChef contract after distribute fees
    try {
        balanceBeforeDistributeFee = await wElaInstance.balanceOf(swapRewardsChefAddress);
        console.log("SwapRewardsChef: BalanceBeforeDistributeFee: " + balanceBeforeDistributeFee);
    } catch(error) {
        console.log(error);
    }

    //distribute fee on fee distributor
    try {
        await feeDistibutorContract.distributeFees();
    } catch(error) {
        console.log(error);
    }

     // wEla balance for feeDistributor contract
    var balanceAfterDistributeFee;
    try {
        balanceAfterDistributeFee = await wElaInstance.balanceOf(feeDistributorContractAddress);
        console.log("FeeDistributor: BalanceAfterDistributeFee: " + balanceAfterDistributeFee);
    } catch(error) {
        console.log(error);
    }
    // wEla balance for swapRewardsChef contract after distribute fees
    try {
        balanceAfterDistributeFee = await wElaInstance.balanceOf(swapRewardsChefAddress);
        console.log("SwapRewardsChef: BalanceAfterDistributeFee: " + balanceAfterDistributeFee);
    } catch(error) {
        console.log(error);
    }

    console.log("END");
});
  
app.listen(3000);
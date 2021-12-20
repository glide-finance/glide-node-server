// Importing required libraries
const cron = require("node-cron");
const express = require("express");
const ethers = require("ethers");
const fs = require("fs");
const secrets = require("./secrets.json");
const request = require("request")
const axios = require("axios");

const mnemonic = secrets.mnemonic;
  
const app = express(); // Initializing app

const url = "http://localhost:8545";
//const url = "https://api.elastos.io/eth";

const feeDistributorContractAddress = "0xc4B300C91045cd0c62aB3c712f6c55DD2aDd5708";
const routerContractAddress = "0xfFa69bD192D214D6FC8DBA007BD92Ee7Dc4D3e18";
const swapRewardsChefAddress = "0x1F4eF86ccE9b92b65fA2cd96b4C39E9816a4C432";
const masterChefAddress = "0x7F5489f77Bb8515DE4e0582B60Eb63A7D9959821";
const wElaAddress = "0x517E9e5d46C1EA8aB6f78677d6114Ef47F71f6c4";
const glideAddress = "0xd39eC832FF1CaaFAb2729c76dDeac967ABcA8F27";
const phantzGlideStakeAddress = "0x72d1C39DC21bE28781ec7D96E4933fda26698574";

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
const feeDistibutorContractABI = JSON.stringify(feeDistibutorContractParse);
const feeDistibutorContract = new ethers.Contract(feeDistributorContractAddress, feeDistibutorContractABI, signer);

const IERC20ContractParse = JSON.parse(fs.readFileSync('./contracts/IERC20.json', 'utf8'));
const IERC20ContractAbi = JSON.stringify(IERC20ContractParse);

const masterChefContractParse = JSON.parse(fs.readFileSync('./contracts/MasterChef.json', 'utf8'));
const masterChefContractABI = JSON.stringify(masterChefContractParse);
const masterChefContract = new ethers.Contract(masterChefAddress, masterChefContractABI, signer);

const phantzGlideStakeParse = JSON.parse(fs.readFileSync('./contracts/PhantzGlideStake.json', 'utf8'));
const phantzGlideStakeABI = JSON.stringify(phantzGlideStakeParse);
const phantzGlideContract = new ethers.Contract(phantzGlideStakeAddress, phantzGlideStakeABI, signer);

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
  
// Phantz - Glide
cron.schedule("*/30 * * * * *", async function() {
    console.log("START PHANTZ - GLIDE");

    const phantzCollectionUrl = "https://assist.trinity-feeds.app/sticker/api/v1/query?creator=0x44016ed8638f5B517a5beC7a722A56d1DEBefef7";

    function requestPhantzHolders(url) {
        return new Promise(function (resolve, reject) {
            try {
                request(url, function (error, res, body) {
                    if (!error && res.statusCode == 200) {
                        resolve(body);
                    } else {
                        reject(error);
                    }
                });
            }
            catch(e) {
                console.error(e);
            }
        });
    }

    async function calculateStakingAPR() {
        var masterChefGlideAmount = 0;
        const glideTokenInstance = new ethers.Contract(glideAddress, IERC20ContractAbi, signer);
        try {
            masterChefGlideAmount = await glideTokenInstance.balanceOf(masterChefAddress);
            console.log("masterChefGlideAmount: " + masterChefGlideAmount);
        } catch(error) {
            console.log("masterChefGlideAmount-error" + ": " + error);
            return 0;
        }

        // This value for token distributed to staking pools per year currently is hardcoded, change that to real calculate
        if (masterChefGlideAmount == 0)
            return 0;
        return 3074760 / ethers.utils.formatEther(masterChefGlideAmount);
    }

    async function getLastUpdatedBlock() {
        try {
            const lastUpdatedBlock = await phantzGlideContract.lastUpdatedBlock();
            return lastUpdatedBlock;
        } catch(error) {
            console.log("lastUpdatedBlock-error" + ": " + error);
            return 0;
        }
    }
      
    // Get phantz holders
    let fullResultString = await requestPhantzHolders(phantzCollectionUrl);
    let fullResult = JSON.parse(fullResultString);
    const phantzHolders = new Map();
    try {
        let resultData = fullResult["data"]["result"];
        for(let counter = 0; counter < resultData.length; counter++) {
            let item = resultData[counter];
            let nftHolder = item["holder"];
            if (phantzHolders.has(nftHolder)) {
                let nftHolderCount = phantzHolders.get(nftHolder);
                phantzHolders.set(nftHolder, nftHolderCount + 1);
            } else {
                phantzHolders.set(nftHolder, 1);
            }
        }
 
        for (const [key, value] of phantzHolders) {
            console.log(key + ' = ' + value)
        }

        const stakingAPR = await calculateStakingAPR();
        console.log(stakingAPR);

        const lastUpdatedBlock = await getLastUpdatedBlock();
        console.log("lastUpdateBlock:"+lastUpdatedBlock);

        const currentBlock = await customHttpProvider.getBlockNumber();
        console.log("currentBlock:"+currentBlock);

        const glideTokenInstance = new ethers.Contract(glideAddress, IERC20ContractAbi, signer);
        const walletAddress = await mnemonicWallet.getAddress();

        const glideBalanceForMainAccount = await glideTokenInstance.balanceOf(walletAddress);
        console.log("glideBalanceForMainAccount: " + glideBalanceForMainAccount.toString());

        for (const [key, value] of phantzHolders) {
            const url = "https://api.glidefinance.io/subgraphs/name/glide/glide-staking";
            const headers = {
                'Content-Type': 'application/json',
            }

            // get manual glide stake amount
            let body = {
                query: `
                    query {
                        manualGlideStakings(first: 5, where: {id: "`+ key.toLowerCase() +`"}) {
                            id
                            stakeAmount
                        }
                    }
                `
            }
            let response = await axios.post(url, body, { headers: headers })
            console.log(JSON.stringify(response.data));
            let manualGlideStaking = response.data.data.manualGlideStakings;

            //get auto glide stake amount
            /*
            body = {
                query: `
                    query {
                        autoGlideStakings(first: 5, where: {id: "`+ key.toLowerCase() +`"}) {
                            id
                            stakeAmount
                        }
                    }
                `
            }
            response = await axios.post(url, body, { headers: headers })
            console.log(JSON.stringify(response.data))
            */

            if (manualGlideStaking.length > 0) {
                let manualGlideStakingObj = manualGlideStaking[0];
                let manualGlideStakeAmount = ethers.BigNumber.from(manualGlideStakingObj.stakeAmount);
                if (manualGlideStakeAmount > 0) {
                    // total projectect glide per year
                    let totalProjectedGlidePerYear = manualGlideStakeAmount.mul(ethers.BigNumber.from(Math.round(stakingAPR * 10000)));
                    totalProjectedGlidePerYear = totalProjectedGlidePerYear.div(10000);
                    console.log(totalProjectedGlidePerYear.toString());

                    // weighting factor per phantz holding 
                    let weightingFactor = 0;
                    switch(value) {
                        case 1:
                            weightingFactor = 0.07 * 10000;
                            break;
                        case 2:
                            weightingFactor = 0.14 * 10000;
                            break;
                        default:
                            weightingFactor = 0.2822 * 10000;
                    }

                    // calculate bonus glide per year
                    let bonusGlide = totalProjectedGlidePerYear.mul(ethers.BigNumber.from(Math.round(weightingFactor))).div(10000);
                    console.log(bonusGlide.toString());

                    // glide per block
                    let glidePerBlock = bonusGlide.div(365).div(24).div(60).div(12);
                    console.log(glidePerBlock.toString());

                    // add glide reward
                    //let glideReward = glidePerBlock.mul(currentBlock - lastUpdatedBlock);
                    let glideReward = glidePerBlock;
                    console.log(glideReward.toString());

                    // send glide reward
                    const tokenAllowance = await glideTokenInstance.connect(mnemonicWallet).allowance(walletAddress, phantzGlideStakeAddress);
                    if (tokenAllowance.lt(glideReward)) {
                        let allowanceLocal = glideReward.sub(tokenAllowance);
                        let tx = await glideTokenInstance
                            .connect(mnemonicWallet)
                            .increaseAllowance(phantzGlideStakeAddress, allowanceLocal.toString());
                        await tx.wait();
                    }

                    // add glide reward
                    let tx = await phantzGlideContract.connect(mnemonicWallet)["addGlideReward(address,uint256)"](
                        key, 
                        glideReward.toString(),
                        {gasLimit: 1000000}
                    );
                    await tx.wait();
                }
            }
        }

        let tx = await phantzGlideContract.connect(mnemonicWallet)["setLastUpdateBlock(uint256)"](
            currentBlock, 
            {gasLimit: 1000000}
        );
        await tx.wait();
    } catch(e) {
        console.error(e);
    }
    console.log("END PHANTZ - GLIDE");
});

app.listen(3000);
// Importing required libraries
const cron = require("node-cron");
const express = require("express");
const ethers = require("ethers");
const fs = require("fs");
const secrets = require("./secrets.json");

const mnemonic = secrets.mnemonic;
const app = express(); // Initializing app

//const url = "http://localhost:8545";
//const url = "https://api.elastos.io/eth";
const url = "https://escrpc.elaphant.app/";

const feeDistributorContractAddress = "0x87CC7290897cbe50Eb38e0C299B26798f87C8D5F";
const routerContractAddress = "0xec2f2b94465Ee0a7436beB4E38FC8Cf631ECf7DF";
const swapRewardsChefAddress = "0x80f2cF7059336b44a75F00451B81f8d742DD2b94";

const wElaAddress = "0x517E9e5d46C1EA8aB6f78677d6114Ef47F71f6c4";

const tokenAddresses = [
  {
    name: "USDC",
    address: "0xA06be0F5950781cE28D965E5EFc6996e88a8C141",
    path: ["UDSC", "ELA"],
  },
  {
    name: "HUSD",
    address: "0xF9Ca2eA3b1024c0DB31adB224B407441bECC18BB",
    path: ["HUSD", "USDC", "ELA"],
  },
  {
    name: "ETH",
    address: "0x802c3e839E4fDb10aF583E3E759239ec7703501e",
    path: ["ETH", "ELA"],
  },
  {
    name: "HT",
    address: "0xeceefC50f9aAcF0795586Ed90a8b9E24f55Ce3F3",
    path: ["HT", "ELA"],
  },
  {
    name: "GLIDE",
    address: "0x3983cD2787A1e63c6Fb189CE0C06B9B44E382c31", // dummy
    path: ["GLIDE", "ELA"],
  },
  {
    name: "FILDA",
    address: "0xB9Ae03e3320235D3a8AE537f87FF8529b445B590",
    path: ["FILDA", "ELA"],
  },
  {
    name: "GOLD",
    address: "0xaA9691BcE68ee83De7B518DfCBBfb62C04B1C0BA",
    path: ["GOLD", "ELA"],
  },
];

const lpContracts = [
  {
    name: "GLIDE-ELA",
    address: "0xbeeAAb15628329C2C89Bc9F403d34b31fbCb3085",
  },
  {
    name: "USDC-ELA",
    address: "0x6077b7990d3d0dfB5A50f1D207f67ac5955B999d",
  },
  {
    name: "ETH-ELA",
    address: "0xa86883c2405f4557D2242Df47b220C54d0D611e4",
  },
  {
    name: "HT-ELA",
    address: "0xC6734784EE598855200dABC8D8B1fA1F11f14C90",
  },
  {
    name: "HUSD-USDC",
    address: "0xB0917F2595A2c4C56498f6da2C52690a3EF558D2",
  },
  {
    name: "FILDA-ELA",
    address: "0x5B0Cf7D3b2D6885e1173674f4649B914e7A66B96",
  },
  {
    name: "GOLD-ELA",
    address: "0xC9D4ab43d81466F336d37B9e10acE1C9AE994BCC",
  },
];

const customHttpProvider = new ethers.providers.JsonRpcProvider(url);
const wallet = ethers.Wallet.fromMnemonic(mnemonic).connect(customHttpProvider);
//const signer = ethers.Wallet.fromMnemonic(mnemonic).connect(customHttpProvider);
const signer = customHttpProvider.getSigner();
//console.log(signer)

const feeDistibutorContractParse = JSON.parse(fs.readFileSync("./contracts/FeeDistributor.json", "utf8"));
const feeDistibutorContractABI = JSON.stringify(feeDistibutorContractParse.abi);

const IERC20ContractParse = JSON.parse(fs.readFileSync("./contracts/IERC20.json", "utf8"));
const IERC20ContractAbi = JSON.stringify(IERC20ContractParse.abi);

const feeDistibutorContract = new ethers.Contract(feeDistributorContractAddress, feeDistibutorContractABI, wallet);

// Creating a cron job which runs on every 10 second - */10 * * * * *
// Creating a cron job which runs on every 6 hour - 0 */6 * * *

//cron.schedule("*/55 * * * * *", async function() {
cron.schedule("0 */4 * * *", async function () {
  console.log("START");

  //Get block number to check is network working
  const blockNumber = await customHttpProvider.getBlockNumber();
  console.log("Current block number: " + blockNumber);

  // Get wallet address to check is correct wallet connected
  const walletAddress = await wallet.getAddress();
  console.log("Wallet address: " + walletAddress);

  await Promise.all(
    lpContracts.map(async (element) => {
      // Get balance for lp test token one - test token two before remove liquidity
      const concretePairInstance = new ethers.Contract(element.address, IERC20ContractAbi, wallet);
      var balanceBeforeRemoveLiquidity;
      try {
        balanceBeforeRemoveLiquidity = await concretePairInstance.balanceOf(feeDistributorContractAddress);
        console.log(element.name + ": balanceBeforeRemoveLiquidity: " + balanceBeforeRemoveLiquidity);
      } catch (error) {
        console.log(element.name + ": " + error);
      }

      // Remove liquidity from feeDistributor contract
      try {
        if (balanceBeforeRemoveLiquidity > 0) {
          await feeDistibutorContract.removeLiquidity(routerContractAddress, element.address);
        }
      } catch (error) {
        console.log(error);
      }

      // Get balance for lp test token one - test token two after remove liquidity
      var balanceAfterRemoveLiquidity;
      try {
        balanceAfterRemoveLiquidity = await concretePairInstance.balanceOf(feeDistributorContractAddress);
        console.log(element.name + ": balanceAfterRemoveLiquidity: " + balanceAfterRemoveLiquidity);
      } catch (error) {
        console.log(element.name + ": " + error);
      }
    })
  );

  await Promise.all(
    tokenAddresses.map(async (element) => {
      function getAddressForToken(tokenName) {
        var returnAddress = null;
        tokenAddresses.forEach((element) => {
          if (element.name === tokenName) {
            returnAddress = element.address;
            return;
          }
        });
        return returnAddress;
      }

      // Get balance for test token one before sell tokens
      const tokenInstance = new ethers.Contract(element.address, IERC20ContractAbi, wallet);
      var balanceBeforeSellTokens;
      try {
        balanceBeforeSellTokens = await tokenInstance.balanceOf(feeDistributorContractAddress);
        console.log(element.name + ": balanceBeforeSellTokens: " + balanceBeforeSellTokens);
      } catch (error) {
        console.log(element.name + ": " + error);
      }

      var path = [];
      for (var counter = 0; counter < element.path.length; counter++) {
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
          await feeDistibutorContract.sellTokens(routerContractAddress, element.address, wElaAddress, path);
        }
      } catch (error) {
        console.log(element.name + ": " + error);
      }

      // Get balance for test token one after sell tokens
      var balanceAfterSellTokens;
      try {
        balanceAfterSellTokens = await tokenInstance.balanceOf(feeDistributorContractAddress);
        console.log(element.name + ": balanceAfterSellTokens: " + balanceAfterSellTokens);
      } catch (error) {
        console.log(element.name + ": " + error);
      }
    })
  );

  // wEla balance for feeDistributor contract
  const wElaInstance = new ethers.Contract(wElaAddress, IERC20ContractAbi, wallet);
  var balanceBeforeDistributeFee;
  try {
    balanceBeforeDistributeFee = await wElaInstance.balanceOf(feeDistributorContractAddress);
    console.log("FeeDistributor: BalanceBeforeDistributeFee: " + balanceBeforeDistributeFee);
  } catch (error) {
    console.log(error);
  }
  // wEla balance for swapRewardsChef contract after distribute fees
  try {
    balanceBeforeDistributeFee = await wElaInstance.balanceOf(swapRewardsChefAddress);
    console.log("SwapRewardsChef: BalanceBeforeDistributeFee: " + balanceBeforeDistributeFee);
  } catch (error) {
    console.log(error);
  }

  //distribute fee on fee distributor
  try {
    await feeDistibutorContract.distributeFees();
  } catch (error) {
    console.log(error);
  }

  // wEla balance for feeDistributor contract
  var balanceAfterDistributeFee;
  try {
    balanceAfterDistributeFee = await wElaInstance.balanceOf(feeDistributorContractAddress);
    console.log("FeeDistributor: BalanceAfterDistributeFee: " + balanceAfterDistributeFee);
  } catch (error) {
    console.log(error);
  }
  // wEla balance for swapRewardsChef contract after distribute fees
  try {
    balanceAfterDistributeFee = await wElaInstance.balanceOf(swapRewardsChefAddress);
    console.log("SwapRewardsChef: BalanceAfterDistributeFee: " + balanceAfterDistributeFee);
  } catch (error) {
    console.log(error);
  }

  console.log("END");
});

app.listen(3000);

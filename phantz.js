// Importing required libraries
const cron = require("node-cron");
const express = require("express");
const ethers = require("ethers");
const fs = require("fs");
const secrets = require("./secrets.json");
const request = require("request");
const axios = require("axios");

const mnemonic = secrets.mnemonic;

// const app = express(); // Initializing app

// const url = "http://localhost:8545";
// const url = "https://api.elastos.io/eth";
const url = "https://escrpc.elaphant.app";

const masterChefAddress = "0x7F5489f77Bb8515DE4e0582B60Eb63A7D9959821";
const glideVaultAddress = "0xBe224bb2EFe1aE7437Ab428557d3054E63033dA9";
const glideAddress = "0xd39eC832FF1CaaFAb2729c76dDeac967ABcA8F27";
const phantzGlideStakeAddressOld = "0xbe080A1Fee90c12fC7F308590DC56929E407aA6E";
const phantzGlideStakeAddressNew = "0x6be4661405096e1dEEC1eD03250bB9d38aeA0804";

const customHttpProvider = new ethers.providers.JsonRpcProvider(url);
const mnemonicWallet = ethers.Wallet.fromMnemonic(mnemonic).connect(customHttpProvider);
const signer = customHttpProvider.getSigner();

const IERC20ContractParse = JSON.parse(fs.readFileSync("./contracts/IERC20.json", "utf8"));
const IERC20ContractAbi = JSON.stringify(IERC20ContractParse);

const masterChefContractParse = JSON.parse(fs.readFileSync("./contracts/MasterChef.json", "utf8"));
const masterChefContractABI = JSON.stringify(masterChefContractParse);
const masterChefContract = new ethers.Contract(masterChefAddress, masterChefContractABI, mnemonicWallet);

const glideVaultContractParse = JSON.parse(fs.readFileSync("./contracts/GlideVault.json", "utf8"));
const glideVaultContractABI = JSON.stringify(glideVaultContractParse);
const glideVaultContract = new ethers.Contract(glideVaultAddress, glideVaultContractABI, mnemonicWallet);

const phantzGlideStakeParse = JSON.parse(fs.readFileSync("./contracts/PhantzGlideStake.json", "utf8"));
const phantzGlideStakeABI = JSON.stringify(phantzGlideStakeParse);
// const phantzGlideContractOld = new ethers.Contract(phantzGlideStakeAddressOld, phantzGlideStakeABI, mnemonicWallet);
const phantzGlideContractNew = new ethers.Contract(phantzGlideStakeAddressNew, phantzGlideStakeABI, mnemonicWallet);

// Phantz - Glide
// cron.schedule("*/30 * * * * *", async function () {
// async function manualRun() {
cron.schedule("0 */2 * * *", async function () {
  console.log("START PHANTZ - GLIDE");

  // const phantzCollectionUrl =
  //   "https://assist.trinity-feeds.app/sticker/api/v1/query?creator=0x44016ed8638f5B517a5beC7a722A56d1DEBefef7";
  const phantzCollectionUrl = "https://ela.city/api/nftitems/fetchTokens";
  const options = {
    collectionAddresses: ["0xfdde60866508263e30c769e8592bb0f8c3274ba7"],
    type: "single",
  };

  function requestPhantzHolders(url) {
    return new Promise(function (resolve, reject) {
      try {
        request.post(
          {
            headers: {
              "content-type": "application/json",
            },
            url: phantzCollectionUrl,
            body: JSON.stringify(options),
          },
          function (error, res, body) {
            if (!error && res.statusCode == 200) {
              resolve(body);
            } else {
              reject(error);
            }
          }
        );
        // request(url, function (error, res, body) {
        //   if (!error && res.statusCode == 200) {
        //     resolve(body);
        //   } else {
        //     reject(error);
        //   }
        // });
      } catch (e) {
        console.error(e);
      }
    });
  }

  async function calculateGlidePerYear() {
    try {
      const blockPerYear = 12 * 60 * 24 * 365; // 12 blocks per minute (one block per 5 seconds) * 60 minutes * 24 hours * 365
      const startBlock = await masterChefContract.startBlock();
      const bonusPeriod = await masterChefContract.bonusPeriod();
      const reductionPeriod = await masterChefContract.reductionPeriod();
      const startGlidePerBlock = await masterChefContract.glidePerBlock();
      const currentBlock = ethers.BigNumber.from(await customHttpProvider.getBlockNumber());

      // console.log(startBlock.toString());
      // console.log(bonusPeriod.toString());
      // console.log(reductionPeriod.toString());
      // console.log(startGlidePerBlock.toString());
      // console.log(currentBlock.toString());

      let phase = 0;
      let counterBlock = startBlock.add(bonusPeriod);
      let counterCurrentBlock = currentBlock;
      let counterGlidePerBlock = startGlidePerBlock;
      let glideSumPerYear = ethers.BigNumber.from("0");

      while (true) {
        // if it is last phase on year and should be finish calculation
        if (counterBlock.gte(currentBlock.add(blockPerYear))) {
          const blockDifference = counterBlock.sub(reductionPeriod);
          glideSumPerYear = glideSumPerYear.add(
            counterGlidePerBlock.mul(currentBlock.add(blockPerYear).sub(blockDifference))
          );
          break;
        } else {
          if (counterBlock.gt(counterCurrentBlock)) {
            // console.log(counterBlock.toString());
            // console.log(counterCurrentBlock.toString());
            // console.log(counterGlidePerBlock.toString());
            // calculate glide sum per year
            glideSumPerYear = glideSumPerYear.add(counterGlidePerBlock.mul(counterBlock.sub(counterCurrentBlock)));
          }

          // updates
          if (phase == 0) {
            counterGlidePerBlock = counterGlidePerBlock
              .mul(ethers.BigNumber.from("75"))
              .div(ethers.BigNumber.from("100"));
          } else {
            counterGlidePerBlock = counterGlidePerBlock
              .mul(ethers.BigNumber.from("85"))
              .div(ethers.BigNumber.from("100"));
          }
          phase++;
          if (counterBlock.gte(counterCurrentBlock)) {
            counterCurrentBlock = counterBlock;
          }
          counterBlock = counterBlock.add(reductionPeriod);
        }
      }

      const tokenDistributedToStakingPools = ethers.utils.formatEther(
        glideSumPerYear
          .mul(ethers.BigNumber.from("65"))
          .div(ethers.BigNumber.from("100"))
          .mul(ethers.BigNumber.from("25"))
          .div(ethers.BigNumber.from("100"))
      );
      return Math.trunc(tokenDistributedToStakingPools);
    } catch (e) {
      console.error(e);
    }
  }

  async function calculateStakingAPR(tokenDistributedToStakingPools) {
    var masterChefGlideAmount = 0;
    const glideTokenInstance = new ethers.Contract(glideAddress, IERC20ContractAbi, mnemonicWallet);
    try {
      masterChefGlideAmount = await glideTokenInstance.balanceOf(masterChefAddress);
      console.log("masterChefGlideAmount: " + masterChefGlideAmount);
    } catch (error) {
      console.log("masterChefGlideAmount-error" + ": " + error);
      return 0;
    }

    if (masterChefGlideAmount == 0) return 0;

    // This value for token distributed to staking pools per year currently is hardcoded, change that to real calculate
    return tokenDistributedToStakingPools / ethers.utils.formatEther(masterChefGlideAmount);
  }

  async function calculateVaultBalance(address, pricePerFullShare) {
    var glideVaultAmount = 0;

    try {
      const userInfo = await glideVaultContract.userInfo(address);
      const shares = userInfo[0];
      glideVaultAmount = shares.mul(pricePerFullShare).div(ethers.BigNumber.from(10).pow(18));
      // console.log(address);
      console.log("glideVaultAmount: " + glideVaultAmount);
    } catch (error) {
      console.log("glideVaultAmount-error" + ": " + error);
      return 0;
    }

    if (glideVaultAmount == 0) return 0;
    return glideVaultAmount;
  }

  async function getLastUpdatedBlock() {
    try {
      const lastUpdatedBlock = await phantzGlideContractNew.lastUpdatedBlock();
      return lastUpdatedBlock;
    } catch (error) {
      console.log("lastUpdatedBlock-error" + ": " + error);
      return 0;
    }
  }

  // const tokenDistributedToStakingPools = await calculateGlidePerYear();
  const tokenDistributedToStakingPools = 2307649; // hard coded because lazy
  console.log("GlideSumPerYear: " + tokenDistributedToStakingPools);

  // Get phantz holders
  let fullResultString = await requestPhantzHolders(phantzCollectionUrl);
  let fullResult = JSON.parse(fullResultString);

  // const filterPhantz = fullResult.data.tokens.filter((item) => {
  //   // console.log(item.contractAddress === "0xfdde60866508263e30c769e8592bb0f8c3274ba7");
  //   return item.contractAddress === "0xfdde60866508263e30c769e8592bb0f8c3274ba7";
  // });

  const phantzHolders = new Map();
  try {
    let resultData = fullResult["data"]["tokens"];
    for (let counter = 0; counter < resultData.length; counter++) {
      let item = resultData[counter];
      let nftHolder = item["owner"] && item["owner"]["address"];
      if (phantzHolders.has(nftHolder) & (nftHolder !== null)) {
        let nftHolderCount = phantzHolders.get(nftHolder);
        phantzHolders.set(nftHolder, nftHolderCount + 1);
      } else if (nftHolder !== null) {
        phantzHolders.set(nftHolder, 1);
      }
    }

    for (const [key, value] of phantzHolders) {
      console.log(key + " = " + value);
    }

    const stakingAPR = await calculateStakingAPR(tokenDistributedToStakingPools);
    console.log(stakingAPR);

    const lastUpdatedBlock = await getLastUpdatedBlock();
    console.log("lastUpdateBlock:" + lastUpdatedBlock);

    const currentBlock = await customHttpProvider.getBlockNumber();
    console.log("currentBlock:" + currentBlock);

    const glideTokenInstance = new ethers.Contract(glideAddress, IERC20ContractAbi, mnemonicWallet);
    const walletAddress = await mnemonicWallet.getAddress();
    console.log("wallet address:" + walletAddress);

    const glideBalanceForMainAccount = await glideTokenInstance.balanceOf(walletAddress);
    console.log("glideBalanceForMainAccount: " + glideBalanceForMainAccount.toString());

    const pricePerFullShare = await glideVaultContract.getPricePerFullShare();
    console.log("pricePerFullSHare: " + pricePerFullShare.toString());

    let addressesForSend = [];
    let amountsForSend = [];
    let counter = 0;
    for (const [key, value] of phantzHolders) {
      const url = "https://api.glidefinance.io/subgraphs/name/glide/glide-staking";
      const headers = {
        "Content-Type": "application/json",
      };

      // get manual glide stake amount
      let body = {
        query:
          `query {
          manualGlideStakings(first: 5, where: {id: "` +
          key.toLowerCase() +
          `"}) {
                 id
                 stakeAmount
                }
          }`,
      };
      let response = await axios.post(url, body, { headers: headers });
      console.log(JSON.stringify(response.data));
      let manualGlideStaking = response.data.data.manualGlideStakings;

      let manualGlideStakeAmount = ethers.BigNumber.from(0);
      if (manualGlideStaking.length > 0) {
        let manualGlideStakingObj = manualGlideStaking[0];
        manualGlideStakeAmount = ethers.BigNumber.from(manualGlideStakingObj.stakeAmount);
      }

      let autoGlideStaking = await calculateVaultBalance(key, pricePerFullShare);
      let autoGlideStakeAmount = autoGlideStaking;

      if (manualGlideStakeAmount > 0 || autoGlideStakeAmount > 0) {
        let sumStakeAmount = manualGlideStakeAmount.add(autoGlideStakeAmount);
        console.log("sumStakedAmount", sumStakeAmount.toString());

        // total projectect glide per year
        let totalProjectedGlidePerYear = sumStakeAmount.mul(ethers.BigNumber.from(Math.round(stakingAPR * 10000)));
        totalProjectedGlidePerYear = totalProjectedGlidePerYear.div(10000);
        console.log("totalProjectedGlidePerYear", totalProjectedGlidePerYear.toString());

        // weighting factor per phantz holding
        let weightingFactor = 0;
        switch (value) {
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
        console.log("bonusGlide", bonusGlide.toString());

        // glide per block
        let glidePerBlock = bonusGlide.div(365).div(24).div(60).div(12);
        console.log("glidePerBlock", glidePerBlock.toString());

        // add glide reward
        console.log("minutes since last update", (currentBlock - lastUpdatedBlock) / 12);
        let glideReward = glidePerBlock.mul(currentBlock - lastUpdatedBlock);
        //   let glideReward = glidePerBlock;
        console.log("glideReward", glideReward.toString());

        // send glide reward
        // const tokenAllowance = await glideTokenInstance
        //   .connect(mnemonicWallet)
        //   .allowance(walletAddress, phantzGlideStakeAddress);
        // if (tokenAllowance.lt(glideReward)) {
        //   let allowanceLocal = glideReward.sub(tokenAllowance);
        //   let tx = await glideTokenInstance
        //     .connect(mnemonicWallet)
        //     .increaseAllowance(phantzGlideStakeAddress, allowanceLocal.toString());
        //   await tx.wait();
        // }

        // const balanceOldContract = await phantzGlideContractOld.glideRewards(key);

        // if there is no balance on old PhantzGlideStake contract, then send amount to new one
        // if (balanceOldContract == 0) {
        counter++;
        addressesForSend.push(key.toString());
        amountsForSend.push(glideReward.toString());

        console.log(addressesForSend);

        if (counter > 40) {
          // add glide reward
          let txAddGlideReward = await phantzGlideContractNew
            .connect(mnemonicWallet)
            ["addGlideReward(address[],uint256[])"](addressesForSend, amountsForSend, { gasLimit: 8000000 });
          await txAddGlideReward.wait();

          addressesForSend = [];
          amountsForSend = [];
          counter = 0;
        }
        // } else {
        // add glide reward
        // let tx = await phantzGlideContractOld
        //   .connect(mnemonicWallet)
        //   ["addGlideReward(address,uint256)"](key, glideReward.toString(), { gasLimit: 1000000 });
        // await tx.wait();
        // }
      }
    }

    // add glide reward
    if (addressesForSend.length > 0 && amountsForSend.length > 0) {
      let txAddGlideReward = await phantzGlideContractNew
        .connect(mnemonicWallet)
        ["addGlideReward(address[],uint256[])"](addressesForSend, amountsForSend, { gasLimit: 8000000 });
      await txAddGlideReward.wait();
    }

    let tx = await phantzGlideContractNew
      .connect(mnemonicWallet)
      ["setLastUpdateBlock(uint256)"](currentBlock, { gasLimit: 8000000 });
    await tx.wait();
  } catch (e) {
    console.error(e);
  }
  console.log("END PHANTZ - GLIDE");
});
// }

// manualRun();

// app.listen(2822);

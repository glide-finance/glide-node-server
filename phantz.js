// Importing required libraries
const cron = require("node-cron");
const express = require("express");
const ethers = require("ethers");
const fs = require("fs");
const secrets = require("./secrets.json");
const request = require("request");
const axios = require("axios");

const mnemonic = secrets.mnemonic;

const app = express(); // Initializing app

// const url = "http://localhost:8545";
// const url = "https://api.elastos.io/eth";
const url = "https://escrpc.elaphant.app";

const masterChefAddress = "0x7F5489f77Bb8515DE4e0582B60Eb63A7D9959821";
const wElaAddress = "0x517E9e5d46C1EA8aB6f78677d6114Ef47F71f6c4";
const glideAddress = "0xd39eC832FF1CaaFAb2729c76dDeac967ABcA8F27";
// const phantzGlideStakeAddress = "0x72d1C39DC21bE28781ec7D96E4933fda26698574";
const phantzGlideStakeAddress = "0xd696856d09843C82812e6beb14dCD7B98702dDAd";

const customHttpProvider = new ethers.providers.JsonRpcProvider(url);
const mnemonicWallet = ethers.Wallet.fromMnemonic(mnemonic).connect(customHttpProvider);
const signer = customHttpProvider.getSigner();

const IERC20ContractParse = JSON.parse(fs.readFileSync("./contracts/IERC20.json", "utf8"));
const IERC20ContractAbi = JSON.stringify(IERC20ContractParse);

const masterChefContractParse = JSON.parse(fs.readFileSync("./contracts/MasterChef.json", "utf8"));
const masterChefContractABI = JSON.stringify(masterChefContractParse);
const masterChefContract = new ethers.Contract(masterChefAddress, masterChefContractABI, mnemonicWallet);

const phantzGlideStakeParse = JSON.parse(fs.readFileSync("./contracts/PhantzGlideStake.json", "utf8"));
const phantzGlideStakeABI = JSON.stringify(phantzGlideStakeParse);
const phantzGlideContract = new ethers.Contract(phantzGlideStakeAddress, phantzGlideStakeABI, mnemonicWallet);

// Phantz - Glide
// cron.schedule("*/60 * * * * *", async function () {
cron.schedule("*/12 * * * *", async function () {
  console.log("START PHANTZ - GLIDE");

  const phantzCollectionUrl =
    "https://assist.trinity-feeds.app/sticker/api/v1/query?creator=0x44016ed8638f5B517a5beC7a722A56d1DEBefef7";

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
      } catch (e) {
        console.error(e);
      }
    });
  }

  async function calculateStakingAPR() {
    var masterChefGlideAmount = 0;
    const glideTokenInstance = new ethers.Contract(glideAddress, IERC20ContractAbi, mnemonicWallet);
    try {
      masterChefGlideAmount = await glideTokenInstance.balanceOf(masterChefAddress);
      console.log("masterChefGlideAmount: " + masterChefGlideAmount);
    } catch (error) {
      console.log("masterChefGlideAmount-error" + ": " + error);
      return 0;
    }

    // This value for token distributed to staking pools per year currently is hardcoded, change that to real calculate
    if (masterChefGlideAmount == 0) return 0;
    return 3074760 / ethers.utils.formatEther(masterChefGlideAmount);
  }

  async function getLastUpdatedBlock() {
    try {
      const lastUpdatedBlock = await phantzGlideContract.lastUpdatedBlock();
      return lastUpdatedBlock;
    } catch (error) {
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
    for (let counter = 0; counter < resultData.length; counter++) {
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
      console.log(key + " = " + value);
    }

    const stakingAPR = await calculateStakingAPR();
    console.log(stakingAPR);

    const lastUpdatedBlock = await getLastUpdatedBlock();
    console.log("lastUpdateBlock:" + lastUpdatedBlock);

    const currentBlock = await customHttpProvider.getBlockNumber();
    console.log("currentBlock:" + currentBlock);

    const glideTokenInstance = new ethers.Contract(glideAddress, IERC20ContractAbi, mnemonicWallet);
    const walletAddress = await mnemonicWallet.getAddress();

    const glideBalanceForMainAccount = await glideTokenInstance.balanceOf(walletAddress);
    console.log("glideBalanceForMainAccount: " + glideBalanceForMainAccount.toString());

    for (const [key, value] of phantzHolders) {
      const url = "https://api.glidefinance.io/subgraphs/name/glide/glide-staking";
      const headers = {
        "Content-Type": "application/json",
      };

      // get manual glide stake amount
      let body = {
        query:
          `
                    query {
                        manualGlideStakings(first: 5, where: {id: "` +
          key.toLowerCase() +
          `"}) {
                            id
                            stakeAmount
                        }
                    }
                `,
      };
      let response = await axios.post(url, body, { headers: headers });
      console.log(JSON.stringify(response.data));
      let manualGlideStaking = response.data.data.manualGlideStakings;

      //get auto glide stake amount
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
      console.log(JSON.stringify(response.data));
      let autoGlideStaking = response.data.data.autoGlideStakings;

      let manualGlideStakeAmount = ethers.BigNumber.from(0);
      if (manualGlideStaking.length > 0) {
        let manualGlideStakingObj = manualGlideStaking[0];
        manualGlideStakeAmount = ethers.BigNumber.from(manualGlideStakingObj.stakeAmount);
      }

      let autoGlideStakeAmount = ethers.BigNumber.from(0);
      if (autoGlideStaking.length > 0) {
        let autoGlideStakingObj = autoGlideStaking[0];
        autoGlideStakeAmount = ethers.BigNumber.from(autoGlideStakingObj.stakeAmount);
      }

      if (manualGlideStakeAmount > 0 || autoGlideStakeAmount > 0) {
        let sumStakeAmount = manualGlideStakeAmount.add(autoGlideStakeAmount);
        console.log("sumStakeAmount", sumStakeAmount.toString());

        // total projectect glide per year
        let totalProjectedGlidePerYear = sumStakeAmount.mul(
          ethers.BigNumber.from(Math.round(stakingAPR * 10000))
        );
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
        let bonusGlide = totalProjectedGlidePerYear
          .mul(ethers.BigNumber.from(Math.round(weightingFactor)))
          .div(10000);
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
        const tokenAllowance = await glideTokenInstance
          .connect(mnemonicWallet)
          .allowance(walletAddress, phantzGlideStakeAddress);
        if (tokenAllowance.lt(glideReward)) {
          let allowanceLocal = glideReward.sub(tokenAllowance);
          let tx = await glideTokenInstance
            .connect(mnemonicWallet)
            .increaseAllowance(phantzGlideStakeAddress, allowanceLocal.toString());
          await tx.wait();
        }

        // add glide reward
        let tx = await phantzGlideContract
          .connect(mnemonicWallet)
          ["addGlideReward(address,uint256)"](key, glideReward.toString(), { gasLimit: 1000000 });
        await tx.wait();
      }
    }

    let tx = await phantzGlideContract
      .connect(mnemonicWallet)
      ["setLastUpdateBlock(uint256)"](currentBlock, { gasLimit: 1000000 });
    await tx.wait();
  } catch (e) {
    console.error(e);
  }
  console.log("END PHANTZ - GLIDE");
});

app.listen(3001);

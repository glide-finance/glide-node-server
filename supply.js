const cron = require("node-cron");
const express = require("express");
const ethers = require("ethers");
const request = require("request");
const cors = require("cors");
const fs = require("fs");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.listen(3002);

// Connection URL
const mongoUrl = "mongodb://localhost:27017";
const mongoClient = new MongoClient(mongoUrl);
const dbName = "metrics";
const collectionName = "supply";

const url = "https://escrpc.elaphant.app";

const GLIDE = "0xd39eC832FF1CaaFAb2729c76dDeac967ABcA8F27";
const TEAM = "0xe511F61Ab96818579f995a4Db356caf3e9A00fFf";
const TREASURY = "0xFF998bF6F25e6b3dBdFedBecfC02B1e97a4FDb3c";
const BURN = "0x000000000000000000000000000000000000dEaD";

const customHttpProvider = new ethers.providers.JsonRpcProvider(url);
const IERC20ContractParse = JSON.parse(fs.readFileSync("./contracts/IERC20.json", "utf8"));
const IERC20ContractAbi = JSON.stringify(IERC20ContractParse);
const GlideContract = new ethers.Contract(GLIDE, IERC20ContractAbi, customHttpProvider);

cron.schedule("*/30 * * * * *", async function () {
  const totalSupply = ethers.utils.formatEther(await GlideContract.totalSupply());

  const burnedSupply = ethers.utils.formatEther(await GlideContract.balanceOf(BURN));
  const teamSupply = ethers.utils.formatEther(await GlideContract.balanceOf(TEAM));
  const treasurySupply = ethers.utils.formatEther(await GlideContract.balanceOf(TREASURY));

  // console.log(totalSupply);
  // console.log(burnedSupply);
  // console.log(teamSupply);
  // console.log(treasurySupply);

  const circulatingSupply = totalSupply - burnedSupply - teamSupply - treasurySupply;
  console.log(`Circulating supply is ${circulatingSupply.toFixed()}`);

  mongoClient.connect();
  const mongoDb = mongoClient.db(dbName);
  const mongoCollection = mongoDb.collection(collectionName);

  const entry = await mongoCollection.findOne();
  if (entry !== null) {
    await mongoCollection.updateOne({ _id: entry._id }, { $set: { circulating: circulatingSupply } });
  } else {
    await mongoCollection.insertOne({ circulating: circulatingSupply });
  }
});

app.get("/metrics/circulating-supply", async function (req, res) {
  mongoClient.connect();
  const mongoDb = mongoClient.db(dbName);
  const mongoCollection = mongoDb.collection(collectionName);
  const supply = await mongoCollection.findOne();
  res.json(supply.circulating);
});

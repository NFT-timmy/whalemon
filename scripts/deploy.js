import { network } from "hardhat";

const conn = await network.connect({ network: "tempo" });
const ethers = conn.ethers;

const [deployer] = await ethers.getSigners();
console.log("Deploying with account:", deployer.address);

const whaleNFT = "0x3e12fcb20ad532f653f2907d2ae511364e2ae696";
const oracle = deployer.address;
const pathUSD = "0x20c0000000000000000000000000000000000000";
const whaleCardsAddress = "0xf482221cf5150868956D80cdE00F589dC227D78A";

const BattleArena = await ethers.getContractFactory("BattleArena", deployer);
const battleArena = await BattleArena.deploy(whaleCardsAddress, pathUSD);
await battleArena.waitForDeployment();
console.log("BattleArena deployed to:", await battleArena.getAddress());

const Marketplace = await ethers.getContractFactory("WhalemonMarket", deployer);
const marketplace = await Marketplace.deploy(whaleCardsAddress, pathUSD);
await marketplace.waitForDeployment();
console.log("Marketplace deployed to:", await marketplace.getAddress());
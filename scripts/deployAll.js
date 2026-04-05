// Deploy Whalemon TCG v3 (blacklist + adjustable craft fee split)
// Reuses existing WhalemonRenderer — no need to redeploy it
// Run with: npx hardhat run scripts/deployAll.js --network tempo

import { network } from "hardhat";

const conn = await network.connect({ network: "tempo" });
const ethers = conn.ethers;

const [deployer] = await ethers.getSigners();
console.log("Deploying with account:", deployer.address);

const pathUSD = "0x20c0000000000000000000000000000000000000";
const rendererAddr = "0xECA6D4c4144c4eEC426474a1D6E75e01bDdDb157"; // existing WhalemonRenderer

const COLLECTIONS = [
  { name: "Stable Whales", contract: "0x3e12fcb20ad532f653f2907d2ae511364e2ae696", image: "/collections/stable-whales.png" },
  { name: "TempoNyaw", contract: "0x1Ee82CC5946EdBD88eaf90D6d3c2B5baA4f9966C", image: "/collections/tempo-nyaw.png" },
  { name: "CitcatsNFT", contract: "0x0E3D1e74A49ba5b3F5c1E746d2bcaaB2dee8C62B", image: "/collections/citcats.png" },
];

// 1. Deploy WhaleCards
console.log("\n1. Deploying WhaleCards...");
const WhaleCards = await ethers.getContractFactory("WhaleCards", deployer);
const whaleCards = await WhaleCards.deploy(pathUSD, deployer.address, rendererAddr);
await whaleCards.waitForDeployment();
const whaleCardsAddr = await whaleCards.getAddress();
console.log("   WhaleCards deployed to:", whaleCardsAddr);

for (const col of COLLECTIONS) {
  const tx = await whaleCards.addCollection(col.contract, col.name, col.image);
  await tx.wait();
  console.log(`   Added collection: ${col.name}`);
}

// 2. Deploy BattleArena
console.log("\n2. Deploying BattleArena...");
const BattleArena = await ethers.getContractFactory("BattleArena", deployer);
const battleArena = await BattleArena.deploy(whaleCardsAddr, pathUSD);
await battleArena.waitForDeployment();
const battleArenaAddr = await battleArena.getAddress();
console.log("   BattleArena deployed to:", battleArenaAddr);

// 3. Deploy Marketplace
console.log("\n3. Deploying Marketplace...");
const Marketplace = await ethers.getContractFactory("WhalemonMarket", deployer);
const marketplace = await Marketplace.deploy(whaleCardsAddr, pathUSD);
await marketplace.waitForDeployment();
const marketplaceAddr = await marketplace.getAddress();
console.log("   Marketplace deployed to:", marketplaceAddr);

// 4. Set prize pool target
console.log("\n4. Setting prize pool target...");
const tx = await whaleCards.setPrizePoolTarget(battleArenaAddr);
await tx.wait();
console.log("   Prize pool target set to BattleArena");

// Summary
console.log("\n═══════════════════════════════════════════");
console.log("DEPLOYMENT COMPLETE (v3 — blacklist + adjustable craft fee)");
console.log("═══════════════════════════════════════════");
console.log("WhalemonRenderer:", rendererAddr, "(reused)");
console.log("WhaleCards:      ", whaleCardsAddr);
console.log("BattleArena:     ", battleArenaAddr);
console.log("Marketplace:     ", marketplaceAddr);
console.log("PATHUSD:         ", pathUSD);
console.log("Oracle:          ", deployer.address);
console.log("═══════════════════════════════════════════");
console.log("\nUpdate App.jsx CONTRACTS:");
console.log(`  WHALE_CARDS: "${whaleCardsAddr}",`);
console.log(`  BATTLE_ARENA: "${battleArenaAddr}",`);
console.log(`  MARKETPLACE: "${marketplaceAddr}",`);
console.log("\nUpdate Railway oracle with new WhaleCards address.");

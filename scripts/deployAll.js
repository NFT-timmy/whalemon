// Deploy all Whalemon TCG contracts (fresh start)
// Run with: npx hardhat run scripts/deployAll.js --network tempo

import { network } from "hardhat";

const conn = await network.connect({ network: "tempo" });
const ethers = conn.ethers;

const [deployer] = await ethers.getSigners();
console.log("Deploying with account:", deployer.address);

const pathUSD = "0x20c0000000000000000000000000000000000000";

const COLLECTIONS = [
  {
    name: "Stable Whales",
    contract: "0x3e12fcb20ad532f653f2907d2ae511364e2ae696",
    image: "/collections/stable-whales.png"
  },
  {
    name: "TempoNyaw",
    contract: "0x1Ee82CC5946EdBD88eaf90D6d3c2B5baA4f9966C",
    image: "/collections/tempo-nyaw.png"
  },
  {
    name: "CitcatsNFT",
    contract: "0x0E3D1e74A49ba5b3F5c1E746d2bcaaB2dee8C62B",
    image: "/collections/citcats.png"
  }
];

// ═══════════════════════════════════════════
// 1. Deploy WhalemonRenderer (SVG metadata)
// ═══════════════════════════════════════════
console.log("\n1. Deploying WhalemonRenderer...");
const Renderer = await ethers.getContractFactory("WhalemonRenderer", deployer);
const renderer = await Renderer.deploy();
await renderer.waitForDeployment();
const rendererAddr = await renderer.getAddress();
console.log("   WhalemonRenderer deployed to:", rendererAddr);

// ═══════════════════════════════════════════
// 2. Deploy WhaleCards (multi-collection + crafting)
// ═══════════════════════════════════════════
console.log("\n2. Deploying WhaleCards...");
const WhaleCards = await ethers.getContractFactory("WhaleCards", deployer);
const whaleCards = await WhaleCards.deploy(pathUSD, deployer.address, rendererAddr);
await whaleCards.waitForDeployment();
const whaleCardsAddr = await whaleCards.getAddress();
console.log("   WhaleCards deployed to:", whaleCardsAddr);

// Add collections
for (const col of COLLECTIONS) {
  const tx = await whaleCards.addCollection(col.contract, col.name, col.image);
  await tx.wait();
  console.log(`   Added collection: ${col.name} (${col.contract})`);
}

// ═══════════════════════════════════════════
// 3. Deploy BattleArena
// ═══════════════════════════════════════════
console.log("\n3. Deploying BattleArena...");
const BattleArena = await ethers.getContractFactory("BattleArena", deployer);
const battleArena = await BattleArena.deploy(whaleCardsAddr, pathUSD);
await battleArena.waitForDeployment();
const battleArenaAddr = await battleArena.getAddress();
console.log("   BattleArena deployed to:", battleArenaAddr);

// ═══════════════════════════════════════════
// 4. Deploy Marketplace
// ═══════════════════════════════════════════
console.log("\n4. Deploying Marketplace...");
const Marketplace = await ethers.getContractFactory("WhalemonMarket", deployer);
const marketplace = await Marketplace.deploy(whaleCardsAddr, pathUSD);
await marketplace.waitForDeployment();
const marketplaceAddr = await marketplace.getAddress();
console.log("   Marketplace deployed to:", marketplaceAddr);

// ═══════════════════════════════════════════
// 5. Set prize pool target on WhaleCards
// ═══════════════════════════════════════════
console.log("\n5. Setting prize pool target...");
const tx = await whaleCards.setPrizePoolTarget(battleArenaAddr);
await tx.wait();
console.log("   Prize pool target set to BattleArena");

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════
console.log("\n═══════════════════════════════════════════");
console.log("DEPLOYMENT COMPLETE");
console.log("═══════════════════════════════════════════");
console.log("WhalemonRenderer:", rendererAddr);
console.log("WhaleCards:      ", whaleCardsAddr);
console.log("BattleArena:     ", battleArenaAddr);
console.log("Marketplace:     ", marketplaceAddr);
console.log("PATHUSD:         ", pathUSD);
console.log("Oracle:          ", deployer.address, "(update later)");
console.log("═══════════════════════════════════════════");
console.log("\nUpdate these in your App.jsx CONTRACTS object:");
console.log(`  WHALE_CARDS: "${whaleCardsAddr}",`);
console.log(`  BATTLE_ARENA: "${battleArenaAddr}",`);
console.log(`  MARKETPLACE: "${marketplaceAddr}",`);
console.log("\nUpdate your Railway oracle with the new WhaleCards address.");

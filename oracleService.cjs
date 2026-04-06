// ═══════════════════════════════════════════════════════
// WHALEMON TCG — Oracle Service (v3)
// ═══════════════════════════════════════════════════════
// Listens for CardMinted events on WhaleCards v3 (multi-collection),
// fetches source NFT traits, generates deterministic stats
// with AI abilities, and commits them on-chain.
//
// Usage:
//   ORACLE_PRIVATE_KEY=0x... node oracleService.cjs
//   ORACLE_PRIVATE_KEY=0x... node oracleService.cjs --backfill
// ═══════════════════════════════════════════════════════

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { TEMPO_CONFIG, CONTRACTS, SOURCE_NFT_ABI, WHALE_CARDS_ABI } = require("./config.cjs");
const { generateCard } = require("./statEngine.cjs");

// ─── CONFIGURATION ───

const ORACLE_KEY = process.env.ORACLE_PRIVATE_KEY;
const METADATA_DIR = process.env.METADATA_STORE_PATH || "./metadata";
const BATCH_SIZE = 10;
const RETRY_DELAY = 10000;

if (!ORACLE_KEY) {
  console.error("[Oracle] ERROR: ORACLE_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

if (CONTRACTS.WHALE_CARDS === "0x0000000000000000000000000000000000000000") {
  console.error("[Oracle] ERROR: Set WHALE_CARDS_ADDRESS to the deployed contract address");
  process.exit(1);
}

// ─── PROVIDER & CONTRACTS ───

const provider = new ethers.JsonRpcProvider(TEMPO_CONFIG.rpc);
const oracleWallet = new ethers.Wallet(ORACLE_KEY, provider);
const whaleCards = new ethers.Contract(CONTRACTS.WHALE_CARDS, WHALE_CARDS_ABI, oracleWallet);

// ─── METADATA STORAGE ───

function ensureMetadataDir() {
  if (!fs.existsSync(METADATA_DIR)) {
    fs.mkdirSync(METADATA_DIR, { recursive: true });
  }
}

function saveCardMetadata(tokenId, cardData) {
  ensureMetadataDir();
  const filePath = path.join(METADATA_DIR, `${tokenId}.json`);
  const metadata = {
    tokenId: cardData.tokenId,
    element: cardData.elementName,
    rarity: cardData.rarityName,
    attack: cardData.attack,
    defense: cardData.defense,
    health: cardData.health,
    speed: cardData.speed,
    totalPower: cardData.totalPower,
    image: cardData.imageURI || "",
    ability: {
      name: cardData.ability.name,
      description: cardData.ability.description,
      hash: cardData.ability.hash,
    },
    seed: cardData.seed,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
  console.log(`[Oracle] Metadata saved: ${filePath}`);
}

function isMetadataExists(tokenId) {
  return fs.existsSync(path.join(METADATA_DIR, `${tokenId}.json`));
}

// ─── TRAIT FETCHING ───
// Reads source NFT metadata to extract traits (supports any ERC-721)

async function fetchNFTTraits(sourceTokenId, sourceContractAddr) {
  try {
    const sourceNFT = new ethers.Contract(sourceContractAddr, SOURCE_NFT_ABI, provider);
    const tokenURI = await sourceNFT.tokenURI(sourceTokenId);

    let metadata;

    if (tokenURI.startsWith("data:application/json;base64,")) {
      const base64 = tokenURI.replace("data:application/json;base64,", "");
      metadata = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    } else if (tokenURI.startsWith("data:application/json,")) {
      const json = tokenURI.replace("data:application/json,", "");
      metadata = JSON.parse(decodeURIComponent(json));
    } else if (tokenURI.startsWith("http")) {
      const response = await fetch(tokenURI);
      metadata = await response.json();
    } else if (tokenURI.startsWith("ipfs://")) {
      // Try multiple IPFS gateways
      const hash = tokenURI.replace("ipfs://", "");
      const gateways = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://cf-ipfs.com/ipfs/", "https://nftstorage.link/ipfs/"];
      for (const gw of gateways) {
        try {
          const response = await fetch(gw + hash, { signal: AbortSignal.timeout(10000) });
          if (response.ok) { metadata = await response.json(); break; }
        } catch (_) {}
      }
      if (!metadata) throw new Error("All IPFS gateways failed");
    } else {
      throw new Error(`Unknown tokenURI format: ${tokenURI.substring(0, 50)}...`);
    }

    const traits = {};
    if (metadata.attributes && Array.isArray(metadata.attributes)) {
      for (const attr of metadata.attributes) {
        if (attr.trait_type && attr.value !== undefined) {
          traits[attr.trait_type] = String(attr.value);
        }
      }
    }

    if (Object.keys(traits).length === 0) {
      if (metadata.name) traits["name"] = metadata.name;
      if (metadata.description) traits["description"] = metadata.description;
      if (metadata.image) traits["image_hash"] = ethers.keccak256(ethers.toUtf8Bytes(metadata.image)).substring(0, 18);
    }

    let imageURI = metadata.image || "";
    if (imageURI.startsWith("ipfs://")) {
      imageURI = imageURI.replace("ipfs://", "https://ipfs.io/ipfs/");
    }

    console.log(`[Oracle] Fetched traits for ${sourceContractAddr.slice(0,10)}...#${sourceTokenId}: ${JSON.stringify(traits)}`);
    console.log(`[Oracle] Image URI: ${imageURI || "(none)"}`);
    return { traits, imageURI };
  } catch (err) {
    console.error(`[Oracle] Failed to fetch traits for ${sourceContractAddr}#${sourceTokenId}:`, err.message);
    return {
      traits: {
        id: String(sourceTokenId),
        collection: sourceContractAddr,
        fallback: "true",
      },
      imageURI: "",
    };
  }
}

// ─── STAT COMMITMENT ───

async function commitCardStats(cardData) {
  const { tokenId, attack, defense, health, speed, element, rarity, ability, imageURI } = cardData;

  try {
    const existing = await whaleCards.getCardStats(tokenId);
    if (existing[7]) {
      console.log(`[Oracle] Stats already committed for #${tokenId}, skipping`);
      return null;
    }

    console.log(`[Oracle] Committing stats for Whalemon #${tokenId}...`);
    console.log(`[Oracle]   ATK=${attack} DEF=${defense} HP=${health} SPD=${speed}`);
    console.log(`[Oracle]   Element=${cardData.elementName} Rarity=${cardData.rarityName}`);
    console.log(`[Oracle]   Ability="${ability.name}"`);
    console.log(`[Oracle]   Image: ${imageURI || "(none)"}`);

    const tx = await whaleCards.commitStats(
      tokenId, attack, defense, health, speed,
      element, rarity, ability.hash, imageURI || ""
    );

    console.log(`[Oracle] Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Oracle] Stats committed for #${tokenId} in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);
    return receipt;
  } catch (err) {
    console.error(`[Oracle] Failed to commit stats for #${tokenId}:`, err.message);
    throw err;
  }
}

// ─── FULL PIPELINE ───

async function processCard(tokenId, sourceContractAddr, sourceTokenId) {
  console.log(`\n[Oracle] ══════════════════════════════════════`);
  console.log(`[Oracle] Processing Card #${tokenId} (source: ${sourceContractAddr || "unknown"} token ${sourceTokenId || tokenId})`);
  console.log(`[Oracle] ══════════════════════════════════════`);

  const traitTokenId = sourceTokenId || tokenId;

  if (isMetadataExists(tokenId)) {
    try {
      const existing = await whaleCards.getCardStats(tokenId);
      if (existing[7]) {
        console.log(`[Oracle] #${tokenId} already fully processed, skipping`);
        return null;
      }
    } catch (_) {}
  }

  const { traits, imageURI } = await fetchNFTTraits(traitTokenId, sourceContractAddr);
  const cardData = await generateCard(tokenId, traits);
  cardData.imageURI = imageURI;

  saveCardMetadata(tokenId, cardData);
  await commitCardStats(cardData);

  console.log(`[Oracle] ✓ Whalemon #${tokenId} fully processed!`);
  return cardData;
}

// ─── EVENT LISTENER ───

async function startEventListener() {
  console.log(`[Oracle] Starting event listener on Tempo (chain ${TEMPO_CONFIG.chainId})...`);
  console.log(`[Oracle] WhaleCards: ${CONTRACTS.WHALE_CARDS}`);
  console.log(`[Oracle] Oracle:     ${oracleWallet.address}`);

  try {
    const authorizedOracle = await whaleCards.oracle();
    if (authorizedOracle.toLowerCase() !== oracleWallet.address.toLowerCase()) {
      console.warn(`[Oracle] WARNING: Wallet ${oracleWallet.address} is NOT the authorized oracle (${authorizedOracle})`);
    } else {
      console.log(`[Oracle] ✓ Oracle wallet authorized`);
    }
  } catch (err) {
    console.warn(`[Oracle] Could not verify oracle authorization:`, err.message);
  }

  let pendingQueue = [];
  let processing = false;

  async function processPendingQueue() {
    if (processing || pendingQueue.length === 0) return;
    processing = true;

    const batch = pendingQueue.splice(0, BATCH_SIZE);
    console.log(`[Oracle] Processing batch of ${batch.length} cards...`);

    for (const item of batch) {
      try {
        await processCard(item.cardId, item.sourceContract, item.sourceTokenId);
      } catch (err) {
        console.error(`[Oracle] Error processing #${item.cardId}:`, err.message);
        setTimeout(() => { pendingQueue.push(item); }, RETRY_DELAY);
      }
    }

    processing = false;
    if (pendingQueue.length > 0) setTimeout(processPendingQueue, 1000);
  }

  // Listen for CardMinted events (v3 multi-collection signature)
  whaleCards.on("CardMinted", (owner, cardId, sourceContract, sourceTokenId, event) => {
    const id = Number(cardId);
    console.log(`\n[Oracle] ⚡ CardMinted event: Card #${id} minted by ${owner} from ${sourceContract} token ${Number(sourceTokenId)}`);
    pendingQueue.push({ cardId: id, sourceContract, sourceTokenId: Number(sourceTokenId) });
    processPendingQueue();
  });

  console.log(`[Oracle] ✓ Listening for CardMinted events...`);
  console.log(`[Oracle] Ready. Waiting for mints...\n`);
}

// ─── BACKFILL ───

async function backfillCards() {
  console.log(`[Oracle] Starting backfill scan...`);

  const filter = whaleCards.filters.CardMinted();
  const events = await whaleCards.queryFilter(filter, 0, "latest");
  console.log(`[Oracle] Found ${events.length} total CardMinted events`);

  const uncommitted = [];

  for (const event of events) {
    const tokenId = Number(event.args[1]); // cardId is second indexed arg
    const srcContract = event.args[2] || null; // sourceContract is third indexed arg
    // sourceTokenId is the 4th arg (non-indexed)
    let srcTokenId = tokenId;
    try { srcTokenId = Number(event.args[3]); } catch(_) {}
    try {
      const stats = await whaleCards.getCardStats(tokenId);
      if (!stats[7]) {
        uncommitted.push({ cardId: tokenId, sourceContract: srcContract, sourceTokenId: srcTokenId });
      }
    } catch {
      uncommitted.push({ cardId: tokenId, sourceContract: srcContract, sourceTokenId: srcTokenId });
    }
  }

  console.log(`[Oracle] Found ${uncommitted.length} cards needing stats`);

  for (const item of uncommitted) {
    try {
      await processCard(item.cardId, item.sourceContract, item.sourceTokenId);
    } catch (err) {
      console.error(`[Oracle] Backfill failed for #${item.cardId}:`, err.message);
    }
  }

  console.log(`[Oracle] Backfill complete`);
}

// ─── HEALTH CHECK ───

async function printStatus() {
  try {
    const balance = await provider.getBalance(oracleWallet.address);
    console.log(`[Oracle] Wallet balance: ${ethers.formatEther(balance)} ETH`);
    const network = await provider.getNetwork();
    console.log(`[Oracle] Connected to chain: ${network.chainId}`);
  } catch (err) {
    console.error(`[Oracle] Health check failed:`, err.message);
  }
}

// ─── MAIN ───

async function main() {
  console.log(`
  ╦ ╦╦ ╦╔═╗╦  ╔═╗╔╦╗╔═╗╔╗╔
  ║║║╠═╣╠═╣║  ║╣ ║║║║ ║║║║
  ╚╩╝╩ ╩╩ ╩╩═╝╚═╝╩ ╩╚═╝╝╚╝
  TCG Oracle Service v3.0
  `);

  await printStatus();

  const args = process.argv.slice(2);

  if (args.includes("--backfill")) {
    await backfillCards();
  }

  if (args.includes("--process")) {
    const idArg = args[args.indexOf("--process") + 1];
    if (idArg) {
      await processCard(parseInt(idArg));
      process.exit(0);
    }
  }

  await startEventListener();
}

main().catch((err) => {
  console.error("[Oracle] Fatal error:", err);
  process.exit(1);
});

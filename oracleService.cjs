// ═══════════════════════════════════════════════════════
// WHALEMON TCG — Oracle Service
// ═══════════════════════════════════════════════════════
// Listens for CardMinted events on the WhaleCards contract,
// fetches WHEL NFT traits, generates deterministic stats
// with AI abilities, and commits them on-chain.
//
// Usage:
//   ORACLE_PRIVATE_KEY=0x... node oracleService.js
//
// Env vars:
//   ORACLE_PRIVATE_KEY  - Private key of the oracle wallet
//   TEMPO_RPC           - Tempo RPC URL (default: https://rpc.tempo.xyz)
//   WHALE_CARDS_ADDRESS - Deployed WhaleCards contract address
//   ANTHROPIC_API_KEY   - Claude API key for ability generation
//   METADATA_STORE_PATH - Path to store ability metadata JSON files
// ═══════════════════════════════════════════════════════

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { TEMPO_CONFIG, CONTRACTS, WHEL_NFT_ABI, WHALE_CARDS_ABI } = require("./config.cjs");
const { generateCard } = require("./statEngine.cjs");

// ─── CONFIGURATION ───

const ORACLE_KEY = process.env.ORACLE_PRIVATE_KEY;
const METADATA_DIR = process.env.METADATA_STORE_PATH || "./metadata";
const BATCH_SIZE = 10;
const POLL_INTERVAL = 5000; // 5 seconds
const RETRY_DELAY = 10000; // 10 seconds

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

const whelNFT = new ethers.Contract(CONTRACTS.WHEL_NFT, WHEL_NFT_ABI, provider);
const whaleCards = new ethers.Contract(CONTRACTS.WHALE_CARDS, WHALE_CARDS_ABI, oracleWallet);

// ─── METADATA STORAGE ───
// Stores ability text off-chain (hash is committed on-chain)

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
// Reads WHEL NFT metadata to extract traits

async function fetchWhaleTraits(tokenId, sourceContractAddr) {
  try {
    // Use the source contract to fetch tokenURI — supports multi-collection
    const sourceNFT = sourceContractAddr
      ? new ethers.Contract(sourceContractAddr, WHEL_NFT_ABI, provider)
      : whelNFT;
    const tokenURI = await sourceNFT.tokenURI(tokenId);

    let metadata;

    if (tokenURI.startsWith("data:application/json;base64,")) {
      // On-chain base64 metadata
      const base64 = tokenURI.replace("data:application/json;base64,", "");
      metadata = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    } else if (tokenURI.startsWith("data:application/json,")) {
      // On-chain raw JSON
      const json = tokenURI.replace("data:application/json,", "");
      metadata = JSON.parse(decodeURIComponent(json));
    } else if (tokenURI.startsWith("http")) {
      // Off-chain metadata (IPFS gateway or HTTP)
      const response = await fetch(tokenURI);
      metadata = await response.json();
    } else if (tokenURI.startsWith("ipfs://")) {
      // IPFS URI
      const gateway = tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/");
      const response = await fetch(gateway);
      metadata = await response.json();
    } else {
      throw new Error(`Unknown tokenURI format: ${tokenURI.substring(0, 50)}...`);
    }

    // Extract traits from metadata
    // Standard format: attributes: [{trait_type: "...", value: "..."}, ...]
    const traits = {};

    if (metadata.attributes && Array.isArray(metadata.attributes)) {
      for (const attr of metadata.attributes) {
        if (attr.trait_type && attr.value !== undefined) {
          traits[attr.trait_type] = String(attr.value);
        }
      }
    }

    // Fallback: if no attributes, use name + description as traits
    if (Object.keys(traits).length === 0) {
      if (metadata.name) traits["name"] = metadata.name;
      if (metadata.description) traits["description"] = metadata.description;
      if (metadata.image) traits["image_hash"] = ethers.keccak256(ethers.toUtf8Bytes(metadata.image)).substring(0, 18);
    }

    // Extract the NFT image URL
    let imageURI = metadata.image || "";
    // Convert IPFS URIs to HTTP gateway for SVG embedding
    if (imageURI.startsWith("ipfs://")) {
      imageURI = imageURI.replace("ipfs://", "https://ipfs.io/ipfs/");
    }

    console.log(`[Oracle] Fetched traits for WHEL #${tokenId}: ${JSON.stringify(traits)}`);
    console.log(`[Oracle] Image URI: ${imageURI || "(none)"}`);
    return { traits, imageURI };
  } catch (err) {
    console.error(`[Oracle] Failed to fetch traits for WHEL #${tokenId}:`, err.message);
    // Return minimal fallback traits using tokenId as seed
    return {
      traits: {
        id: String(tokenId),
        collection: "WHEL",
        fallback: "true",
      },
      imageURI: "",
    };
  }
}

// ─── STAT COMMITMENT ───
// Commits generated stats to the WhaleCards contract on-chain

async function commitCardStats(cardData) {
  const { tokenId, attack, defense, health, speed, element, rarity, ability, imageURI } = cardData;

  try {
    // Check if stats are already set
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
      tokenId,
      attack,
      defense,
      health,
      speed,
      element,
      rarity,
      ability.hash,
      imageURI || ""
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

// ─── BATCH COMMITMENT ───

async function commitBatch(cardDataArray) {
  if (cardDataArray.length === 0) return;
  if (cardDataArray.length === 1) return commitCardStats(cardDataArray[0]);

  console.log(`[Oracle] Batch committing ${cardDataArray.length} cards...`);

  try {
    const tx = await whaleCards.batchCommitStats(
      cardDataArray.map((c) => c.tokenId),
      cardDataArray.map((c) => c.attack),
      cardDataArray.map((c) => c.defense),
      cardDataArray.map((c) => c.health),
      cardDataArray.map((c) => c.speed),
      cardDataArray.map((c) => c.element),
      cardDataArray.map((c) => c.rarity),
      cardDataArray.map((c) => c.ability.hash),
      cardDataArray.map((c) => c.imageURI || "")
    );

    console.log(`[Oracle] Batch tx submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Oracle] Batch committed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);

    return receipt;
  } catch (err) {
    console.error(`[Oracle] Batch commit failed, falling back to individual commits:`, err.message);
    for (const card of cardDataArray) {
      try {
        await commitCardStats(card);
      } catch (innerErr) {
        console.error(`[Oracle] Individual commit also failed for #${card.tokenId}:`, innerErr.message);
      }
    }
  }
}

// ─── FULL PIPELINE: process a single minted card ───

async function processCard(tokenId, sourceContractAddr, sourceTokenId) {
  console.log(`\n[Oracle] ══════════════════════════════════════`);
  console.log(`[Oracle] Processing Card #${tokenId} (source: ${sourceContractAddr || "unknown"} token ${sourceTokenId || tokenId})`);
  console.log(`[Oracle] ══════════════════════════════════════`);

  // Use sourceTokenId for fetching traits from the source NFT
  const traitTokenId = sourceTokenId || tokenId;

  // 1. Skip if already processed
  if (isMetadataExists(tokenId)) {
    const existing = await whaleCards.getCardStats(tokenId);
    if (existing[7]) {
      console.log(`[Oracle] #${tokenId} already fully processed, skipping`);
      return null;
    }
  }

  // 2. Fetch source NFT traits and image
  const { traits, imageURI } = await fetchWhaleTraits(traitTokenId, sourceContractAddr);

  // 3. Generate card (deterministic stats + AI ability)
  const cardData = await generateCard(tokenId, traits);

  // Attach image URI from the original NFT
  cardData.imageURI = imageURI;

  // 4. Save metadata off-chain
  saveCardMetadata(tokenId, cardData);

  // 5. Commit stats on-chain
  const receipt = await commitCardStats(cardData);

  console.log(`[Oracle] ✓ Whalemon #${tokenId} fully processed!`);
  return cardData;
}

// ─── EVENT LISTENER ───
// Listens for CardMinted events and processes them

async function startEventListener() {
  console.log(`[Oracle] Starting event listener on Tempo (chain ${TEMPO_CONFIG.chainId})...`);
  console.log(`[Oracle] WhaleCards: ${CONTRACTS.WHALE_CARDS}`);
  console.log(`[Oracle] WHEL NFT:   ${CONTRACTS.WHEL_NFT}`);
  console.log(`[Oracle] Oracle:     ${oracleWallet.address}`);

  // Verify oracle authorization
  try {
    const authorizedOracle = await whaleCards.oracle();
    if (authorizedOracle.toLowerCase() !== oracleWallet.address.toLowerCase()) {
      console.warn(`[Oracle] WARNING: Wallet ${oracleWallet.address} is NOT the authorized oracle (${authorizedOracle})`);
      console.warn(`[Oracle] Stats commitment will fail unless you're also the contract owner`);
    } else {
      console.log(`[Oracle] ✓ Oracle wallet authorized`);
    }
  } catch (err) {
    console.warn(`[Oracle] Could not verify oracle authorization:`, err.message);
  }

  // Queue for batch processing
  let pendingQueue = [];
  let processing = false;

  async function processPendingQueue() {
    if (processing || pendingQueue.length === 0) return;
    processing = true;

    const batch = pendingQueue.splice(0, BATCH_SIZE);
    console.log(`[Oracle] Processing batch of ${batch.length} cards...`);

    for (const item of batch) {
      const tokenId = typeof item === "object" ? item.cardId : item;
      const srcContract = typeof item === "object" ? item.sourceContract : null;
      const srcTokenId = typeof item === "object" ? item.sourceTokenId : tokenId;
      try {
        await processCard(tokenId, srcContract, srcTokenId);
      } catch (err) {
        console.error(`[Oracle] Error processing #${tokenId}:`, err.message);
        // Re-queue for retry
        setTimeout(() => {
          pendingQueue.push(item);
        }, RETRY_DELAY);
      }
    }

    processing = false;

    // Process next batch if queue isn't empty
    if (pendingQueue.length > 0) {
      setTimeout(processPendingQueue, 1000);
    }
  }

  // Listen for CardMinted events (new multi-collection signature)
  whaleCards.on("CardMinted", (owner, cardId, sourceContract, sourceTokenId, event) => {
    const id = Number(cardId);
    console.log(`\n[Oracle] ⚡ CardMinted event: Card #${id} minted by ${owner} from collection ${sourceContract} token ${Number(sourceTokenId)}`);
    pendingQueue.push({ cardId: id, sourceContract, sourceTokenId: Number(sourceTokenId) });
    processPendingQueue();
  });

  console.log(`[Oracle] ✓ Listening for CardMinted events...`);
  console.log(`[Oracle] Ready. Waiting for mints...\n`);
}

// ─── BACKFILL: process all minted but uncommitted cards ───

async function backfillCards() {
  console.log(`[Oracle] Starting backfill scan...`);

  // Get all past CardMinted events
  const filter = whaleCards.filters.CardMinted();
  const events = await whaleCards.queryFilter(filter, 0, "latest");
  console.log(`[Oracle] Found ${events.length} total CardMinted events`);

  const uncommitted = [];

  for (const event of events) {
    const tokenId = Number(event.args.cardId);
    const srcContract = event.args.sourceContract || null;
    const srcTokenId = event.args.sourceTokenId ? Number(event.args.sourceTokenId) : tokenId;
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

// ─── HEALTH CHECK / STATUS ───

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
  TCG Oracle Service v1.0
  `);

  await printStatus();

  const args = process.argv.slice(2);

  if (args.includes("--backfill")) {
    // Backfill mode: process all unminted cards then start listener
    await backfillCards();
  }

  if (args.includes("--process")) {
    // Process a specific card ID
    const idArg = args[args.indexOf("--process") + 1];
    if (idArg) {
      await processCard(parseInt(idArg));
      process.exit(0);
    }
  }

  // Default: start event listener
  await startEventListener();
}

main().catch((err) => {
  console.error("[Oracle] Fatal error:", err);
  process.exit(1);
});

// ═══════════════════════════════════════════════════════
// WHALEMON TCG — Metadata API Server
// ═══════════════════════════════════════════════════════
// Serves card metadata (ability names, descriptions) that
// are stored off-chain. The abilityHash on-chain can be
// verified against this data for integrity.
//
// Usage: node metadataApi.js
// ═══════════════════════════════════════════════════════

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.METADATA_API_PORT || 3001;
const METADATA_DIR = process.env.METADATA_STORE_PATH || "./metadata";

app.use(cors());
app.use(express.json());

// ─── GET /api/card/:tokenId ───
// Returns full card metadata including ability text
app.get("/api/card/:tokenId", (req, res) => {
  const tokenId = parseInt(req.params.tokenId);

  if (isNaN(tokenId) || tokenId < 0 || tokenId > 3333) {
    return res.status(400).json({ error: "Invalid token ID" });
  }

  const filePath = path.join(METADATA_DIR, `${tokenId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: "Card not found",
      message: `Whalemon #${tokenId} has not been generated yet. Mint a card first, then the oracle will generate stats.`,
    });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to read card data" });
  }
});

// ─── GET /api/cards ───
// Returns all generated card metadata (paginated)
app.get("/api/cards", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  if (!fs.existsSync(METADATA_DIR)) {
    return res.json({ cards: [], total: 0, page, limit });
  }

  const files = fs
    .readdirSync(METADATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => parseInt(a) - parseInt(b));

  const total = files.length;
  const start = (page - 1) * limit;
  const pageFiles = files.slice(start, start + limit);

  const cards = pageFiles.map((f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(METADATA_DIR, f), "utf-8"));
    } catch {
      return null;
    }
  }).filter(Boolean);

  res.json({
    cards,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

// ─── GET /api/cards/by-owner/:address ───
// Returns card metadata for cards owned by an address
// Note: This requires on-chain lookup + metadata join
app.get("/api/cards/by-owner/:address", async (req, res) => {
  // In production, this would query the WhaleCards contract
  // for the owner's token IDs, then return metadata for each
  res.json({
    message: "In production, this endpoint queries on-chain ownership and returns matching metadata.",
    address: req.params.address,
  });
});

// ─── GET /api/leaderboard ───
// Returns aggregated card power rankings
app.get("/api/leaderboard", (req, res) => {
  if (!fs.existsSync(METADATA_DIR)) {
    return res.json({ rankings: [] });
  }

  const files = fs.readdirSync(METADATA_DIR).filter((f) => f.endsWith(".json"));

  const cards = files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(METADATA_DIR, f), "utf-8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.totalPower - a.totalPower);

  res.json({
    totalCards: cards.length,
    topCards: cards.slice(0, 20).map((c) => ({
      tokenId: c.tokenId,
      element: c.element,
      rarity: c.rarity,
      totalPower: c.totalPower,
      ability: c.ability.name,
    })),
    elementDistribution: countBy(cards, "element"),
    rarityDistribution: countBy(cards, "rarity"),
  });
});

// ─── GET /api/stats ───
// Returns oracle service statistics
app.get("/api/stats", (req, res) => {
  if (!fs.existsSync(METADATA_DIR)) {
    return res.json({ totalGenerated: 0, maxSupply: 3333 });
  }

  const files = fs.readdirSync(METADATA_DIR).filter((f) => f.endsWith(".json"));

  res.json({
    totalGenerated: files.length,
    maxSupply: 3333,
    percentGenerated: ((files.length / 3333) * 100).toFixed(2) + "%",
  });
});

// ─── GET /api/verify/:tokenId ───
// Verify ability hash matches on-chain value
app.get("/api/verify/:tokenId", (req, res) => {
  const tokenId = parseInt(req.params.tokenId);
  const filePath = path.join(METADATA_DIR, `${tokenId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Card metadata not found" });
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  res.json({
    tokenId,
    abilityName: data.ability.name,
    abilityDescription: data.ability.description,
    abilityHash: data.ability.hash,
    message: "Compare the abilityHash with the on-chain value from WhaleCards.cardStats() to verify integrity.",
  });
});

// ─── HELPERS ───

function countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const val = item[key];
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}

// ─── START ───

app.listen(PORT, () => {
  console.log(`
  ╦ ╦╦ ╦╔═╗╦  ╔═╗╔╦╗╔═╗╔╗╔
  ║║║╠═╣╠═╣║  ║╣ ║║║║ ║║║║
  ╚╩╝╩ ╩╩ ╩╩═╝╚═╝╩ ╩╚═╝╝╚╝
  Metadata API v1.0
  `);
  console.log(`[API] Serving on http://localhost:${PORT}`);
  console.log(`[API] Metadata dir: ${path.resolve(METADATA_DIR)}`);
  console.log(`[API] Endpoints:`);
  console.log(`[API]   GET /api/card/:tokenId    — Single card metadata`);
  console.log(`[API]   GET /api/cards             — All cards (paginated)`);
  console.log(`[API]   GET /api/leaderboard       — Power rankings`);
  console.log(`[API]   GET /api/stats             — Oracle statistics`);
  console.log(`[API]   GET /api/verify/:tokenId   — Verify ability hash`);
});

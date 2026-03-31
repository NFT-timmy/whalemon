// ═══════════════════════════════════════════════════════
// WHALEMON TCG — Oracle Configuration
// ═══════════════════════════════════════════════════════

require("dotenv").config();

const TEMPO_CONFIG = {
  chainId: 4217,
  rpc: process.env.TEMPO_RPC || "https://rpc.tempo.xyz",
  explorer: "https://explore.tempo.xyz",
};

const CONTRACTS = {
  WHEL_NFT: "0x3e12fcb20ad532f653f2907d2ae511364e2ae696",
  WHALE_CARDS: process.env.WHALE_CARDS_ADDRESS || "0x0000000000000000000000000000000000000000",
  BATTLE_ARENA: process.env.BATTLE_ARENA_ADDRESS || "0x0000000000000000000000000000000000000000",
  MARKETPLACE: process.env.MARKETPLACE_ADDRESS || "0x0000000000000000000000000000000000000000",
  PATHUSD: "0x20c0000000000000000000000000000000000000",
};

// Minimal ABI for reading WHEL NFT traits
const WHEL_NFT_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

// WhaleCards ABI - minting and stat commitment
const WHALE_CARDS_ABI = [
  "event CardMinted(address indexed owner, uint256 indexed whaleId, uint256 indexed cardId)",
  "event StatsCommitted(uint256 indexed cardId, uint8 element, uint8 rarity)",

  "function commitStats(uint256 cardId, uint16 attack, uint16 defense, uint16 health, uint16 speed, uint8 element, uint8 rarity, bytes32 abilityHash, string imageURI) external",
  "function batchCommitStats(uint256[] cardIds, uint16[] attacks, uint16[] defenses, uint16[] healths, uint16[] speeds, uint8[] elements, uint8[] rarities, bytes32[] abilityHashes, string[] imageURIs) external",
  "function cardStats(uint256 cardId) view returns (uint16 attack, uint16 defense, uint16 health, uint16 speed, uint8 element, uint8 rarity, bytes32 abilityHash, bool isSet)",
  "function isCardMinted(uint256 whaleId) view returns (bool)",
  "function oracle() view returns (address)",
];

const ELEMENTS = [
  { id: 0, name: "Abyss",     strongVs: "Frost",     weakVs: "Storm" },
  { id: 1, name: "Tide",      strongVs: "Leviathan", weakVs: "Coral" },
  { id: 2, name: "Storm",     strongVs: "Abyss",     weakVs: "Tide" },
  { id: 3, name: "Frost",     strongVs: "Coral",     weakVs: "Abyss" },
  { id: 4, name: "Coral",     strongVs: "Tide",      weakVs: "Frost" },
  { id: 5, name: "Leviathan", strongVs: "Storm",     weakVs: "Tide" },
];

const RARITIES = [
  { id: 0, name: "Common",    weight: 40, statMultiplier: 1.0 },
  { id: 1, name: "Uncommon",  weight: 30, statMultiplier: 1.1 },
  { id: 2, name: "Rare",      weight: 18, statMultiplier: 1.25 },
  { id: 3, name: "Epic",      weight: 9,  statMultiplier: 1.4 },
  { id: 4, name: "Legendary", weight: 3,  statMultiplier: 1.6 },
];

module.exports = {
  TEMPO_CONFIG,
  CONTRACTS,
  WHEL_NFT_ABI,
  WHALE_CARDS_ABI,
  ELEMENTS,
  RARITIES,
};

// ═══════════════════════════════════════════════════════
// WHALEMON TCG — Oracle Configuration (v3)
// ═══════════════════════════════════════════════════════

require("dotenv").config();

const TEMPO_CONFIG = {
  chainId: 4217,
  rpc: process.env.TEMPO_RPC || "https://rpc.tempo.xyz",
  explorer: "https://explore.tempo.xyz",
};

const CONTRACTS = {
  WHALE_CARDS: process.env.WHALE_CARDS_ADDRESS || "0x0000000000000000000000000000000000000000",
  BATTLE_ARENA: process.env.BATTLE_ARENA_ADDRESS || "0x0000000000000000000000000000000000000000",
  MARKETPLACE: process.env.MARKETPLACE_ADDRESS || "0x0000000000000000000000000000000000000000",
  PATHUSD: "0x20c0000000000000000000000000000000000000",
};

// Generic ERC-721 ABI for reading any source NFT traits
const SOURCE_NFT_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

// WhaleCards v3 ABI — multi-collection + crafting + blacklist
const WHALE_CARDS_ABI = [
  // Events (new multi-collection signature)
  "event CardMinted(address indexed owner, uint256 indexed cardId, address indexed sourceContract, uint256 sourceTokenId)",
  "event StatsCommitted(uint256 indexed cardId, uint8 element, uint8 rarity)",
  "event CardCrafted(address indexed owner, uint256 indexed newCardId, uint8 outputRarity, bool success)",

  // Oracle functions
  "function commitStats(uint256 cardId, uint16 attack, uint16 defense, uint16 health, uint16 speed, uint8 element, uint8 rarity, bytes32 abilityHash, string imageURI) external",
  "function batchCommitStats(uint256[] cardIds, uint16[] attacks, uint16[] defenses, uint16[] healths, uint16[] speeds, uint8[] elements, uint8[] rarities, bytes32[] abilityHashes, string[] imageURIs) external",

  // View functions
  "function getCardStats(uint256 cardId) view returns (uint16, uint16, uint16, uint16, uint8, uint8, bytes32, bool)",
  "function getCardOrigin(uint256 cardId) view returns (address, uint256, bool)",
  "function isCardMinted(address srcContract, uint256 srcTokenId) view returns (bool)",
  "function oracle() view returns (address)",
  "function nextCardId() view returns (uint256)",
  "function getCollections() view returns (tuple(address contractAddr, string name, string imageURI, bool active, uint256 totalMinted)[])",
  "function cardImageURI(uint256) view returns (string)",
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
  SOURCE_NFT_ABI,
  WHALE_CARDS_ABI,
  ELEMENTS,
  RARITIES,
};

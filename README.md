# Whalemon TCG — Project Documentation

## Overview

A whale/ocean-themed Trading Card Game built on Tempo Network for the WHEL NFT collection. Players connect their Tempo wallet, generate unique Whalemon trading cards from their WHEL NFTs using AI, and battle other players on-chain.

## Architecture

```
┌──────────────────────────────────────────────────┐
│            Frontend (Next.js PWA)                 │
│  • Wallet Connect (Tempo Chain 4217)             │
│  • Card Gallery & Viewer                         │
│  • Minting Flow                                  │
│  • Battle UI (Phase 3)                           │
│  • Marketplace (Phase 4)                         │
└─────────┬──────────────────────┬─────────────────┘
          │                      │
    Tempo RPC               AI Oracle API
    (PATHUSD gas)           (Card Generation)
          │                      │
┌─────────▼──────────┐  ┌───────▼────────────────┐
│  Smart Contracts    │  │  AI Card Generator     │
│                     │  │                        │
│  WHEL NFT (existing)│  │  • Reads WHEL traits   │
│  0x3e12fcb...e696   │  │  • Generates stats     │
│                     │  │  • Assigns element     │
│  WhaleCards.sol     │  │  • Creates ability     │
│  (new ERC-721)      │  │  • Commits to chain    │
│  • mintCard()       │  │                        │
│  • commitStats()    │  │  Uses Claude API for   │
│  • On-chain SVG     │  │  flavour text & names  │
│                     │  └────────────────────────┘
│  BattleArena.sol    │
│  (Phase 3)          │
│                     │
│  Marketplace.sol    │
│  (Phase 4)          │
└─────────────────────┘
```

## Tempo Network Config

| Setting       | Value                                              |
|---------------|--------------------------------------------------- |
| Chain ID      | 4217                                               |
| RPC           | https://rpc.tempo.xyz                              |
| Explorer      | https://explore.tempo.xyz                          |
| Gas Token     | PATHUSD                                            |
| PATHUSD Addr  | `0x20c0000000000000000000000000000000000000`        |
| WHEL NFT      | `0x3e12fcb20ad532f653f2907d2ae511364e2ae696`        |
| WhaleCards    | TBD (deploy from WhaleCards.sol)                   |

## File Structure

```
whalemon-tcg/
├── contracts/
│   ├── WhaleCards.sol          # Card NFT (ERC-721) — mint cards from WHEL NFTs
│   ├── BattleArena.sol         # On-chain battles + prize pool + seasons
│   └── Marketplace.sol         # Buy/sell/offer cards in PATHUSD
├── frontend/
│   ├── WhalemonTCG.jsx          # Main React app (all pages)
│   └── lib/
│       ├── contracts.js        # ABI + contract addresses
│       └── tempo.js            # Tempo chain config for wagmi
├── oracle/
│   ├── config.js               # Network config, ABIs, element/rarity tables
│   ├── statEngine.js           # Deterministic stats + Claude API abilities
│   ├── oracleService.js        # Event listener, trait fetcher, chain committer
│   ├── metadataApi.js          # REST API serving card data to frontend
│   ├── package.json            # Dependencies
│   └── .env.example            # Environment variable template
├── deploy.sh                   # One-command deployment script
├── deployed-addresses.json     # Generated after deployment
└── README.md
```

## Smart Contract: WhaleCards.sol

### Key Functions

**Minting (free, gas only):**
- `mintCard(uint256 whaleId)` — Mint a card from your WHEL NFT
- `batchMintCards(uint256[] whaleIds)` — Mint multiple cards at once

**Stats (oracle commits after AI generation):**
- `commitStats(cardId, attack, defense, health, speed, element, rarity, abilityHash)` — Set AI-generated stats
- `batchCommitStats(...)` — Batch set stats for multiple cards

**Views:**
- `getCardStats(cardId)` — Get full card stats
- `isCardMinted(whaleId)` — Check if whale already has a card
- `tokenURI(cardId)` — Returns fully on-chain SVG metadata

### Card Stats

| Stat    | Range   | Description                    |
|---------|---------|--------------------------------|
| Attack  | 1-100   | Base damage dealt              |
| Defense | 1-100   | Damage reduction               |
| Health  | 50-300  | Hit points before defeat       |
| Speed   | 1-100   | Turn order priority            |

### Elements (6 types)

| ID | Element   | Strong vs  | Weak vs    |
|----|-----------|------------|------------|
| 0  | Abyss     | Frost      | Storm      |
| 1  | Tide      | Leviathan  | Coral      |
| 2  | Storm     | Abyss      | Tide       |
| 3  | Frost     | Coral      | Abyss      |
| 4  | Coral     | Tide       | Frost      |
| 5  | Leviathan | Storm      | Tide       |

### Rarity Tiers

| Tier      | Drop Rate | Stat Bonus  |
|-----------|-----------|-------------|
| Common    | 40%       | Base stats  |
| Uncommon  | 30%       | +10% stats  |
| Rare      | 18%       | +25% stats  |
| Epic      | 9%        | +40% stats  |
| Legendary | 3%        | +60% stats  |

## Deployment

### Quick Deploy (All 3 Contracts)

```bash
# One command deploys WhaleCards → BattleArena → Marketplace
chmod +x deploy.sh
DEPLOYER_KEY=0x_YOUR_PRIVATE_KEY ./deploy.sh
```

This outputs a `deployed-addresses.json` with all contract addresses.

### Manual Deploy (Step by Step)

### 1. Deploy WhaleCards Contract

```bash
# Using Foundry
forge create contracts/WhaleCards.sol:WhaleCards \
  --rpc-url https://rpc.tempo.xyz \
  --constructor-args \
    0x3e12fcb20ad532f653f2907d2ae511364e2ae696 \
    <ORACLE_ADDRESS> \
  --private-key <DEPLOYER_KEY>
```

### 2. Set Up AI Oracle

The oracle server:
1. Listens for `CardMinted` events on WhaleCards
2. Fetches the WHEL NFT traits from the WHEL contract
3. Feeds traits to AI model to generate stats
4. Calls `commitStats()` to write stats on-chain

Example stat generation prompt for Claude API:
```
Given a WHEL NFT with these traits:
- Background: {background}
- Body: {body}
- Accessory: {accessory}
- Eyes: {eyes}

Generate trading card stats for an ocean-themed TCG:
- Attack (1-100)
- Defense (1-100)  
- Health (50-300)
- Speed (1-100)
- Element (Abyss/Tide/Storm/Frost/Coral/Leviathan)
- Rarity (Common/Uncommon/Rare/Epic/Legendary)
- Ability name and description (ocean/whale themed)

Stats should be deterministic based on traits.
Respond in JSON format only.
```

### 3. Deploy Frontend

```bash
# Next.js setup with wagmi
npx create-next-app whalemon-tcg --typescript
cd whalemon-tcg
npm install wagmi viem @tanstack/react-query
```

Configure wagmi for Tempo:
```typescript
import { defineChain } from 'viem'

export const tempo = defineChain({
  id: 4217,
  name: 'Tempo',
  nativeCurrency: { name: 'PATHUSD', symbol: 'PATHUSD', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.tempo.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' },
  },
})
```

## Phase 2: AI Oracle System

### Architecture

```
CardMinted event → Oracle Service → Fetch WHEL Traits → Generate Stats → AI Ability → Commit On-Chain
                                                                                    ↓
                                                                              Save Metadata
                                                                                    ↓
                                                                            Metadata API → Frontend
```

### How Stats Are Generated

Stats are **deterministic** — the same whale traits always produce the same stats. This works by:

1. Concatenating all traits with the token ID into a string: `WHALEMON_V1|{tokenId}|{sorted_traits}`
2. Taking the `keccak256` hash of that string as a 256-bit seed
3. Extracting stats from specific byte ranges of the hash
4. Applying a rarity multiplier (Common=1.0x → Legendary=1.6x)

This means stats are provably fair and anyone can verify them by running the same algorithm.

### How Abilities Are Generated

Abilities use **Claude AI** (Sonnet) to generate unique names and descriptions based on:
- The whale's NFT traits
- The deterministically assigned element and rarity
- The card's stat profile

The ability text is stored off-chain in JSON files. Only the `keccak256(name|description)` hash is stored on-chain for verification.

If the Claude API is unavailable, the system falls back to pre-written abilities matched by element and rarity tier.

### Oracle Service Files

```
oracle/
├── config.js          # Tempo network config, ABIs, element/rarity tables
├── statEngine.js      # Deterministic stat generation + Claude API ability gen
├── oracleService.js   # Main service: event listener, trait fetcher, chain committer
├── metadataApi.js     # Express API serving ability data to the frontend
├── package.json       # Dependencies
└── .env.example       # Environment variable template
```

### Running the Oracle

```bash
cd oracle
npm install
cp .env.example .env
# Edit .env with your keys and deployed contract address

# Start the event listener (processes new mints in real-time)
npm start

# Or backfill all existing mints that don't have stats yet
npm run backfill

# Or process a single card manually
node oracleService.js --process 42

# Start the metadata API (serves ability data to frontend)
npm run metadata-api
```

### Metadata API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/card/:tokenId` | Full card metadata including ability text |
| `GET /api/cards?page=1&limit=50` | All generated cards (paginated) |
| `GET /api/leaderboard` | Top cards by power, element/rarity distribution |
| `GET /api/stats` | Oracle statistics (total generated, % complete) |
| `GET /api/verify/:tokenId` | Ability hash for on-chain verification |

### Card Reveal Flow

When a user mints a card, the frontend shows a 3-phase reveal animation:
1. **Minting** — Spinning whale, "Confirming transaction in PATHUSD gas"
2. **Generating** — "AI Oracle Generating Stats...", analyzing traits
3. **Revealing** — Card flip animation with element burst effect, stats revealed

## Phase 3: On-Chain Battle System

### Battle Contract: BattleArena.sol

Fully decentralised — all battle logic executes on Tempo. No server needed for fights.

### Battle Flow

```
1. Player creates battle (AI or PvP)  →  createBattle() / createAIBattle()
2. Opponent joins (PvP only)           →  joinBattle()
3. Players take turns making moves     →  makeMove(battleId, moveType)
4. Battle ends when HP hits 0 or       →  Winner recorded, stats updated
   max 30 turns reached
```

### Move Types

| Move | Effect | Notes |
|------|--------|-------|
| Attack | Base damage: `ATK × 100 / (100 + DEF)` | ±10% random variance |
| Ability | 1.8× damage multiplier | 3-turn cooldown between uses |
| Defend | Reduces next incoming damage by 50% | Strategic stalling option |

### Damage Formula

```
baseDamage = (attackerATK × 100) / (100 + defenderDEF)
if ability: baseDamage × 1.8
if element advantage: baseDamage × 1.5
if defender used Defend: baseDamage / 2
variance: ×(0.9 to 1.1 random)
minimum: 5 damage
```

### Element Advantage Cycle

```
Abyss → Frost → Coral → Tide → Leviathan → Storm → Abyss
  🌊  →   ❄️  →  🪸   →  🌀  →    🔥     →   ⚡  →  🌊
```

Each advantage grants a **1.5× damage bonus**.

### AI Opponent Behaviour

The AI uses pseudo-random decision making based on block data:
- **Low HP (<30%):** 30% chance to Defend
- **Ability available:** 40% chance to use Ability
- **Default:** Basic Attack

### Player Records (On-Chain)

The contract tracks per-address: wins, losses, draws, total battles, current win streak, and best streak ever. These feed directly into the leaderboard.

### Deployment

```bash
forge create contracts/BattleArena.sol:BattleArena \
  --rpc-url https://rpc.tempo.xyz \
  --constructor-args <WHALE_CARDS_ADDRESS> 0x20c0000000000000000000000000000000000000 \
  --private-key <DEPLOYER_KEY>
```

### Prize Pool System

Every battle charges a flat **entry fee** (default 1 PATHUSD). The fee is split:
- **90% → Prize Pool** — Accumulates throughout the season
- **10% → Platform** — Revenue for the team

At the end of each **30-day season**, the owner sets the top 5 players by wins and they can claim:

| Rank | Share | Example (1000 PATHUSD pool) |
|------|-------|----------------------------|
| 🥇 1st | 40% | 400 PATHUSD |
| 🥈 2nd | 25% | 250 PATHUSD |
| 🥉 3rd | 15% | 150 PATHUSD |
| 4th | 12% | 120 PATHUSD |
| 5th | 8% | 80 PATHUSD |

**Cancelled battles** get a full refund. Prize distribution percentages are configurable by the owner (must always sum to 100%).

### Season Lifecycle

```
Season starts → Players battle (entry fees accumulate)
    → 30 days pass → Owner calls endSeason(topPlayers[])
    → Top players call claimPrize(season, rank) → New season starts
```

## Phase Roadmap

### Phase 1 — Foundation ✅
- [x] WhaleCards.sol smart contract
- [x] Frontend UI with wallet connect
- [x] WHEL NFT viewer
- [x] Card minting flow
- [x] Card display with stats
- [x] On-chain SVG card art

### Phase 2 — AI Card Generation ✅
- [x] Oracle server for stat generation
- [x] Claude API integration for ability text
- [x] Deterministic stat algorithm (keccak256 seed)
- [x] Card reveal animation
- [x] Metadata API server
- [x] Off-chain ability storage with on-chain hash verification

### Phase 3 — Battles ✅
- [x] BattleArena.sol contract
- [x] Turn-based battle system
- [x] Element advantage system (6-way cycle)
- [x] PvP matchmaking (create/join battles)
- [x] AI opponent logic (pseudo-random decisions)
- [x] Battle UI with HP bars, action buttons, and combat log
- [x] 3 move types: Attack, Ability (with cooldown), Defend
- [x] Player records (wins, losses, streaks)
- [x] Entry fee system (1 PATHUSD per battle)
- [x] Prize pool (90% of fees → pool, 10% → platform)
- [x] 30-day seasons with top 5 prize distribution
- [x] Prize claiming + refund on cancellation

### Phase 4 — Marketplace & Leaderboard ✅
- [x] Marketplace.sol contract (list, buy, offers)
- [x] List/buy/sell in PATHUSD
- [x] Make/accept/cancel offers with expiration
- [x] 2.5% platform fee (configurable, max 10%)
- [x] Marketplace UI with cards, prices, recent sales
- [x] Enhanced leaderboard with win rate, streaks, seasons
- [x] Market statistics (floor, volume, total sales)

## Phase 4: Marketplace & Leaderboard

### Marketplace Contract: WhalemonMarket.sol

Fully on-chain NFT marketplace. All trades settle in PATHUSD stablecoin.

### Trading Features

**Direct Listings:**
- `listCard(cardId, price)` — List your card at a fixed price
- `buyCard(listingId)` — Buy a listed card instantly
- `cancelListing(listingId)` — Remove your listing
- `updateListingPrice(listingId, newPrice)` — Change the price

**Offers:**
- `makeOffer(cardId, amount, duration)` — Offer on any card (listed or not)
- `acceptOffer(offerId)` — Card owner accepts an offer
- `cancelOffer(offerId)` — Withdraw your offer

### Fee Structure

| Fee | Amount | Notes |
|-----|--------|-------|
| Platform fee | 2.5% | Deducted from sale price, paid in PATHUSD |
| Max fee | 10% | Owner cannot set higher than this |
| Min price | 0.01 PATHUSD | Prevents dust listings |
| Gas | PATHUSD | Tempo network gas in stablecoin |

### Deployment

```bash
# Deploy marketplace
forge create contracts/Marketplace.sol:WhalemonMarket \
  --rpc-url https://rpc.tempo.xyz \
  --constructor-args <WHALE_CARDS_ADDRESS> 0x20c0000000000000000000000000000000000000 \
  --private-key <DEPLOYER_KEY>

# Users must approve marketplace to transfer their cards:
# whaleCards.setApprovalForAll(marketplaceAddress, true)
# And approve PATHUSD spending:
# pathUSD.approve(marketplaceAddress, amount)
```

## Key Technical Notes

- **Tempo is EVM-compatible** — Standard Solidity works, deploy with Foundry/Hardhat
- **Gas is PATHUSD** — No volatile token needed, fees are stablecoin-denominated
- **WHEL uses ERC-6551** — Each whale has a token-bound account, which could hold card NFTs in the future
- **On-chain SVG** — Card art is generated as SVG directly in tokenURI(), fully on-chain
- **1:1 card mapping** — Card tokenId matches WHEL tokenId for easy cross-reference

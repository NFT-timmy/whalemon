#!/bin/bash
# ═══════════════════════════════════════════════════════
# WHALEMON TCG — Full Deployment Script for Tempo Network
# ═══════════════════════════════════════════════════════
#
# Prerequisites:
#   - Foundry installed (forge, cast)
#   - DEPLOYER_KEY set in environment
#   - Funded wallet with PATHUSD on Tempo
#
# Usage:
#   chmod +x deploy.sh
#   DEPLOYER_KEY=0x... ./deploy.sh
#
# ═══════════════════════════════════════════════════════

set -e

# ─── CONFIG ───
RPC="https://rpc.tempo.xyz"
CHAIN_ID=4217
WHEL_NFT="0x3e12fcb20ad532f653f2907d2ae511364e2ae696"
PATHUSD="0x20c0000000000000000000000000000000000000"

if [ -z "$DEPLOYER_KEY" ]; then
  echo "ERROR: Set DEPLOYER_KEY environment variable"
  exit 1
fi

DEPLOYER=$(cast wallet address $DEPLOYER_KEY)
echo ""
echo "  ╦ ╦╦ ╦╔═╗╦  ╔═╗╔╦╗╔═╗╔╗╔"
echo "  ║║║╠═╣╠═╣║  ║╣ ║║║║ ║║║║"
echo "  ╚╩╝╩ ╩╩ ╩╩═╝╚═╝╩ ╩╚═╝╝╚╝"
echo "  TCG Deployment Script"
echo ""
echo "Network:    Tempo (Chain $CHAIN_ID)"
echo "RPC:        $RPC"
echo "Deployer:   $DEPLOYER"
echo "WHEL NFT:   $WHEL_NFT"
echo "PATHUSD:    $PATHUSD"
echo ""

# ─── STEP 1: Deploy WhaleCards ───
echo "═══ Step 1: Deploying WhaleCards (Card NFT) ═══"
echo "Oracle will be set to deployer initially..."

WHALE_CARDS=$(forge create contracts/WhaleCards.sol:WhaleCards \
  --rpc-url $RPC \
  --private-key $DEPLOYER_KEY \
  --constructor-args $WHEL_NFT $DEPLOYER \
  --json | jq -r '.deployedTo')

echo "✓ WhaleCards deployed: $WHALE_CARDS"
echo ""

# ─── STEP 2: Deploy BattleArena ───
echo "═══ Step 2: Deploying BattleArena (Battles + Prize Pool) ═══"

BATTLE_ARENA=$(forge create contracts/BattleArena.sol:BattleArena \
  --rpc-url $RPC \
  --private-key $DEPLOYER_KEY \
  --constructor-args $WHALE_CARDS $PATHUSD \
  --json | jq -r '.deployedTo')

echo "✓ BattleArena deployed: $BATTLE_ARENA"
echo ""

# ─── STEP 3: Deploy Marketplace ───
echo "═══ Step 3: Deploying WhalemonMarket (Marketplace) ═══"

MARKETPLACE=$(forge create contracts/Marketplace.sol:WhalemonMarket \
  --rpc-url $RPC \
  --private-key $DEPLOYER_KEY \
  --constructor-args $WHALE_CARDS $PATHUSD \
  --json | jq -r '.deployedTo')

echo "✓ WhalemonMarket deployed: $MARKETPLACE"
echo ""

# ─── SUMMARY ───
echo "═══════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  WhaleCards:     $WHALE_CARDS"
echo "  BattleArena:    $BATTLE_ARENA"
echo "  WhalemonMarket: $MARKETPLACE"
echo ""
echo "  WHEL NFT:       $WHEL_NFT"
echo "  PATHUSD:        $PATHUSD"
echo ""
echo "═══ Next Steps ═══"
echo ""
echo "1. Update oracle/.env with:"
echo "   WHALE_CARDS_ADDRESS=$WHALE_CARDS"
echo ""
echo "2. Update frontend CONTRACTS object with:"
echo "   WHALE_CARDS: \"$WHALE_CARDS\""
echo "   BATTLE_ARENA: \"$BATTLE_ARENA\""
echo "   MARKETPLACE: \"$MARKETPLACE\""
echo ""
echo "3. Start the oracle:"
echo "   cd oracle && npm install && npm start"
echo ""
echo "4. Start the metadata API:"
echo "   cd oracle && npm run metadata-api"
echo ""
echo "5. Users need to approve contracts:"
echo "   - WhaleCards: approve for marketplace (setApprovalForAll)"
echo "   - PATHUSD: approve for marketplace + battle arena"
echo ""
echo "═══════════════════════════════════════════════════"

# ─── SAVE ADDRESSES ───
cat > deployed-addresses.json << EOF
{
  "network": "Tempo",
  "chainId": $CHAIN_ID,
  "rpc": "$RPC",
  "contracts": {
    "WhaleCards": "$WHALE_CARDS",
    "BattleArena": "$BATTLE_ARENA",
    "WhalemonMarket": "$MARKETPLACE"
  },
  "dependencies": {
    "WHEL_NFT": "$WHEL_NFT",
    "PATHUSD": "$PATHUSD"
  },
  "deployer": "$DEPLOYER",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "Addresses saved to: deployed-addresses.json"

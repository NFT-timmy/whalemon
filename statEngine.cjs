// ═══════════════════════════════════════════════════════
// WHALEMON TCG — Card Stat Engine
// ═══════════════════════════════════════════════════════
// Generates deterministic card stats from WHEL NFT traits.
// Stats are derived from a keccak256 hash of the traits,
// ensuring the same whale ALWAYS produces the same card.
// AI (Claude) generates only the flavour text (ability).
// ═══════════════════════════════════════════════════════

const { ethers } = require("ethers");
const { ELEMENTS, RARITIES } = require("./config.cjs")

// ─── DETERMINISTIC STAT GENERATION ───
// Uses keccak256(traits) as a seed to derive all numeric stats.
// This makes stats provably fair and reproducible.

/**
 * Generate a deterministic seed from WHEL NFT traits
 * @param {number} tokenId - The WHEL token ID
 * @param {object} traits - The NFT trait object
 * @returns {string} A 256-bit hex hash
 */
function generateSeed(tokenId, traits) {
  // Sort trait keys for consistency
  const sortedTraits = Object.keys(traits)
    .sort()
    .map((key) => `${key}:${traits[key]}`)
    .join("|");

  const payload = `WHALEMON_V1|${tokenId}|${sortedTraits}`;
  return ethers.keccak256(ethers.toUtf8Bytes(payload));
}

/**
 * Extract a number from a specific byte range of the seed hash
 * @param {string} seed - Hex hash string
 * @param {number} offset - Byte offset (0-31)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Deterministic value in [min, max]
 */
function extractStat(seed, offset, min, max) {
  // Take 2 bytes from the hash at the given offset
  const hex = seed.slice(2 + offset * 2, 2 + offset * 2 + 4);
  const raw = parseInt(hex, 16); // 0-65535
  return min + Math.floor((raw / 65536) * (max - min + 1));
}

/**
 * Determine rarity from seed using weighted distribution
 * @param {string} seed - Hex hash
 * @returns {number} Rarity ID (0-4)
 */
function determineRarity(seed) {
  const roll = extractStat(seed, 0, 0, 99); // 0-99

  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += rarity.weight;
    if (roll < cumulative) return rarity.id;
  }
  return 0; // fallback: Common
}

/**
 * Determine element from seed
 * @param {string} seed - Hex hash
 * @returns {number} Element ID (0-5)
 */
function determineElement(seed) {
  return extractStat(seed, 2, 0, 5);
}

/**
 * Generate full deterministic card stats from WHEL NFT traits
 * @param {number} tokenId - WHEL token ID
 * @param {object} traits - NFT trait metadata
 * @returns {object} Complete card stats
 */
function generateStats(tokenId, traits) {
  const seed = generateSeed(tokenId, traits);

  const rarity = determineRarity(seed);
  const element = determineElement(seed);

  // Rarity-banded stat ranges — higher rarity ALWAYS produces higher stats
  // regardless of roll. No overlap between bands.
  const statRanges = [
    // Common
    { atkMin: 20, atkMax: 40, defMin: 15, defMax: 35, hpMin: 60,  hpMax: 110, spdMin: 15, spdMax: 35 },
    // Uncommon
    { atkMin: 41, atkMax: 58, defMin: 36, defMax: 52, hpMin: 111, hpMax: 160, spdMin: 36, spdMax: 52 },
    // Rare
    { atkMin: 59, atkMax: 72, defMin: 53, defMax: 66, hpMin: 161, hpMax: 210, spdMin: 53, spdMax: 66 },
    // Epic
    { atkMin: 73, atkMax: 85, defMin: 67, defMax: 78, hpMin: 211, hpMax: 255, spdMin: 67, spdMax: 78 },
    // Legendary
    { atkMin: 86, atkMax: 100, defMin: 79, defMax: 100, hpMin: 256, hpMax: 300, spdMin: 79, spdMax: 100 },
  ];

  const r = statRanges[rarity];

  const attack  = extractStat(seed, 4,  r.atkMin, r.atkMax);
  const defense = extractStat(seed, 6,  r.defMin, r.defMax);
  const health  = extractStat(seed, 8,  r.hpMin,  r.hpMax);
  const speed   = extractStat(seed, 10, r.spdMin, r.spdMax);

  return {
    tokenId,
    seed,
    attack,
    defense,
    health,
    speed,
    element,
    rarity,
    elementName: ELEMENTS[element].name,
    rarityName: RARITIES[rarity].name,
    totalPower: attack + defense + Math.floor(health / 3) + speed,
  };
}

// ─── AI ABILITY GENERATION (Claude API) ───
// Uses Claude to generate unique ability names and descriptions
// based on the whale's traits and assigned element/rarity.

/**
 * Generate an ability using Claude API
 * @param {number} tokenId - WHEL token ID
 * @param {object} traits - NFT traits
 * @param {object} stats - Generated card stats
 * @returns {Promise<{name: string, description: string}>}
 */
async function generateAbility(tokenId, traits, stats) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("[StatEngine] No ANTHROPIC_API_KEY set, using fallback ability");
    return getFallbackAbility(stats.element, stats.rarity);
  }

  const traitSummary = Object.entries(traits)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const prompt = `You are generating a trading card ability for the Whalemon TCG, an ocean/whale-themed card game.

This card is Whalemon #${tokenId}.
NFT Traits: ${traitSummary}
Element: ${stats.elementName}
Rarity: ${stats.rarityName}
Attack: ${stats.attack} | Defense: ${stats.defense} | HP: ${stats.health} | Speed: ${stats.speed}

Generate a unique ability for this card. The ability should:
- Be ocean/whale/deep-sea themed
- Match the ${stats.elementName} element
- Be more powerful for higher rarities (this is ${stats.rarityName})
- Have a name that's 2-4 words
- Have a description that's 1-2 sentences explaining the battle effect
- Reference the whale's traits where possible

Respond ONLY in JSON with no markdown:
{"name": "Ability Name", "description": "What the ability does in battle."}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[StatEngine] Claude API error ${response.status}: ${errText}`);
      return getFallbackAbility(stats.element, stats.rarity);
    }

    const data = await response.json();
    const text = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse JSON, stripping any markdown fences
    const clean = text.replace(/```json|```/g, "").trim();
    const ability = JSON.parse(clean);

    // Validate
    if (!ability.name || !ability.description) {
      throw new Error("Missing name or description in AI response");
    }

    console.log(`[StatEngine] AI generated ability for #${tokenId}: "${ability.name}"`);
    return { name: ability.name, description: ability.description };
  } catch (err) {
    console.error(`[StatEngine] AI generation failed for #${tokenId}:`, err.message);
    return getFallbackAbility(stats.element, stats.rarity);
  }
}

/**
 * Fallback abilities if AI is unavailable
 */
function getFallbackAbility(element, rarity) {
  const fallbacks = {
    0: [ // Abyss
      { name: "Void Pulse", description: "Sends a shockwave from the deep, dealing damage equal to 30% of the user's attack." },
      { name: "Abyssal Crush", description: "Crushes the opponent with immense deep-sea pressure. Deals 2x damage to Frost types." },
      { name: "Dark Descent", description: "Drags the enemy into the abyss, reducing their speed by 40% for 2 turns." },
      { name: "Trench Devour", description: "Consumes the target's defenses, stealing 25% of their defense stat permanently." },
      { name: "Primordial Maelstrom", description: "Unleashes an ancient vortex that deals massive damage and ignores all defensive buffs." },
    ],
    1: [ // Tide
      { name: "Riptide Slash", description: "A swift current-powered strike that deals bonus damage based on the user's speed." },
      { name: "Tidal Surge", description: "A powerful wave crashes into the opponent, dealing area damage to all enemies." },
      { name: "Current Shield", description: "Wraps the user in swirling currents, reflecting 20% of incoming damage." },
      { name: "Whirlpool Trap", description: "Creates a whirlpool that traps the enemy, preventing them from switching for 3 turns." },
      { name: "Tsunami Wrath", description: "Calls forth a devastating tsunami that deals triple damage and stuns for 1 turn." },
    ],
    2: [ // Storm
      { name: "Thunder Breach", description: "Lightning strikes from above, ignoring 50% of the target's defense." },
      { name: "Gale Force", description: "Summons fierce winds that push the enemy back, reducing their attack by 25%." },
      { name: "Static Shell", description: "Charges the user's body with electricity, shocking attackers for 15% recoil damage." },
      { name: "Cyclone Dive", description: "Dives through a cyclone at blinding speed, always striking first regardless of speed stats." },
      { name: "Tempest Annihilation", description: "Calls down the fury of the ocean storm, dealing devastating lightning and wind damage." },
    ],
    3: [ // Frost
      { name: "Ice Barb", description: "Launches frozen spines that have a 30% chance to freeze the target for 1 turn." },
      { name: "Frozen Shield", description: "Encases the user in ice armor, blocking 50% of incoming damage for 2 turns." },
      { name: "Glacial Breath", description: "Breathes a freezing mist that reduces the opponent's speed by 60%." },
      { name: "Permafrost Lock", description: "Locks the enemy in ice, preventing ability usage for 2 turns." },
      { name: "Absolute Zero", description: "Drops the temperature to absolute zero, freezing and dealing massive damage to all enemies." },
    ],
    4: [ // Coral
      { name: "Reef Sting", description: "Stings with venomous coral barbs, dealing poison damage over 3 turns." },
      { name: "Coral Barrage", description: "Fires a rapid burst of coral shards, hitting 3 times for 30% damage each." },
      { name: "Symbiotic Heal", description: "The coral ecosystem restores the user's health by 25% of max HP." },
      { name: "Living Reef", description: "Summons a coral barrier that absorbs damage equal to 40% of the user's max health." },
      { name: "Bloom Catastrophe", description: "Triggers a massive coral bloom that poisons all enemies and heals all allies." },
    ],
    5: [ // Leviathan
      { name: "Crushing Jaw", description: "Bites down with enormous force, dealing damage that scales with the user's health." },
      { name: "Deep Roar", description: "A terrifying roar from the deep that reduces all enemy stats by 15% for 2 turns." },
      { name: "Leviathan Hide", description: "Thickens the user's skin, permanently increasing defense by 10 each time it's used." },
      { name: "Predator's Rush", description: "Charges at the enemy with unstoppable force. Cannot be blocked or dodged." },
      { name: "World Eater", description: "The leviathan devours everything in its path, dealing 50% of the target's max HP as damage." },
    ],
  };

  const pool = fallbacks[element] || fallbacks[0];
  // Use rarity as index (higher rarity = more powerful ability)
  const ability = pool[Math.min(rarity, pool.length - 1)];
  return ability;
}

/**
 * Generate the abilityHash for on-chain storage
 * @param {string} name - Ability name
 * @param {string} description - Ability description
 * @returns {string} bytes32 hash
 */
function hashAbility(name, description) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${name}|${description}`));
}

/**
 * Full card generation pipeline
 * @param {number} tokenId - WHEL token ID
 * @param {object} traits - NFT traits from metadata
 * @returns {Promise<object>} Complete card data ready for chain commitment
 */
async function generateCard(tokenId, traits) {
  console.log(`[StatEngine] Generating card for Whalemon #${tokenId}...`);
  console.log(`[StatEngine] Traits: ${JSON.stringify(traits)}`);

  // Step 1: Deterministic stats from trait hash
  const stats = generateStats(tokenId, traits);
  console.log(`[StatEngine] Stats: ATK=${stats.attack} DEF=${stats.defense} HP=${stats.health} SPD=${stats.speed}`);
  console.log(`[StatEngine] Element: ${stats.elementName} | Rarity: ${stats.rarityName}`);

  // Step 2: AI-generated ability
  const ability = await generateAbility(tokenId, traits, stats);
  console.log(`[StatEngine] Ability: "${ability.name}" — ${ability.description}`);

  // Step 3: Hash ability for on-chain reference
  const abilityHash = hashAbility(ability.name, ability.description);

  return {
    tokenId,
    attack: stats.attack,
    defense: stats.defense,
    health: stats.health,
    speed: stats.speed,
    element: stats.element,
    rarity: stats.rarity,
    elementName: stats.elementName,
    rarityName: stats.rarityName,
    totalPower: stats.totalPower,
    seed: stats.seed,
    ability: {
      name: ability.name,
      description: ability.description,
      hash: abilityHash,
    },
  };
}

module.exports = {
  generateSeed,
  generateStats,
  generateAbility,
  generateCard,
  hashAbility,
  getFallbackAbility,
};

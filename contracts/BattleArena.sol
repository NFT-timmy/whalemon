// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BattleArena - Whalemon TCG On-Chain Battle System
/// @author Whalemon TCG on Tempo Network
/// @notice Fully decentralised turn-based battles between Whalemon cards.
/// @dev All battle logic runs on-chain. Entry fee per battle funds a prize pool.
///      Gas paid in PATHUSD. Prize pool distributed to top players each season.

interface IWhaleCards {
    struct CardStats {
        uint16 attack;
        uint16 defense;
        uint16 health;
        uint16 speed;
        uint8 element;
        uint8 rarity;
        bytes32 abilityHash;
        bool isSet;
    }

    function ownerOf(uint256 tokenId) external view returns (address);
    function getCardStats(uint256 cardId) external view returns (CardStats memory);
}

interface IPATHUSD {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract BattleArena is Ownable, ReentrancyGuard {

    /* ═══════════════════════════════════════════════════ */
    /*                    CONSTANTS                       */
    /* ═══════════════════════════════════════════════════ */

    IWhaleCards public immutable whaleCards;
    IPATHUSD public immutable pathUSD;

    uint8 public constant MAX_TURNS = 30;
    uint16 public constant ELEMENT_BONUS = 150;
    uint16 public constant ABILITY_COOLDOWN = 3;
    uint16 public constant ABILITY_POWER_MULTIPLIER = 180;
    uint16 public constant BASE_DAMAGE_MIN = 5;

    /* ═══════════════════════════════════════════════════ */
    /*                     ENUMS                          */
    /* ═══════════════════════════════════════════════════ */

    enum BattleStatus { Open, Active, Finished, Cancelled }
    enum MoveType { Attack, Ability, Defend }
    enum BattleMode { PvP, AI }

    /* ═══════════════════════════════════════════════════ */
    /*                    STRUCTS                         */
    /* ═══════════════════════════════════════════════════ */

    struct Battle {
        uint256 battleId;
        address player1;
        address player2;
        uint256 card1;
        uint256 card2;
        int16 hp1;           // Current HP of card 1 (signed for underflow safety)
        int16 hp2;           // Current HP of card 2
        uint8 turn;          // Current turn number
        uint8 lastAbility1;  // Last turn player 1 used ability
        uint8 lastAbility2;  // Last turn player 2 used ability
        bool isPlayer1Turn;  // Whose turn it is
        uint8 defenseBoost1; // Turns of defense boost remaining for player 1
        uint8 defenseBoost2; // Turns of defense boost remaining for player 2
        BattleStatus status;
        BattleMode mode;
        address winner;
        uint256 createdAt;
        uint256 finishedAt;
    }

    struct BattleLog {
        uint8 turn;
        address player;
        MoveType move;
        uint16 damage;
        int16 hp1After;
        int16 hp2After;
    }

    struct PlayerRecord {
        uint32 wins;
        uint32 losses;
        uint32 draws;
        uint32 totalBattles;
        uint32 winStreak;
        uint32 bestStreak;
        uint256 totalDamageDealt;
    }

    /* ═══════════════════════════════════════════════════ */
    /*                 STATE VARIABLES                    */
    /* ═══════════════════════════════════════════════════ */

    uint256 public nextBattleId;
    mapping(uint256 => Battle) public battles;
    mapping(uint256 => BattleLog[]) public battleLogs;
    mapping(address => PlayerRecord) public playerRecords;
    mapping(address => uint256) public activeBattle; // Player's current active battle

    // Element advantage matrix
    mapping(uint8 => uint8) public elementAdvantage;

    /* ─── PRIZE POOL ─── */

    /// @notice Entry fee per battle in PATHUSD (18 decimals)
    uint256 public entryFee = 1 ether; // 1 PATHUSD default

    /// @notice Platform cut from entry fees (in basis points, 1000 = 10%)
    uint256 public platformFeeBps = 1000; // 10% goes to platform

    /// @notice Maximum platform fee
    uint256 public constant MAX_PLATFORM_FEE = 2000; // 20% max

    /// @notice Current season's prize pool (PATHUSD)
    uint256 public prizePool;

    /// @notice Accumulated platform fees (withdrawable by owner)
    uint256 public platformFees;

    /// @notice Current season number
    uint256 public currentSeason = 1;

    /// @notice Season start timestamp
    uint256 public seasonStart;

    /// @notice Season duration (default 30 days)
    uint256 public seasonDuration = 30 days;

    /// @notice Prize distribution: top N players get a share
    /// @dev Percentages in basis points. Must sum to 10000.
    uint256[] public prizeDistribution;

    /// @notice Season => rank => player address (set when season ends)
    mapping(uint256 => mapping(uint256 => address)) public seasonRankings;

    /// @notice Season => total prize pool at end
    mapping(uint256 => uint256) public seasonPrizePool;

    /// @notice Season => rank => claimed
    mapping(uint256 => mapping(uint256 => bool)) public prizeClaimed;

    /// @notice Season => player => wins in that season
    mapping(uint256 => mapping(address => uint32)) public seasonWins;

    /// @notice Total battles played (for stats)
    uint256 public totalBattlesPlayed;

    /* ═══════════════════════════════════════════════════ */
    /*                     EVENTS                         */
    /* ═══════════════════════════════════════════════════ */

    event BattleCreated(uint256 indexed battleId, address indexed player1, uint256 card1, BattleMode mode);
    event BattleJoined(uint256 indexed battleId, address indexed player2, uint256 card2);
    event BattleMove(uint256 indexed battleId, uint8 turn, address indexed player, MoveType move, uint16 damage);
    event BattleFinished(uint256 indexed battleId, address indexed winner, uint8 totalTurns);
    event BattleCancelled(uint256 indexed battleId);
    event EntryFeePaid(address indexed player, uint256 amount, uint256 toPool, uint256 toPlatform);
    event SeasonEnded(uint256 indexed season, uint256 prizePool, address[] topPlayers);
    event PrizeClaimed(uint256 indexed season, uint256 rank, address indexed player, uint256 amount);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);

    /* ═══════════════════════════════════════════════════ */
    /*                   CUSTOM ERRORS                    */
    /* ═══════════════════════════════════════════════════ */

    error NotCardOwner();
    error CardStatsNotSet();
    error AlreadyInBattle();
    error BattleNotFound();
    error BattleNotOpen();
    error BattleNotActive();
    error NotYourTurn();
    error NotBattleParticipant();
    error CannotFightYourself();
    error AbilityOnCooldown();
    error InvalidMove();
    error BattleAlreadyFinished();
    error InsufficientAllowance();
    error SeasonStillActive();
    error SeasonNotEnded();
    error AlreadyClaimed();
    error InvalidRank();
    error NotRankedPlayer();
    error InvalidFee();

    /* ═══════════════════════════════════════════════════ */
    /*                   CONSTRUCTOR                      */
    /* ═══════════════════════════════════════════════════ */

    constructor(address _whaleCards, address _pathUSD) Ownable(msg.sender) {
        whaleCards = IWhaleCards(_whaleCards);
        pathUSD = IPATHUSD(_pathUSD);

        // Set element advantages:
        // Abyss(0) > Frost(3) > Coral(4) > Tide(1) > Leviathan(5) > Storm(2) > Abyss(0)
        elementAdvantage[0] = 3; // Abyss beats Frost
        elementAdvantage[3] = 4; // Frost beats Coral
        elementAdvantage[4] = 1; // Coral beats Tide
        elementAdvantage[1] = 5; // Tide beats Leviathan
        elementAdvantage[5] = 2; // Leviathan beats Storm
        elementAdvantage[2] = 0; // Storm beats Abyss

        seasonStart = block.timestamp;

        // Default prize distribution: Top 5 players
        // 1st: 40%, 2nd: 25%, 3rd: 15%, 4th: 12%, 5th: 8%
        prizeDistribution.push(4000);
        prizeDistribution.push(2500);
        prizeDistribution.push(1500);
        prizeDistribution.push(1200);
        prizeDistribution.push(800);
    }

    /* ═══════════════════════════════════════════════════ */
    /*               ENTRY FEE HANDLING                   */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Charges the entry fee from a player before battle
    /// @dev Splits fee between prize pool and platform
    function _chargeEntryFee(address player) internal {
        if (entryFee == 0) return;

        // Check allowance
        if (pathUSD.allowance(player, address(this)) < entryFee) revert InsufficientAllowance();

        // Calculate platform cut
        uint256 platformCut = (entryFee * platformFeeBps) / 10000;
        uint256 poolContribution = entryFee - platformCut;

        // Transfer full fee from player to contract
        pathUSD.transferFrom(player, address(this), entryFee);

        // Track splits
        prizePool += poolContribution;
        platformFees += platformCut;

        emit EntryFeePaid(player, entryFee, poolContribution, platformCut);
    }

    /* ═══════════════════════════════════════════════════ */
    /*               BATTLE CREATION                      */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Create a new PvP battle and wait for an opponent
    /// @param cardId Your Whalemon card to battle with
    /// @dev Charges entry fee in PATHUSD before creating
    function createBattle(uint256 cardId) external nonReentrant returns (uint256) {
        _validateCard(msg.sender, cardId);
        if (activeBattle[msg.sender] != 0) revert AlreadyInBattle();

        // Charge entry fee
        _chargeEntryFee(msg.sender);

        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);

        uint256 battleId = ++nextBattleId;

        battles[battleId] = Battle({
            battleId: battleId,
            player1: msg.sender,
            player2: address(0),
            card1: cardId,
            card2: 0,
            hp1: int16(stats.health),
            hp2: 0,
            turn: 0,
            lastAbility1: 0,
            lastAbility2: 0,
            isPlayer1Turn: true,
            defenseBoost1: 0,
            defenseBoost2: 0,
            status: BattleStatus.Open,
            mode: BattleMode.PvP,
            winner: address(0),
            createdAt: block.timestamp,
            finishedAt: 0
        });

        activeBattle[msg.sender] = battleId;

        emit BattleCreated(battleId, msg.sender, cardId, BattleMode.PvP);
        return battleId;
    }

    /// @notice Create a battle against the AI
    /// @param cardId Your Whalemon card to battle with
    /// @dev Charges entry fee. AI opponent uses pseudo-random stats.
    function createAIBattle(uint256 cardId) external nonReentrant returns (uint256) {
        _validateCard(msg.sender, cardId);
        if (activeBattle[msg.sender] != 0) revert AlreadyInBattle();

        // Charge entry fee
        _chargeEntryFee(msg.sender);

        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);

        uint256 battleId = ++nextBattleId;

        // Generate AI opponent HP — slightly varied from player's card
        uint256 aiSeed = uint256(keccak256(abi.encodePacked(block.timestamp, battleId, cardId)));
        int16 aiHp = int16(uint16(80 + (aiSeed % 180))); // 80-259 HP range

        battles[battleId] = Battle({
            battleId: battleId,
            player1: msg.sender,
            player2: address(this), // AI is the contract itself
            card1: cardId,
            card2: 0, // AI has no card NFT
            hp1: int16(stats.health),
            hp2: aiHp,
            turn: 1,
            lastAbility1: 0,
            lastAbility2: 0,
            isPlayer1Turn: true, // Player always goes first vs AI
            defenseBoost1: 0,
            defenseBoost2: 0,
            status: BattleStatus.Active,
            mode: BattleMode.AI,
            winner: address(0),
            createdAt: block.timestamp,
            finishedAt: 0
        });

        activeBattle[msg.sender] = battleId;

        emit BattleCreated(battleId, msg.sender, cardId, BattleMode.AI);
        return battleId;
    }

    /// @notice Join an open PvP battle
    /// @param battleId The battle to join
    /// @param cardId Your Whalemon card to battle with
    /// @dev Charges entry fee in PATHUSD before joining
    function joinBattle(uint256 battleId, uint256 cardId) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.Open) revert BattleNotOpen();
        if (battle.player1 == msg.sender) revert CannotFightYourself();
        if (activeBattle[msg.sender] != 0) revert AlreadyInBattle();

        _validateCard(msg.sender, cardId);

        // Charge entry fee
        _chargeEntryFee(msg.sender);

        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);

        battle.player2 = msg.sender;
        battle.card2 = cardId;
        battle.hp2 = int16(stats.health);
        battle.status = BattleStatus.Active;
        battle.turn = 1;

        // Determine who goes first based on speed
        IWhaleCards.CardStats memory stats1 = whaleCards.getCardStats(battle.card1);
        battle.isPlayer1Turn = stats1.speed >= stats.speed;

        activeBattle[msg.sender] = battleId;

        emit BattleJoined(battleId, msg.sender, cardId);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                 BATTLE MOVES                       */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Execute a battle move
    /// @param battleId The battle ID
    /// @param move The move type (0=Attack, 1=Ability, 2=Defend)
    function makeMove(uint256 battleId, MoveType move) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.Active) revert BattleNotActive();
        if (battle.status == BattleStatus.Finished) revert BattleAlreadyFinished();

        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2) revert NotBattleParticipant();

        // In PvP, enforce turn order
        if (battle.mode == BattleMode.PvP) {
            if (isPlayer1 && !battle.isPlayer1Turn) revert NotYourTurn();
            if (isPlayer2 && battle.isPlayer1Turn) revert NotYourTurn();
        }

        // Execute the player's move
        uint16 damage = _executeMove(battle, isPlayer1, move);

        // Log the move
        battleLogs[battleId].push(BattleLog({
            turn: battle.turn,
            player: msg.sender,
            move: move,
            damage: damage,
            hp1After: battle.hp1,
            hp2After: battle.hp2
        }));

        emit BattleMove(battleId, battle.turn, msg.sender, move, damage);

        // Check for battle end
        if (battle.hp1 <= 0 || battle.hp2 <= 0 || battle.turn >= MAX_TURNS) {
            _finishBattle(battle);
            return;
        }

        // In AI mode, AI responds immediately
        if (battle.mode == BattleMode.AI && isPlayer1) {
            _executeAITurn(battle, battleId);

            // Check again after AI move
            if (battle.hp1 <= 0 || battle.hp2 <= 0 || battle.turn >= MAX_TURNS) {
                _finishBattle(battle);
                return;
            }
        }

        // Advance turn in PvP
        if (battle.mode == BattleMode.PvP) {
            battle.isPlayer1Turn = !battle.isPlayer1Turn;
            if (!battle.isPlayer1Turn == false) {
                battle.turn++; // Full round complete
            }
        } else {
            battle.turn++; // Each player action = 1 turn in AI mode
        }
    }

    /* ═══════════════════════════════════════════════════ */
    /*             INTERNAL BATTLE LOGIC                  */
    /* ═══════════════════════════════════════════════════ */

    function _executeMove(
        Battle storage battle,
        bool isPlayer1,
        MoveType move
    ) internal returns (uint16 damage) {
        if (move == MoveType.Attack) {
            damage = _calculateDamage(battle, isPlayer1, false);
            if (isPlayer1) {
                battle.hp2 -= int16(uint16(damage));
            } else {
                battle.hp1 -= int16(uint16(damage));
            }
        } else if (move == MoveType.Ability) {
            // Check cooldown
            uint8 lastUsed = isPlayer1 ? battle.lastAbility1 : battle.lastAbility2;
            if (lastUsed > 0 && battle.turn - lastUsed < ABILITY_COOLDOWN) revert AbilityOnCooldown();

            damage = _calculateDamage(battle, isPlayer1, true);
            if (isPlayer1) {
                battle.hp2 -= int16(uint16(damage));
                battle.lastAbility1 = battle.turn;
            } else {
                battle.hp1 -= int16(uint16(damage));
                battle.lastAbility2 = battle.turn;
            }
        } else if (move == MoveType.Defend) {
            // Defend: reduce incoming damage by 50% for next turn
            if (isPlayer1) {
                battle.defenseBoost1 = 2; // Active for next incoming hit
            } else {
                battle.defenseBoost2 = 2;
            }
            damage = 0;
        } else {
            revert InvalidMove();
        }

        return damage;
    }

    function _calculateDamage(
        Battle storage battle,
        bool isAttackerPlayer1,
        bool isAbility
    ) internal returns (uint16) {
        uint16 attackStat;
        uint16 defenseStat;
        uint8 attackerElement;
        uint8 defenderElement;

        if (isAttackerPlayer1) {
            if (battle.mode == BattleMode.AI && !isAttackerPlayer1) {
                // AI stats - use pseudo-random
                uint256 aiSeed = uint256(keccak256(abi.encodePacked(battle.battleId, battle.turn, "atk")));
                attackStat = uint16(30 + (aiSeed % 60));
                defenseStat = 50; // AI has flat defense
                attackerElement = uint8(aiSeed % 6);
                defenderElement = whaleCards.getCardStats(battle.card1).element;
            } else {
                IWhaleCards.CardStats memory atkStats = whaleCards.getCardStats(battle.card1);
                attackStat = atkStats.attack;
                attackerElement = atkStats.element;

                if (battle.mode == BattleMode.AI) {
                    uint256 aiSeed = uint256(keccak256(abi.encodePacked(battle.battleId, battle.turn, "def")));
                    defenseStat = uint16(30 + (aiSeed % 50));
                    defenderElement = uint8(aiSeed % 6);
                } else {
                    IWhaleCards.CardStats memory defStats = whaleCards.getCardStats(battle.card2);
                    defenseStat = defStats.defense;
                    defenderElement = defStats.element;
                }
            }
        } else {
            if (battle.mode == BattleMode.AI) {
                uint256 aiSeed = uint256(keccak256(abi.encodePacked(battle.battleId, battle.turn, "aiatk")));
                attackStat = uint16(30 + (aiSeed % 55));
                attackerElement = uint8(aiSeed % 6);
            } else {
                IWhaleCards.CardStats memory atkStats = whaleCards.getCardStats(battle.card2);
                attackStat = atkStats.attack;
                attackerElement = atkStats.element;
            }

            IWhaleCards.CardStats memory defStats = whaleCards.getCardStats(battle.card1);
            defenseStat = defStats.defense;
            defenderElement = defStats.element;
        }

        // Base damage formula: attack * (100 / (100 + defense))
        uint256 rawDamage = (uint256(attackStat) * 100) / (100 + uint256(defenseStat));

        // Ability multiplier
        if (isAbility) {
            rawDamage = (rawDamage * ABILITY_POWER_MULTIPLIER) / 100;
        }

        // Element advantage bonus
        if (elementAdvantage[attackerElement] == defenderElement) {
            rawDamage = (rawDamage * ELEMENT_BONUS) / 100;
        }

        // Defense boost (from Defend move)
        if (isAttackerPlayer1 && battle.defenseBoost2 > 0) {
            rawDamage = rawDamage / 2;
            battle.defenseBoost2--;
        } else if (!isAttackerPlayer1 && battle.defenseBoost1 > 0) {
            rawDamage = rawDamage / 2;
            battle.defenseBoost1--;
        }

        // Add small random variance (±10%) using block data
        uint256 variance = uint256(keccak256(abi.encodePacked(block.timestamp, battle.turn, isAttackerPlayer1)));
        uint256 variancePct = 90 + (variance % 21); // 90-110%
        rawDamage = (rawDamage * variancePct) / 100;

        // Minimum damage
        if (rawDamage < BASE_DAMAGE_MIN) rawDamage = BASE_DAMAGE_MIN;

        return uint16(rawDamage > type(uint16).max ? type(uint16).max : rawDamage);
    }

    function _executeAITurn(Battle storage battle, uint256 battleId) internal {
        // AI decision making based on pseudo-random seed
        uint256 aiSeed = uint256(keccak256(abi.encodePacked(battle.battleId, battle.turn, block.timestamp, "ai_decision")));

        MoveType aiMove;
        uint8 aiLastAbility = battle.lastAbility2;
        bool canUseAbility = aiLastAbility == 0 || battle.turn - aiLastAbility >= ABILITY_COOLDOWN;

        uint256 roll = aiSeed % 100;

        if (battle.hp2 < battle.hp2 / 3 && roll < 30) {
            // Low HP: 30% chance to defend
            aiMove = MoveType.Defend;
        } else if (canUseAbility && roll < 40) {
            // 40% chance to use ability if available
            aiMove = MoveType.Ability;
        } else {
            // Default: basic attack
            aiMove = MoveType.Attack;
        }

        uint16 aiDamage = _executeMove(battle, false, aiMove);

        battleLogs[battleId].push(BattleLog({
            turn: battle.turn,
            player: address(this),
            move: aiMove,
            damage: aiDamage,
            hp1After: battle.hp1,
            hp2After: battle.hp2
        }));

        emit BattleMove(battleId, battle.turn, address(this), aiMove, aiDamage);
    }

    function _finishBattle(Battle storage battle) internal {
        battle.status = BattleStatus.Finished;
        battle.finishedAt = block.timestamp;

        // Determine winner
        if (battle.hp1 <= 0 && battle.hp2 <= 0) {
            // Draw (both KO'd same turn or timeout)
            battle.winner = address(0);
            playerRecords[battle.player1].draws++;
            if (battle.player2 != address(this)) {
                playerRecords[battle.player2].draws++;
            }
        } else if (battle.hp2 <= 0 || battle.hp1 > battle.hp2) {
            // Player 1 wins
            battle.winner = battle.player1;
            _recordWin(battle.player1);
            if (battle.player2 != address(this)) {
                _recordLoss(battle.player2);
            }
        } else {
            // Player 2 wins
            battle.winner = battle.player2;
            if (battle.player2 != address(this)) {
                _recordWin(battle.player2);
            }
            _recordLoss(battle.player1);
        }

        // Clear active battles
        activeBattle[battle.player1] = 0;
        if (battle.player2 != address(this)) {
            activeBattle[battle.player2] = 0;
        }

        totalBattlesPlayed++;
        emit BattleFinished(battle.battleId, battle.winner, battle.turn);
    }

    function _recordWin(address player) internal {
        PlayerRecord storage record = playerRecords[player];
        record.wins++;
        record.totalBattles++;
        record.winStreak++;
        if (record.winStreak > record.bestStreak) {
            record.bestStreak = record.winStreak;
        }
        // Track wins for current season
        seasonWins[currentSeason][player]++;
    }

    function _recordLoss(address player) internal {
        PlayerRecord storage record = playerRecords[player];
        record.losses++;
        record.totalBattles++;
        record.winStreak = 0;
    }

    function _validateCard(address player, uint256 cardId) internal view {
        if (whaleCards.ownerOf(cardId) != player) revert NotCardOwner();
        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);
        if (!stats.isSet) revert CardStatsNotSet();
    }

    /* ═══════════════════════════════════════════════════ */
    /*                   CANCELLATION                     */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Cancel an open battle (only creator, before someone joins)
    /// @dev Refunds the entry fee to the creator
    function cancelBattle(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.player1 != msg.sender) revert NotBattleParticipant();
        if (battle.status != BattleStatus.Open) revert BattleNotOpen();

        battle.status = BattleStatus.Cancelled;
        activeBattle[msg.sender] = 0;

        // Refund entry fee from prize pool + platform fees
        if (entryFee > 0) {
            uint256 platformCut = (entryFee * platformFeeBps) / 10000;
            uint256 poolContribution = entryFee - platformCut;
            prizePool -= poolContribution;
            platformFees -= platformCut;
            pathUSD.transfer(msg.sender, entryFee);
        }

        emit BattleCancelled(battleId);
    }

    /* ═══════════════════════════════════════════════════ */
    /*              SEASON & PRIZE POOL                   */
    /* ═══════════════════════════════════════════════════ */

    /// @notice End the current season and set rankings
    /// @param topPlayers Ordered array of top player addresses (1st place first)
    /// @dev Only callable by owner after season duration has passed
    function endSeason(address[] calldata topPlayers) external onlyOwner {
        if (block.timestamp < seasonStart + seasonDuration) revert SeasonStillActive();
        if (topPlayers.length > prizeDistribution.length) revert InvalidRank();

        uint256 season = currentSeason;
        uint256 pool = prizePool;

        // Store rankings
        for (uint256 i = 0; i < topPlayers.length; i++) {
            seasonRankings[season][i] = topPlayers[i];
        }

        // Store prize pool for this season
        seasonPrizePool[season] = pool;

        // Reset for next season
        prizePool = 0;
        currentSeason++;
        seasonStart = block.timestamp;

        emit SeasonEnded(season, pool, topPlayers);
    }

    /// @notice Claim your prize from a completed season
    /// @param season The season number to claim from
    /// @param rank Your rank in that season (0-indexed: 0 = 1st place)
    function claimPrize(uint256 season, uint256 rank) external nonReentrant {
        if (season >= currentSeason) revert SeasonNotEnded();
        if (rank >= prizeDistribution.length) revert InvalidRank();
        if (seasonRankings[season][rank] != msg.sender) revert NotRankedPlayer();
        if (prizeClaimed[season][rank]) revert AlreadyClaimed();

        uint256 pool = seasonPrizePool[season];
        uint256 prizeAmount = (pool * prizeDistribution[rank]) / 10000;

        prizeClaimed[season][rank] = true;
        pathUSD.transfer(msg.sender, prizeAmount);

        emit PrizeClaimed(season, rank, msg.sender, prizeAmount);
    }

    /// @notice Get the prize amount for a given rank in a season
    function getPrizeAmount(uint256 season, uint256 rank) external view returns (uint256) {
        if (rank >= prizeDistribution.length) return 0;
        return (seasonPrizePool[season] * prizeDistribution[rank]) / 10000;
    }

    /// @notice Get time remaining in current season
    function seasonTimeRemaining() external view returns (uint256) {
        uint256 end = seasonStart + seasonDuration;
        if (block.timestamp >= end) return 0;
        return end - block.timestamp;
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     ADMIN                          */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Update the entry fee per battle
    function setEntryFee(uint256 _fee) external onlyOwner {
        emit EntryFeeUpdated(entryFee, _fee);
        entryFee = _fee;
    }

    /// @notice Update platform fee percentage
    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_PLATFORM_FEE) revert InvalidFee();
        platformFeeBps = _feeBps;
    }

    /// @notice Update season duration
    function setSeasonDuration(uint256 _duration) external onlyOwner {
        seasonDuration = _duration;
    }

    /// @notice Update prize distribution percentages
    /// @param _distribution Array of percentages in basis points (must sum to 10000)
    function setPrizeDistribution(uint256[] calldata _distribution) external onlyOwner {
        uint256 total = 0;
        for (uint256 i = 0; i < _distribution.length; i++) {
            total += _distribution[i];
        }
        require(total == 10000, "Must sum to 10000");

        delete prizeDistribution;
        for (uint256 i = 0; i < _distribution.length; i++) {
            prizeDistribution.push(_distribution[i]);
        }
    }

    /// @notice Withdraw accumulated platform fees
    function withdrawPlatformFees(address to) external onlyOwner {
        uint256 amount = platformFees;
        platformFees = 0;
        pathUSD.transfer(to, amount);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     VIEWS                          */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Get full battle state
    function getBattle(uint256 battleId) external view returns (Battle memory) {
        return battles[battleId];
    }

    /// @notice Get battle log for a battle
    function getBattleLog(uint256 battleId) external view returns (BattleLog[] memory) {
        return battleLogs[battleId];
    }

    /// @notice Get a player's record
    function getPlayerRecord(address player) external view returns (PlayerRecord memory) {
        return playerRecords[player];
    }

    /// @notice Get all open battles waiting for opponents
    function getOpenBattles(uint256 offset, uint256 limit) external view returns (Battle[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= nextBattleId && count < limit; i++) {
            if (battles[i].status == BattleStatus.Open) count++;
        }

        Battle[] memory openBattles = new Battle[](count);
        uint256 idx = 0;
        uint256 skipped = 0;

        for (uint256 i = 1; i <= nextBattleId && idx < count; i++) {
            if (battles[i].status == BattleStatus.Open) {
                if (skipped >= offset) {
                    openBattles[idx++] = battles[i];
                } else {
                    skipped++;
                }
            }
        }

        return openBattles;
    }

    /// @notice Check if a player has an element advantage
    function hasElementAdvantage(uint8 attackerElement, uint8 defenderElement) external view returns (bool) {
        return elementAdvantage[attackerElement] == defenderElement;
    }

    /// @notice Check if ability is off cooldown for a player in a battle
    function canUseAbility(uint256 battleId, bool isPlayer1) external view returns (bool) {
        Battle memory battle = battles[battleId];
        uint8 lastUsed = isPlayer1 ? battle.lastAbility1 : battle.lastAbility2;
        if (lastUsed == 0) return true;
        return battle.turn - lastUsed >= ABILITY_COOLDOWN;
    }

    /// @notice Get current pool and season info
    function getPoolInfo() external view returns (
        uint256 currentPool,
        uint256 season,
        uint256 seasonEnd,
        uint256 totalBattles,
        uint256 currentEntryFee,
        uint256 distributionSlots
    ) {
        return (
            prizePool,
            currentSeason,
            seasonStart + seasonDuration,
            totalBattlesPlayed,
            entryFee,
            prizeDistribution.length
        );
    }

    /// @notice Get a player's season wins
    function getSeasonWins(uint256 season, address player) external view returns (uint32) {
        return seasonWins[season][player];
    }

    /// @notice Get the full prize distribution array
    function getPrizeDistribution() external view returns (uint256[] memory) {
        return prizeDistribution;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BattleArena - Whalemon TCG On-Chain Battle System
/// @author Whalemon TCG on Tempo Network
/// @notice Fully decentralised turn-based battles between Whalemon cards.
/// @dev Entry fee in PATHUSD (6 decimals). Prize pool accumulates automatically
///      each season and is distributed to top players when the owner calls endSeason.
///      Unclaimed prizes after the claim window sweep into the next season's pool.

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

    uint8  public constant MAX_TURNS                = 30;
    uint16 public constant ELEMENT_BONUS            = 150;
    uint16 public constant ABILITY_COOLDOWN         = 3;
    uint16 public constant ABILITY_POWER_MULTIPLIER = 180;
    uint16 public constant BASE_DAMAGE_MIN          = 5;
    uint256 public constant MAX_PLATFORM_FEE        = 2000; // 20%
    uint256 public constant MAX_MULTIPLIER          = 50;

    /* ═══════════════════════════════════════════════════ */
    /*                     ENUMS                          */
    /* ═══════════════════════════════════════════════════ */

    enum BattleStatus { Open, Active, Finished, Cancelled }
    enum MoveType     { Attack, Ability, Defend }
    enum BattleMode   { PvP, AI }

    /* ═══════════════════════════════════════════════════ */
    /*                    STRUCTS                         */
    /* ═══════════════════════════════════════════════════ */

    struct Battle {
        uint256 battleId;
        address player1;
        address player2;
        uint256 card1;
        uint256 card2;
        int16   hp1;
        int16   hp2;
        uint8   turn;
        uint8   lastAbility1;
        uint8   lastAbility2;
        bool    isPlayer1Turn;
        uint8   defenseBoost1;
        uint8   defenseBoost2;
        BattleStatus status;
        BattleMode   mode;
        address winner;
        uint256 createdAt;
        uint256 finishedAt;
        uint256 lastMoveAt;
        uint32  multiplier;
    }

    struct BattleLog {
        uint8   turn;
        address player;
        MoveType move;
        uint16  damage;
        int16   hp1After;
        int16   hp2After;
    }

    struct PlayerRecord {
        uint32  wins;
        uint32  losses;
        uint32  draws;
        uint32  totalBattles;
        uint32  winStreak;
        uint32  bestStreak;
        uint256 totalDamageDealt;
    }

    /* ═══════════════════════════════════════════════════ */
    /*                 STATE VARIABLES                    */
    /* ═══════════════════════════════════════════════════ */

    uint256 public nextBattleId;
    mapping(uint256 => Battle)       public battles;
    mapping(uint256 => BattleLog[])  public battleLogs;
    mapping(address => PlayerRecord) public playerRecords;
    mapping(address => uint256)      public activeBattle;
    mapping(uint8   => uint8)        public elementAdvantage;

    /// @notice Entry fee per battle in PATHUSD (6 decimals — 1000000 = 1 PATHUSD)
    uint256 public entryFee = 1000000;

    /// @notice Platform cut from entry fees (basis points, 500 = 5%)
    uint256 public platformFeeBps = 500;

    /// @notice Multiplier convenience fee per extra unit (6 decimals — 100000 = 0.1 PATHUSD)
    uint256 public multiplierFeePerUnit = 100000;

    uint256 public prizePool;
    uint256 public platformFees;
    uint256 public currentSeason = 1;
    uint256 public seasonStart;
    uint256 public seasonDuration = 30 days;

    /// @notice How long players have to claim after a season ends (default 90 days)
    uint256 public claimWindow = 90 days;

    /// @notice Inactivity timeout in seconds — default 30 minutes
    uint256 public inactivityTimeout = 30 minutes;

    // ── Prize structure (live — used as template when endSeason is called) ──
    /// @notice Individual prize shares for top tier players (basis points each)
    uint256[] public topTierShares;

    /// @notice Total number of rewarded players (top tier + equal-share tier)
    /// @dev This is just the maximum cap. The actual count is passed to endSeason.
    uint256 public totalRewardedPlayers = 25;

    // ── Per-season snapshots (immutable after endSeason) ──
    /// @notice Snapshot of topTierShares at the moment endSeason was called
    mapping(uint256 => uint256[]) public seasonTopTierShares;
    /// @notice Actual number of players rewarded that season (length of rankedPlayers array)
    mapping(uint256 => uint256)   public seasonTotalRewarded;
    /// @notice Prize pool snapshotted at season end
    mapping(uint256 => uint256)   public seasonPrizePool;
    /// @notice Deadline after which unclaimed prizes can be swept to next season
    mapping(uint256 => uint256)   public seasonClaimDeadline;
    /// @notice Whether unclaimed prizes for a season have been swept
    mapping(uint256 => bool)      public seasonSwept;

    // ── Rankings & claims ──
    mapping(uint256 => mapping(uint256 => address)) public seasonRankings;
    mapping(uint256 => mapping(uint256 => bool))    public prizeClaimed;

    // ── Win tracking ──
    mapping(uint256 => mapping(address => uint32))  public seasonWins;
    mapping(uint256 => mapping(address => uint32))  public seasonPvPWins;
    mapping(uint256 => mapping(address => uint32))  public seasonAIWins;

    // ── Participation tracking (for efficient frontend queries) ──
    mapping(uint256 => mapping(address => bool))    public participated;

    uint256 public totalBattlesPlayed;

    /// @notice Blacklisted addresses — blocked from creating/joining battles
    mapping(address => bool) public blacklisted;

    /* ═══════════════════════════════════════════════════ */
    /*                     EVENTS                         */
    /* ═══════════════════════════════════════════════════ */

    event BattleCreated(uint256 indexed battleId, address indexed player1, uint256 card1, BattleMode mode);
    event BattleJoined(uint256 indexed battleId, address indexed player2, uint256 card2);
    event BattleMove(uint256 indexed battleId, uint8 turn, address indexed player, MoveType move, uint16 damage);
    event BattleFinished(uint256 indexed battleId, address indexed winner, uint8 totalTurns);
    event BattleCancelled(uint256 indexed battleId);
    event BattleForfeited(uint256 indexed battleId, address indexed forfeiter);
    event BattleAbandoned(uint256 indexed battleId, address indexed abandoner);
    event InactivityClaimed(uint256 indexed battleId, address indexed claimant, address indexed inactive);
    event EntryFeePaid(address indexed player, uint256 amount, uint256 toPool, uint256 toPlatform);
    event SeasonEnded(uint256 indexed season, uint256 prizePool, uint256 playerCount);
    event PrizeClaimed(uint256 indexed season, uint256 rank, address indexed player, uint256 amount);
    event UnclaimedSwept(uint256 indexed season, uint256 amount);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event InactivityTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event ClaimWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event PrizePoolCleared(address indexed to, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    event PlayerRanked(uint256 indexed season, uint256 indexed rank, address indexed player);
    event BattleDraw(uint256 indexed battleId, address indexed player1, address indexed player2, uint256 refundEach);
    event MultiplierFeeUpdated(uint256 oldFee, uint256 newFee);
    event Blacklisted(address indexed account, bool status);

    /* ═══════════════════════════════════════════════════ */
    /*                   CUSTOM ERRORS                    */
    /* ═══════════════════════════════════════════════════ */

    error NotCardOwner();
    error CardStatsNotSet();
    error AlreadyInBattle();
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
    error ForfeitNotAllowed();
    error NothingToWithdraw();
    error InactivityNotReached();
    error NotOpponent();
    error ClaimWindowStillOpen();
    error AlreadySwept();
    error TooManyPlayers();
    error SharesMustSumTo10000();
    error SharesMustLeavRemainder();
    error TopTierExceedsTotal();
    error DuplicateRankedPlayer();
    error TooManyRewardedPlayers();
    error InvalidMultiplier();
    error AccountBlacklisted();

    /* ═══════════════════════════════════════════════════ */
    /*                   CONSTRUCTOR                      */
    /* ═══════════════════════════════════════════════════ */

    constructor(address _whaleCards, address _pathUSD) Ownable(msg.sender) {
        whaleCards = IWhaleCards(_whaleCards);
        pathUSD    = IPATHUSD(_pathUSD);

        elementAdvantage[0] = 3;
        elementAdvantage[3] = 4;
        elementAdvantage[4] = 1;
        elementAdvantage[1] = 5;
        elementAdvantage[5] = 2;
        elementAdvantage[2] = 0;

        seasonStart = block.timestamp;

        // Default prize structure — can be overridden any time before endSeason
        // Top 5 individual: 30% 20% 15% 10% 7% = 82%
        // Remaining 18% split equally among players 6 to totalRewardedPlayers
        topTierShares.push(3000);
        topTierShares.push(2000);
        topTierShares.push(1500);
        topTierShares.push(1000);
        topTierShares.push(700);
    }

    /* ═══════════════════════════════════════════════════ */
    /*               ENTRY FEE HANDLING                   */
    /* ═══════════════════════════════════════════════════ */

    function _chargeEntryFee(address player, uint32 mult) internal {
        if (entryFee == 0) return;
        uint256 baseTotal     = entryFee * mult;
        uint256 convenienceFee = mult > 1 ? (mult - 1) * multiplierFeePerUnit : 0;
        uint256 totalCharge   = baseTotal + convenienceFee;
        if (pathUSD.allowance(player, address(this)) < totalCharge) revert InsufficientAllowance();
        uint256 platformCut      = (baseTotal * platformFeeBps) / 10000;
        uint256 poolContribution = baseTotal - platformCut;
        pathUSD.transferFrom(player, address(this), totalCharge);
        prizePool    += poolContribution;
        platformFees += platformCut + convenienceFee;
        emit EntryFeePaid(player, totalCharge, poolContribution, platformCut + convenienceFee);
    }

    function _refundEntryFee(address player, uint32 mult) internal {
        if (entryFee == 0) return;
        uint256 baseTotal        = entryFee * mult;
        // Convenience fee is NOT refunded
        uint256 platformCut      = (baseTotal * platformFeeBps) / 10000;
        uint256 poolContribution = baseTotal - platformCut;
        prizePool    -= poolContribution;
        platformFees -= platformCut;
        pathUSD.transfer(player, baseTotal);
    }

    /* ═══════════════════════════════════════════════════ */
    /*               BATTLE CREATION                      */
    /* ═══════════════════════════════════════════════════ */

    function createBattle(uint256 cardId, uint32 multiplier) external nonReentrant returns (uint256) {
        if (blacklisted[msg.sender]) revert AccountBlacklisted();
        _validateCard(msg.sender, cardId);
        if (activeBattle[msg.sender] != 0) revert AlreadyInBattle();
        if (multiplier == 0 || multiplier > MAX_MULTIPLIER) revert InvalidMultiplier();
        _chargeEntryFee(msg.sender, multiplier);
        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);
        uint256 battleId = ++nextBattleId;
        battles[battleId] = Battle({
            battleId: battleId, player1: msg.sender, player2: address(0),
            card1: cardId, card2: 0, hp1: int16(stats.health), hp2: 0,
            turn: 0, lastAbility1: 0, lastAbility2: 0, isPlayer1Turn: true,
            defenseBoost1: 0, defenseBoost2: 0, status: BattleStatus.Open,
            mode: BattleMode.PvP, winner: address(0),
            createdAt: block.timestamp, finishedAt: 0, lastMoveAt: block.timestamp,
            multiplier: multiplier
        });
        activeBattle[msg.sender] = battleId;
        emit BattleCreated(battleId, msg.sender, cardId, BattleMode.PvP);
        return battleId;
    }

    function createAIBattle(uint256 cardId, uint32 multiplier) external nonReentrant returns (uint256) {
        if (blacklisted[msg.sender]) revert AccountBlacklisted();
        _validateCard(msg.sender, cardId);
        if (activeBattle[msg.sender] != 0) revert AlreadyInBattle();
        if (multiplier == 0 || multiplier > MAX_MULTIPLIER) revert InvalidMultiplier();
        _chargeEntryFee(msg.sender, multiplier);
        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);
        uint256 battleId = ++nextBattleId;
        // Improved AI seed: mix prevrandao, msg.sender, nonce for unpredictability
        uint256 aiSeed = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, battleId, cardId, msg.sender, totalBattlesPlayed
        )));
        int16 aiHp = int16(uint16(80 + (aiSeed % 180)));
        battles[battleId] = Battle({
            battleId: battleId, player1: msg.sender, player2: address(this),
            card1: cardId, card2: 0, hp1: int16(stats.health), hp2: aiHp,
            turn: 1, lastAbility1: 0, lastAbility2: 0, isPlayer1Turn: true,
            defenseBoost1: 0, defenseBoost2: 0, status: BattleStatus.Active,
            mode: BattleMode.AI, winner: address(0),
            createdAt: block.timestamp, finishedAt: 0, lastMoveAt: block.timestamp,
            multiplier: multiplier
        });
        activeBattle[msg.sender] = battleId;
        emit BattleCreated(battleId, msg.sender, cardId, BattleMode.AI);
        return battleId;
    }

    function joinBattle(uint256 battleId, uint256 cardId) external nonReentrant {
        if (blacklisted[msg.sender]) revert AccountBlacklisted();
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.Open)        revert BattleNotOpen();
        if (battle.player1 == msg.sender)              revert CannotFightYourself();
        if (activeBattle[msg.sender] != 0)             revert AlreadyInBattle();
        _validateCard(msg.sender, cardId);
        _chargeEntryFee(msg.sender, battle.multiplier);
        IWhaleCards.CardStats memory stats  = whaleCards.getCardStats(cardId);
        IWhaleCards.CardStats memory stats1 = whaleCards.getCardStats(battle.card1);
        battle.player2       = msg.sender;
        battle.card2         = cardId;
        battle.hp2           = int16(stats.health);
        battle.status        = BattleStatus.Active;
        battle.turn          = 1;
        battle.lastMoveAt    = block.timestamp;
        battle.isPlayer1Turn = stats1.speed >= stats.speed;
        activeBattle[msg.sender] = battleId;
        emit BattleJoined(battleId, msg.sender, cardId);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                 BATTLE MOVES                       */
    /* ═══════════════════════════════════════════════════ */

    function makeMove(uint256 battleId, MoveType move) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.Active)   revert BattleNotActive();
        if (battle.status == BattleStatus.Finished) revert BattleAlreadyFinished();
        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2) revert NotBattleParticipant();
        if (battle.mode == BattleMode.PvP) {
            if (isPlayer1 && !battle.isPlayer1Turn) revert NotYourTurn();
            if (isPlayer2 &&  battle.isPlayer1Turn) revert NotYourTurn();
        }
        uint16 damage = _executeMove(battle, isPlayer1, move);
        battle.lastMoveAt = block.timestamp;
        battleLogs[battleId].push(BattleLog({
            turn: battle.turn, player: msg.sender, move: move, damage: damage,
            hp1After: battle.hp1, hp2After: battle.hp2
        }));
        emit BattleMove(battleId, battle.turn, msg.sender, move, damage);
        if (battle.hp1 <= 0 || battle.hp2 <= 0 || battle.turn >= MAX_TURNS) {
            _finishBattle(battle); return;
        }
        if (battle.mode == BattleMode.AI && isPlayer1) {
            _executeAITurn(battle, battleId);
            if (battle.hp1 <= 0 || battle.hp2 <= 0 || battle.turn >= MAX_TURNS) {
                _finishBattle(battle); return;
            }
        }
        if (battle.mode == BattleMode.PvP) {
            battle.isPlayer1Turn = !battle.isPlayer1Turn;
            if (!battle.isPlayer1Turn == false) battle.turn++;
        } else {
            battle.turn++;
        }
    }

    /* ═══════════════════════════════════════════════════ */
    /*                   CANCELLATION                     */
    /* ═══════════════════════════════════════════════════ */

    function cancelBattle(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.player1 != msg.sender)        revert NotBattleParticipant();
        if (battle.status != BattleStatus.Open)  revert BattleNotOpen();
        battle.status = BattleStatus.Cancelled;
        activeBattle[msg.sender] = 0;
        _refundEntryFee(msg.sender, battle.multiplier);
        emit BattleCancelled(battleId);
    }

    function forfeitBattle(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2)              revert NotBattleParticipant();
        if (battle.status != BattleStatus.Active)  revert BattleNotActive();
        if (battle.turn > 2)                       revert ForfeitNotAllowed();
        battle.status     = BattleStatus.Cancelled;
        battle.finishedAt = block.timestamp;
        activeBattle[battle.player1] = 0;
        if (battle.player2 != address(this)) activeBattle[battle.player2] = 0;
        if (battle.mode == BattleMode.AI) {
            _refundEntryFee(battle.player1, battle.multiplier);
        } else if (battle.player2 != address(0) && battle.player2 != address(this)) {
            _refundEntryFee(battle.player1, battle.multiplier);
            _refundEntryFee(battle.player2, battle.multiplier);
        } else {
            _refundEntryFee(battle.player1, battle.multiplier);
        }
        emit BattleForfeited(battleId, msg.sender);
        emit BattleCancelled(battleId);
    }

    function abandonBattle(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2)             revert NotBattleParticipant();
        if (battle.status != BattleStatus.Active) revert BattleNotActive();
        battle.status     = BattleStatus.Finished;
        battle.finishedAt = block.timestamp;
        if (isPlayer1) {
            battle.winner = (battle.mode == BattleMode.PvP && battle.player2 != address(0)) ? battle.player2 : address(0);
            _recordLoss(battle.player1);
            if (battle.mode == BattleMode.PvP && battle.player2 != address(this) && battle.player2 != address(0)) {
                _recordWin(battle.player2, battle.mode, battle.multiplier);
            }
        } else {
            battle.winner = battle.player1;
            _recordLoss(battle.player2);
            _recordWin(battle.player1, battle.mode, battle.multiplier);
        }
        activeBattle[battle.player1] = 0;
        if (battle.player2 != address(this)) activeBattle[battle.player2] = 0;
        totalBattlesPlayed++;
        emit BattleAbandoned(battleId, msg.sender);
        emit BattleFinished(battleId, battle.winner, battle.turn);
    }

    /* ═══════════════════════════════════════════════════ */
    /*               INACTIVITY CLAIM                     */
    /* ═══════════════════════════════════════════════════ */

    function claimInactivityWin(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.Active) revert BattleNotActive();
        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2) revert NotBattleParticipant();
        if (block.timestamp < battle.lastMoveAt + inactivityTimeout) revert InactivityNotReached();
        if (battle.mode == BattleMode.PvP) {
            if (isPlayer1 &&  battle.isPlayer1Turn) revert NotOpponent();
            if (isPlayer2 && !battle.isPlayer1Turn) revert NotOpponent();
        }
        battle.finishedAt = block.timestamp;
        if (battle.turn <= 2) {
            battle.status = BattleStatus.Cancelled;
            activeBattle[battle.player1] = 0;
            if (battle.player2 != address(this)) activeBattle[battle.player2] = 0;
            _refundEntryFee(battle.player1, battle.multiplier);
            if (battle.mode == BattleMode.PvP && battle.player2 != address(0) && battle.player2 != address(this)) {
                _refundEntryFee(battle.player2, battle.multiplier);
            }
        } else {
            battle.status = BattleStatus.Finished;
            address inactivePlayer = battle.isPlayer1Turn ? battle.player1 : battle.player2;
            address activePlayer   = battle.isPlayer1Turn ? battle.player2 : battle.player1;
            battle.winner = activePlayer;
            _recordWin(activePlayer, battle.mode, battle.multiplier);
            _recordLoss(inactivePlayer);
            activeBattle[battle.player1] = 0;
            if (battle.player2 != address(this)) activeBattle[battle.player2] = 0;
            totalBattlesPlayed++;
            emit BattleFinished(battleId, activePlayer, battle.turn);
        }
        address inactiveAddr = battle.isPlayer1Turn ? battle.player1 : battle.player2;
        emit InactivityClaimed(battleId, msg.sender, inactiveAddr);
    }

    /* ═══════════════════════════════════════════════════ */
    /*             INTERNAL BATTLE LOGIC                  */
    /* ═══════════════════════════════════════════════════ */

    function _executeMove(Battle storage battle, bool isPlayer1, MoveType move) internal returns (uint16 damage) {
        if (move == MoveType.Attack) {
            damage = _calculateDamage(battle, isPlayer1, false);
            if (isPlayer1) battle.hp2 -= int16(uint16(damage));
            else           battle.hp1 -= int16(uint16(damage));
        } else if (move == MoveType.Ability) {
            uint8 lastUsed = isPlayer1 ? battle.lastAbility1 : battle.lastAbility2;
            if (lastUsed > 0 && battle.turn - lastUsed < ABILITY_COOLDOWN) revert AbilityOnCooldown();
            damage = _calculateDamage(battle, isPlayer1, true);
            if (isPlayer1) { battle.hp2 -= int16(uint16(damage)); battle.lastAbility1 = battle.turn; }
            else           { battle.hp1 -= int16(uint16(damage)); battle.lastAbility2 = battle.turn; }
        } else if (move == MoveType.Defend) {
            if (isPlayer1) battle.defenseBoost1 = 2;
            else           battle.defenseBoost2 = 2;
            damage = 0;
        } else { revert InvalidMove(); }
        return damage;
    }

    function _calculateDamage(Battle storage battle, bool isAttackerPlayer1, bool isAbility) internal returns (uint16) {
        uint16 attackStat; uint16 defenseStat; uint8 attackerElement; uint8 defenderElement;
        if (isAttackerPlayer1) {
            IWhaleCards.CardStats memory atkStats = whaleCards.getCardStats(battle.card1);
            attackStat = atkStats.attack; attackerElement = atkStats.element;
            if (battle.mode == BattleMode.AI) {
                uint256 aiSeed = uint256(keccak256(abi.encodePacked(block.prevrandao, battle.battleId, battle.turn, msg.sender, "def")));
                defenseStat = uint16(30 + (aiSeed % 50)); defenderElement = uint8(aiSeed % 6);
            } else {
                IWhaleCards.CardStats memory defStats = whaleCards.getCardStats(battle.card2);
                defenseStat = defStats.defense; defenderElement = defStats.element;
            }
        } else {
            if (battle.mode == BattleMode.AI) {
                uint256 aiSeed = uint256(keccak256(abi.encodePacked(block.prevrandao, battle.battleId, battle.turn, msg.sender, "aiatk")));
                attackStat = uint16(30 + (aiSeed % 55)); attackerElement = uint8(aiSeed % 6);
            } else {
                IWhaleCards.CardStats memory atkStats = whaleCards.getCardStats(battle.card2);
                attackStat = atkStats.attack; attackerElement = atkStats.element;
            }
            IWhaleCards.CardStats memory defStats = whaleCards.getCardStats(battle.card1);
            defenseStat = defStats.defense; defenderElement = defStats.element;
        }
        uint256 rawDamage = (uint256(attackStat) * 100) / (100 + uint256(defenseStat));
        if (isAbility) rawDamage = (rawDamage * ABILITY_POWER_MULTIPLIER) / 100;
        if (elementAdvantage[attackerElement] == defenderElement) rawDamage = (rawDamage * ELEMENT_BONUS) / 100;
        if (isAttackerPlayer1 && battle.defenseBoost2 > 0) { rawDamage = rawDamage / 2; battle.defenseBoost2--; }
        else if (!isAttackerPlayer1 && battle.defenseBoost1 > 0) { rawDamage = rawDamage / 2; battle.defenseBoost1--; }
        uint256 variance = uint256(keccak256(abi.encodePacked(block.timestamp, battle.turn, isAttackerPlayer1)));
        rawDamage = (rawDamage * (90 + (variance % 21))) / 100;
        if (rawDamage < BASE_DAMAGE_MIN) rawDamage = BASE_DAMAGE_MIN;
        return uint16(rawDamage > type(uint16).max ? type(uint16).max : rawDamage);
    }

    function _executeAITurn(Battle storage battle, uint256 battleId) internal {
        // Improved seed: mix prevrandao, msg.sender, nonce for unpredictability
        uint256 aiSeed = uint256(keccak256(abi.encodePacked(
            block.prevrandao, battle.battleId, battle.turn, block.timestamp,
            msg.sender, totalBattlesPlayed, "ai_decision"
        )));
        MoveType aiMove;
        uint8 aiLastAbility = battle.lastAbility2;
        bool canUseAb = aiLastAbility == 0 || battle.turn - aiLastAbility >= ABILITY_COOLDOWN;
        uint256 roll = aiSeed % 100;

        // Smarter AI: reads battle state and responds intelligently
        int16 aiHpPct = (battle.hp2 * 100) / int16(uint16(80 + 180)); // rough % of max
        int16 playerHpPct = battle.hp1 > 0 ? (battle.hp1 * 100) / int16(uint16(300)) : int16(0);

        if (aiHpPct < 25 && roll < 45) {
            // Low HP — defend more often to survive
            aiMove = MoveType.Defend;
        } else if (canUseAb && battle.defenseBoost1 == 0 && roll < 50) {
            // Player has no defense up — use ability for max damage
            aiMove = MoveType.Ability;
        } else if (canUseAb && playerHpPct < 30 && roll < 60) {
            // Player is low — finish them with ability
            aiMove = MoveType.Ability;
        } else if (battle.defenseBoost1 > 0 && roll < 40) {
            // Player is defending — defend back or wait, don't waste attack
            aiMove = MoveType.Defend;
        } else if (canUseAb && roll < 30) {
            // General ability usage
            aiMove = MoveType.Ability;
        } else if (roll < 15) {
            // Occasional defensive play
            aiMove = MoveType.Defend;
        } else {
            aiMove = MoveType.Attack;
        }

        uint16 aiDamage = _executeMove(battle, false, aiMove);
        battleLogs[battleId].push(BattleLog({
            turn: battle.turn, player: address(this), move: aiMove, damage: aiDamage,
            hp1After: battle.hp1, hp2After: battle.hp2
        }));
        emit BattleMove(battleId, battle.turn, address(this), aiMove, aiDamage);
    }

    function _finishBattle(Battle storage battle) internal {
        battle.status     = BattleStatus.Finished;
        battle.finishedAt = block.timestamp;
        if (battle.hp1 <= 0 && battle.hp2 <= 0) {
            // ── Draw: refund 90% of entry fee to each player, platform keeps 10% ──
            battle.winner = address(0);
            playerRecords[battle.player1].draws++;
            playerRecords[battle.player1].totalBattles++;
            if (battle.player2 != address(this)) {
                playerRecords[battle.player2].draws++;
                playerRecords[battle.player2].totalBattles++;
            }
            // Calculate refund: 90% of (entry fee × multiplier) to each player
            // Convenience fee is NOT refunded
            if (entryFee > 0) {
                uint256 baseTotal      = entryFee * battle.multiplier;
                uint256 refundPerPlayer = (baseTotal * 9000) / 10000; // 90%
                uint256 platformKeep    = baseTotal - refundPerPlayer; // 10% per player
                // Deduct from prize pool and platform fees the original contributions
                uint256 originalPlatformCut      = (baseTotal * platformFeeBps) / 10000;
                uint256 originalPoolContribution = baseTotal - originalPlatformCut;
                // Refund player1
                prizePool    -= originalPoolContribution;
                platformFees -= originalPlatformCut;
                pathUSD.transfer(battle.player1, refundPerPlayer);
                platformFees += platformKeep;
                // Refund player2 (if not AI)
                if (battle.player2 != address(this)) {
                    prizePool    -= originalPoolContribution;
                    platformFees -= originalPlatformCut;
                    pathUSD.transfer(battle.player2, refundPerPlayer);
                    platformFees += platformKeep;
                } else {
                    // AI battle draw: refund the single player's fee portion
                    prizePool    -= originalPoolContribution;
                    platformFees -= originalPlatformCut;
                    // Platform still keeps its cut from the AI side
                    platformFees += platformKeep;
                }
                emit BattleDraw(battle.battleId, battle.player1, battle.player2, refundPerPlayer);
            }
            participated[currentSeason][battle.player1] = true;
            if (battle.player2 != address(this)) participated[currentSeason][battle.player2] = true;
        } else if (battle.hp2 <= 0 || battle.hp1 > battle.hp2) {
            battle.winner = battle.player1;
            _recordWin(battle.player1, battle.mode, battle.multiplier);
            if (battle.player2 != address(this)) _recordLoss(battle.player2);
        } else {
            battle.winner = battle.player2;
            if (battle.player2 != address(this)) _recordWin(battle.player2, battle.mode, battle.multiplier);
            _recordLoss(battle.player1);
        }
        activeBattle[battle.player1] = 0;
        if (battle.player2 != address(this)) activeBattle[battle.player2] = 0;
        totalBattlesPlayed++;
        emit BattleFinished(battle.battleId, battle.winner, battle.turn);
    }

    function _recordWin(address player, BattleMode mode, uint32 mult) internal {
        PlayerRecord storage r = playerRecords[player];
        r.wins      += mult;
        r.totalBattles++;
        r.winStreak += mult;
        if (r.winStreak > r.bestStreak) r.bestStreak = r.winStreak;
        seasonWins[currentSeason][player] += mult;
        if (mode == BattleMode.PvP) {
            seasonPvPWins[currentSeason][player] += mult;
        } else {
            seasonAIWins[currentSeason][player] += mult;
        }
        participated[currentSeason][player] = true;
    }

    function _recordLoss(address player) internal {
        PlayerRecord storage r = playerRecords[player];
        r.losses++; r.totalBattles++; r.winStreak = 0;
        participated[currentSeason][player] = true;
    }

    function _validateCard(address player, uint256 cardId) internal view {
        if (whaleCards.ownerOf(cardId) != player) revert NotCardOwner();
        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);
        if (!stats.isSet) revert CardStatsNotSet();
    }

    /* ═══════════════════════════════════════════════════ */
    /*              SEASON & PRIZE POOL                   */
    /* ═══════════════════════════════════════════════════ */

    /// @notice End the current season and record the ranked players.
    /// @dev Call this after querying seasonWins off-chain, sorting by wins,
    ///      and deciding how many players to reward this season.
    ///      The prize structure (topTierShares, totalRewardedPlayers) is snapshotted
    ///      at this moment — subsequent calls to setPrizeStructure won't affect it.
    /// @param rankedPlayers Sorted array of player addresses, rank 0 = 1st place.
    ///        Length can be anything up to totalRewardedPlayers. Fewer is fine.
    function endSeason(address[] calldata rankedPlayers) external onlyOwner {
        if (block.timestamp < seasonStart + seasonDuration) revert SeasonStillActive();
        if (rankedPlayers.length > totalRewardedPlayers)    revert TooManyPlayers();

        uint256 season = currentSeason;
        uint256 pool   = prizePool;

        // ── Snapshot prize structure as-is right now ──
        // This protects past season claims from future setPrizeStructure calls.
        delete seasonTopTierShares[season];
        for (uint256 i = 0; i < topTierShares.length; i++) {
            seasonTopTierShares[season].push(topTierShares[i]);
        }

        // ── Record actual player count (not the cap) ──
        // This is the denominator for the equal-share calculation.
        seasonTotalRewarded[season]  = rankedPlayers.length;
        seasonPrizePool[season]      = pool;
        seasonClaimDeadline[season]  = block.timestamp + claimWindow;

        // ── Record ranked addresses (with duplicate check) ──
        for (uint256 i = 0; i < rankedPlayers.length; i++) {
            // Check for duplicate addresses
            for (uint256 j = 0; j < i; j++) {
                if (rankedPlayers[j] == rankedPlayers[i]) revert DuplicateRankedPlayer();
            }
            seasonRankings[season][i] = rankedPlayers[i];
            emit PlayerRanked(season, i, rankedPlayers[i]);
        }

        // ── Reset pool and advance season ──
        prizePool = 0;
        currentSeason++;
        seasonStart = block.timestamp;

        emit SeasonEnded(season, pool, rankedPlayers.length);
    }

    /// @notice Claim your prize for a finished season.
    /// @param season  The season number you are claiming for.
    /// @param rank    Your rank (0 = 1st place, 1 = 2nd, etc.)
    function claimPrize(uint256 season, uint256 rank) external nonReentrant {
        if (season >= currentSeason)                     revert SeasonNotEnded();
        if (rank >= seasonTotalRewarded[season])         revert InvalidRank();
        if (seasonRankings[season][rank] != msg.sender)  revert NotRankedPlayer();
        if (prizeClaimed[season][rank])                  revert AlreadyClaimed();

        uint256 prizeAmount = _calculatePrize(season, rank);
        prizeClaimed[season][rank] = true;
        pathUSD.transfer(msg.sender, prizeAmount);
        emit PrizeClaimed(season, rank, msg.sender, prizeAmount);
    }

    /// @notice Calculate a player's prize using the season's snapshotted structure.
    /// @dev Uses seasonTopTierShares (snapshot) and seasonTotalRewarded (actual count).
    ///      Top tier ranks get their individual share of the pool.
    ///      Equal-share ranks split the remainder by the actual number of equal-share players.
    function _calculatePrize(uint256 season, uint256 rank) internal view returns (uint256) {
        uint256 pool              = seasonPrizePool[season];
        uint256[] storage shares  = seasonTopTierShares[season];
        uint256 actualPlayers     = seasonTotalRewarded[season];

        if (rank < shares.length) {
            // Top tier — individual percentage
            return (pool * shares[rank]) / 10000;
        } else {
            // Equal-share tier — split remainder among actual equal-share players
            uint256 topTierTotal = 0;
            for (uint256 i = 0; i < shares.length; i++) topTierTotal += shares[i];
            uint256 remainder         = 10000 - topTierTotal;
            uint256 equalSharePlayers = actualPlayers - shares.length;
            if (equalSharePlayers == 0) return 0;
            return (pool * remainder) / 10000 / equalSharePlayers;
        }
    }

    /// @notice Sweep unclaimed prizes into the next season's prize pool.
    /// @dev Can only be called after the claim window has closed.
    ///      Iterates over all rewarded ranks and sums up unclaimed amounts,
    ///      then adds that total to prizePool (the live accumulator for the next season).
    /// @param season The season to sweep.
    function sweepUnclaimedPrizes(uint256 season) external onlyOwner nonReentrant {
        if (season >= currentSeason)              revert SeasonNotEnded();
        if (block.timestamp <= seasonClaimDeadline[season]) revert ClaimWindowStillOpen();
        if (seasonSwept[season])                  revert AlreadySwept();

        uint256 unclaimed  = 0;
        uint256 totalDistributed = 0;
        uint256 total      = seasonTotalRewarded[season];

        for (uint256 i = 0; i < total; i++) {
            uint256 prizeAmt = _calculatePrize(season, i);
            totalDistributed += prizeAmt;
            if (!prizeClaimed[season][i]) {
                unclaimed += prizeAmt;
            }
        }

        // ── Recover rounding dust: any pool amount not accounted for by prizes ──
        uint256 pool = seasonPrizePool[season];
        uint256 dust = 0;
        if (pool > totalDistributed) {
            dust = pool - totalDistributed;
        }

        seasonSwept[season] = true;

        uint256 totalRecovered = unclaimed + dust;
        if (totalRecovered > 0) {
            prizePool += totalRecovered;
        }

        emit UnclaimedSwept(season, totalRecovered);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     ADMIN                          */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Configure the prize structure for upcoming seasons.
    /// @dev Call this at any point before endSeason. The values are snapshotted
    ///      inside endSeason so changing them mid-claim does not affect past seasons.
    ///
    ///      Two modes:
    ///      A) Top-tier only: _totalRewardedPlayers == _topTierShares.length
    ///         → shares must sum exactly to 10000 (100%)
    ///      B) Mixed: _totalRewardedPlayers > _topTierShares.length
    ///         → shares must sum to less than 10000 so equal-share players get the remainder
    ///
    /// @param _topTierShares          Basis points per rank for top tier (index 0 = 1st place)
    /// @param _totalRewardedPlayers   Maximum total players that can be rewarded in a season
    function setPrizeStructure(
        uint256[] calldata _topTierShares,
        uint256            _totalRewardedPlayers
    ) external onlyOwner {
        if (_topTierShares.length > _totalRewardedPlayers) revert TopTierExceedsTotal();
        if (_totalRewardedPlayers > 500) revert TooManyRewardedPlayers();

        uint256 total = 0;
        for (uint256 i = 0; i < _topTierShares.length; i++) total += _topTierShares[i];

        if (_totalRewardedPlayers == _topTierShares.length) {
            // Top-tier only mode — all rewarded players have an individual share
            if (total != 10000) revert SharesMustSumTo10000();
        } else {
            // Mixed mode — must leave a remainder for the equal-share tier
            if (total >= 10000) revert SharesMustLeavRemainder();
        }

        delete topTierShares;
        for (uint256 i = 0; i < _topTierShares.length; i++) topTierShares.push(_topTierShares[i]);
        totalRewardedPlayers = _totalRewardedPlayers;
    }

    /// @notice Update entry fee (6 decimals — 1000000 = 1 PATHUSD)
    function setEntryFee(uint256 _fee) external onlyOwner {
        emit EntryFeeUpdated(entryFee, _fee);
        entryFee = _fee;
    }

    /// @notice Update inactivity timeout in seconds (e.g. 1800 = 30 minutes)
    function setInactivityTimeout(uint256 _timeout) external onlyOwner {
        emit InactivityTimeoutUpdated(inactivityTimeout, _timeout);
        inactivityTimeout = _timeout;
    }

    /// @notice Update platform fee (basis points, max 2000 = 20%)
    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_PLATFORM_FEE) revert InvalidFee();
        platformFeeBps = _feeBps;
    }

    /// @notice Update season duration in seconds (e.g. 30 days = 2592000)
    function setSeasonDuration(uint256 _duration) external onlyOwner {
        seasonDuration = _duration;
    }

    /// @notice Update the multiplier convenience fee per extra unit (6 decimals)
    function setMultiplierFee(uint256 _feePerUnit) external onlyOwner {
        emit MultiplierFeeUpdated(multiplierFeePerUnit, _feePerUnit);
        multiplierFeePerUnit = _feePerUnit;
    }

    /// @notice Update the claim window duration in seconds (e.g. 90 days)
    function setClaimWindow(uint256 _window) external onlyOwner {
        emit ClaimWindowUpdated(claimWindow, _window);
        claimWindow = _window;
    }

    /// @notice Blacklist or unblacklist an address from battling
    function setBlacklist(address account, bool status) external onlyOwner {
        blacklisted[account] = status;
        emit Blacklisted(account, status);
    }

    /// @notice Withdraw accumulated platform fees to any address.
    function withdrawPlatformFees(address to) external onlyOwner {
        uint256 amount = platformFees;
        if (amount == 0) revert NothingToWithdraw();
        platformFees = 0;
        pathUSD.transfer(to, amount);
    }

    /// @notice Clear the prize pool entirely — rare emergency use only.
    /// @dev Intended for situations like a season reset or contract migration.
    ///      Emits PrizePoolCleared so it is fully auditable.
    function clearPrizePool(address to) external onlyOwner {
        uint256 amount = prizePool;
        if (amount == 0) revert NothingToWithdraw();
        prizePool = 0;
        pathUSD.transfer(to, amount);
        emit PrizePoolCleared(to, amount);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     VIEWS                          */
    /* ═══════════════════════════════════════════════════ */

    function getBattle(uint256 battleId) external view returns (Battle memory) {
        return battles[battleId];
    }

    function getBattleLog(uint256 battleId) external view returns (BattleLog[] memory) {
        return battleLogs[battleId];
    }

    function getPlayerRecord(address player) external view returns (PlayerRecord memory) {
        return playerRecords[player];
    }

    /// @notice Preview what a player would receive for a given season and rank.
    function getPrizeAmount(uint256 season, uint256 rank) external view returns (uint256) {
        if (rank >= seasonTotalRewarded[season]) return 0;
        return _calculatePrize(season, rank);
    }

    /// @notice Seconds remaining in the current season (0 if ended).
    function seasonTimeRemaining() external view returns (uint256) {
        uint256 end = seasonStart + seasonDuration;
        if (block.timestamp >= end) return 0;
        return end - block.timestamp;
    }

    /// @notice Seconds remaining in the claim window for a past season (0 if closed).
    function claimTimeRemaining(uint256 season) external view returns (uint256) {
        uint256 deadline = seasonClaimDeadline[season];
        if (deadline == 0 || block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    function getOpenBattles(uint256 offset, uint256 limit) external view returns (Battle[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= nextBattleId && count < limit; i++) {
            if (battles[i].status == BattleStatus.Open) count++;
        }
        Battle[] memory openBattles = new Battle[](count);
        uint256 idx = 0; uint256 skipped = 0;
        for (uint256 i = 1; i <= nextBattleId && idx < count; i++) {
            if (battles[i].status == BattleStatus.Open) {
                if (skipped >= offset) { openBattles[idx++] = battles[i]; }
                else { skipped++; }
            }
        }
        return openBattles;
    }

    function hasElementAdvantage(uint8 attackerElement, uint8 defenderElement) external view returns (bool) {
        return elementAdvantage[attackerElement] == defenderElement;
    }

    function canUseAbility(uint256 battleId, bool isPlayer1) external view returns (bool) {
        Battle memory battle = battles[battleId];
        uint8 lastUsed = isPlayer1 ? battle.lastAbility1 : battle.lastAbility2;
        if (lastUsed == 0) return true;
        return battle.turn - lastUsed >= ABILITY_COOLDOWN;
    }

    function inactivitySecondsRemaining(uint256 battleId) external view returns (uint256) {
        Battle memory battle = battles[battleId];
        if (battle.status != BattleStatus.Active) return 0;
        uint256 deadline = battle.lastMoveAt + inactivityTimeout;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    function getSeasonWins(uint256 season, address player) external view returns (uint32) {
        return seasonWins[season][player];
    }

    function getSeasonPvPWins(uint256 season, address player) external view returns (uint32) {
        return seasonPvPWins[season][player];
    }

    function getSeasonAIWins(uint256 season, address player) external view returns (uint32) {
        return seasonAIWins[season][player];
    }

    function getTopTierShares() external view returns (uint256[] memory) {
        return topTierShares;
    }

    function getSeasonTopTierShares(uint256 season) external view returns (uint256[] memory) {
        return seasonTopTierShares[season];
    }

    function getPoolInfo() external view returns (
        uint256 currentPool,
        uint256 season,
        uint256 seasonEnd,
        uint256 totalBattles,
        uint256 currentEntryFee,
        uint256 topTierCount,
        uint256 totalRewarded,
        uint256 currentMultiplierFee,
        uint256 currentPlatformFeeBps
    ) {
        return (
            prizePool,
            currentSeason,
            seasonStart + seasonDuration,
            totalBattlesPlayed,
            entryFee,
            topTierShares.length,
            totalRewardedPlayers,
            multiplierFeePerUnit,
            platformFeeBps
        );
    }
}

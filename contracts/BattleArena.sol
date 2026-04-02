// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BattleArena - Whalemon TCG On-Chain Battle System
/// @author Whalemon TCG on Tempo Network
/// @notice Fully decentralised turn-based battles between Whalemon cards.
/// @dev Entry fee in PATHUSD (6 decimals). Prize pool distributed to top players each season.

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
    uint256 public constant MAX_PLATFORM_FEE = 2000;

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
        int16 hp1;
        int16 hp2;
        uint8 turn;
        uint8 lastAbility1;
        uint8 lastAbility2;
        bool isPlayer1Turn;
        uint8 defenseBoost1;
        uint8 defenseBoost2;
        BattleStatus status;
        BattleMode mode;
        address winner;
        uint256 createdAt;
        uint256 finishedAt;
        uint256 lastMoveAt;
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
    mapping(address => uint256) public activeBattle;
    mapping(uint8 => uint8) public elementAdvantage;

    /// @notice Entry fee per battle in PATHUSD (6 decimals — 1000000 = 1 PATHUSD)
    uint256 public entryFee = 1000000;

    /// @notice Platform cut from entry fees (basis points, 1000 = 10%)
    uint256 public platformFeeBps = 1000;

    uint256 public prizePool;
    uint256 public platformFees;
    uint256 public currentSeason = 1;
    uint256 public seasonStart;
    uint256 public seasonDuration = 30 days;

    /// @notice Inactivity timeout in seconds — default 30 minutes, adjustable by owner
    uint256 public inactivityTimeout = 30 minutes;

    /// @notice Number of top tier players with individual prize shares
    uint256 public topTierCount;

    /// @notice Individual prize shares for top tier (basis points each)
    uint256[] public topTierShares;

    /// @notice Total number of rewarded players (top tier + equal share tier)
    uint256 public totalRewardedPlayers = 25;

    mapping(uint256 => mapping(uint256 => address)) public seasonRankings;
    mapping(uint256 => uint256) public seasonPrizePool;
    mapping(uint256 => mapping(uint256 => bool)) public prizeClaimed;
    mapping(uint256 => mapping(address => uint32)) public seasonWins;

    uint256 public totalBattlesPlayed;

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
    event SeasonEnded(uint256 indexed season, uint256 prizePool, address[] topPlayers);
    event PrizeClaimed(uint256 indexed season, uint256 rank, address indexed player, uint256 amount);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event InactivityTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event EmergencyWithdraw(address indexed to, uint256 amount);

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

    /* ═══════════════════════════════════════════════════ */
    /*                   CONSTRUCTOR                      */
    /* ═══════════════════════════════════════════════════ */

    constructor(address _whaleCards, address _pathUSD) Ownable(msg.sender) {
        whaleCards = IWhaleCards(_whaleCards);
        pathUSD = IPATHUSD(_pathUSD);

        elementAdvantage[0] = 3;
        elementAdvantage[3] = 4;
        elementAdvantage[4] = 1;
        elementAdvantage[1] = 5;
        elementAdvantage[5] = 2;
        elementAdvantage[2] = 0;

        seasonStart = block.timestamp;

        // Default: top 5 individual shares, players 6-25 share remainder equally
        // 1st: 30%, 2nd: 20%, 3rd: 15%, 4th: 10%, 5th: 7% = 82% total
        // Remaining 18% split equally among players 6-25 (20 players = 0.9% each)
        topTierShares.push(3000);
        topTierShares.push(2000);
        topTierShares.push(1500);
        topTierShares.push(1000);
        topTierShares.push(700);
        topTierCount = 5;
    }

    /* ═══════════════════════════════════════════════════ */
    /*               ENTRY FEE HANDLING                   */
    /* ═══════════════════════════════════════════════════ */

    function _chargeEntryFee(address player) internal {
        if (entryFee == 0) return;
        if (pathUSD.allowance(player, address(this)) < entryFee) revert InsufficientAllowance();
        uint256 platformCut = (entryFee * platformFeeBps) / 10000;
        uint256 poolContribution = entryFee - platformCut;
        pathUSD.transferFrom(player, address(this), entryFee);
        prizePool += poolContribution;
        platformFees += platformCut;
        emit EntryFeePaid(player, entryFee, poolContribution, platformCut);
    }

    function _refundEntryFee(address player) internal {
        if (entryFee == 0) return;
        uint256 platformCut = (entryFee * platformFeeBps) / 10000;
        uint256 poolContribution = entryFee - platformCut;
        prizePool -= poolContribution;
        platformFees -= platformCut;
        pathUSD.transfer(player, entryFee);
    }

    /* ═══════════════════════════════════════════════════ */
    /*               BATTLE CREATION                      */
    /* ═══════════════════════════════════════════════════ */

    function createBattle(uint256 cardId) external nonReentrant returns (uint256) {
        _validateCard(msg.sender, cardId);
        if (activeBattle[msg.sender] != 0) revert AlreadyInBattle();
        _chargeEntryFee(msg.sender);
        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);
        uint256 battleId = ++nextBattleId;
        battles[battleId] = Battle({
            battleId: battleId, player1: msg.sender, player2: address(0),
            card1: cardId, card2: 0, hp1: int16(stats.health), hp2: 0,
            turn: 0, lastAbility1: 0, lastAbility2: 0, isPlayer1Turn: true,
            defenseBoost1: 0, defenseBoost2: 0, status: BattleStatus.Open,
            mode: BattleMode.PvP, winner: address(0),
            createdAt: block.timestamp, finishedAt: 0, lastMoveAt: block.timestamp
        });
        activeBattle[msg.sender] = battleId;
        emit BattleCreated(battleId, msg.sender, cardId, BattleMode.PvP);
        return battleId;
    }

    function createAIBattle(uint256 cardId) external nonReentrant returns (uint256) {
        _validateCard(msg.sender, cardId);
        if (activeBattle[msg.sender] != 0) revert AlreadyInBattle();
        _chargeEntryFee(msg.sender);
        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);
        uint256 battleId = ++nextBattleId;
        uint256 aiSeed = uint256(keccak256(abi.encodePacked(block.timestamp, battleId, cardId)));
        int16 aiHp = int16(uint16(80 + (aiSeed % 180)));
        battles[battleId] = Battle({
            battleId: battleId, player1: msg.sender, player2: address(this),
            card1: cardId, card2: 0, hp1: int16(stats.health), hp2: aiHp,
            turn: 1, lastAbility1: 0, lastAbility2: 0, isPlayer1Turn: true,
            defenseBoost1: 0, defenseBoost2: 0, status: BattleStatus.Active,
            mode: BattleMode.AI, winner: address(0),
            createdAt: block.timestamp, finishedAt: 0, lastMoveAt: block.timestamp
        });
        activeBattle[msg.sender] = battleId;
        emit BattleCreated(battleId, msg.sender, cardId, BattleMode.AI);
        return battleId;
    }

    function joinBattle(uint256 battleId, uint256 cardId) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.Open) revert BattleNotOpen();
        if (battle.player1 == msg.sender) revert CannotFightYourself();
        if (activeBattle[msg.sender] != 0) revert AlreadyInBattle();
        _validateCard(msg.sender, cardId);
        _chargeEntryFee(msg.sender);
        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);
        battle.player2 = msg.sender;
        battle.card2 = cardId;
        battle.hp2 = int16(stats.health);
        battle.status = BattleStatus.Active;
        battle.turn = 1;
        battle.lastMoveAt = block.timestamp;
        IWhaleCards.CardStats memory stats1 = whaleCards.getCardStats(battle.card1);
        battle.isPlayer1Turn = stats1.speed >= stats.speed;
        activeBattle[msg.sender] = battleId;
        emit BattleJoined(battleId, msg.sender, cardId);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                 BATTLE MOVES                       */
    /* ═══════════════════════════════════════════════════ */

    function makeMove(uint256 battleId, MoveType move) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.Active) revert BattleNotActive();
        if (battle.status == BattleStatus.Finished) revert BattleAlreadyFinished();
        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2) revert NotBattleParticipant();
        if (battle.mode == BattleMode.PvP) {
            if (isPlayer1 && !battle.isPlayer1Turn) revert NotYourTurn();
            if (isPlayer2 && battle.isPlayer1Turn) revert NotYourTurn();
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

    /// @notice Cancel an open PvP battle before anyone joins — full refund
    function cancelBattle(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.player1 != msg.sender) revert NotBattleParticipant();
        if (battle.status != BattleStatus.Open) revert BattleNotOpen();
        battle.status = BattleStatus.Cancelled;
        activeBattle[msg.sender] = 0;
        _refundEntryFee(msg.sender);
        emit BattleCancelled(battleId);
    }

    /// @notice Forfeit an active battle — only allowed on turn 1 or 2
    /// @dev Full refund to all players, no win/loss recorded.
    function forfeitBattle(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2) revert NotBattleParticipant();
        if (battle.status != BattleStatus.Active) revert BattleNotActive();
        if (battle.turn > 2) revert ForfeitNotAllowed();

        battle.status = BattleStatus.Cancelled;
        battle.finishedAt = block.timestamp;

        activeBattle[battle.player1] = 0;
        if (battle.player2 != address(this)) activeBattle[battle.player2] = 0;

        if (battle.mode == BattleMode.AI) {
            _refundEntryFee(battle.player1);
        } else if (battle.player2 != address(0) && battle.player2 != address(this)) {
            _refundEntryFee(battle.player1);
            _refundEntryFee(battle.player2);
        } else {
            _refundEntryFee(battle.player1);
        }

        emit BattleForfeited(battleId, msg.sender);
        emit BattleCancelled(battleId);
    }

    /// @notice Abandon a battle after turn 2 — counts as a loss, no refund
    function abandonBattle(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2) revert NotBattleParticipant();
        if (battle.status != BattleStatus.Active) revert BattleNotActive();

        battle.status = BattleStatus.Finished;
        battle.finishedAt = block.timestamp;

        if (isPlayer1) {
            battle.winner = (battle.mode == BattleMode.PvP && battle.player2 != address(0)) ? battle.player2 : address(0);
            _recordLoss(battle.player1);
            if (battle.mode == BattleMode.PvP && battle.player2 != address(this) && battle.player2 != address(0)) {
                _recordWin(battle.player2);
            }
        } else {
            battle.winner = battle.player1;
            _recordLoss(battle.player2);
            _recordWin(battle.player1);
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

    /// @notice Claim a win or refund if opponent has been inactive past the timeout
    /// @dev If within safe zone (turn <= 2): both players refunded, no record.
    ///      If past safe zone (turn > 2): inactive player loses, claimant wins.
    ///      Only the active (non-inactive) player can call this.
    function claimInactivityWin(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.Active) revert BattleNotActive();

        bool isPlayer1 = msg.sender == battle.player1;
        bool isPlayer2 = msg.sender == battle.player2;
        if (!isPlayer1 && !isPlayer2) revert NotBattleParticipant();

        // Check inactivity timeout has passed
        if (block.timestamp < battle.lastMoveAt + inactivityTimeout) revert InactivityNotReached();

        // In PvP: claimant must be the one whose turn it is NOT (i.e. they are waiting)
        // In AI: only player1 can claim (AI can't be inactive)
        if (battle.mode == BattleMode.PvP) {
            if (isPlayer1 && battle.isPlayer1Turn) revert NotOpponent(); // it's player1's turn, they're the inactive one
            if (isPlayer2 && !battle.isPlayer1Turn) revert NotOpponent(); // it's player2's turn, they're the inactive one
        }

        battle.finishedAt = block.timestamp;

        if (battle.turn <= 2) {
            // Safe zone — full refund to both, no record
            battle.status = BattleStatus.Cancelled;
            activeBattle[battle.player1] = 0;
            if (battle.player2 != address(this)) activeBattle[battle.player2] = 0;
            _refundEntryFee(battle.player1);
            if (battle.mode == BattleMode.PvP && battle.player2 != address(0) && battle.player2 != address(this)) {
                _refundEntryFee(battle.player2);
            }
        } else {
            // Past safe zone — inactive player loses, claimant wins
            battle.status = BattleStatus.Finished;
            address inactivePlayer = battle.isPlayer1Turn ? battle.player1 : battle.player2;
            address activePlayer  = battle.isPlayer1Turn ? battle.player2 : battle.player1;
            battle.winner = activePlayer;
            _recordWin(activePlayer);
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
            if (isPlayer1) { battle.hp2 -= int16(uint16(damage)); }
            else { battle.hp1 -= int16(uint16(damage)); }
        } else if (move == MoveType.Ability) {
            uint8 lastUsed = isPlayer1 ? battle.lastAbility1 : battle.lastAbility2;
            if (lastUsed > 0 && battle.turn - lastUsed < ABILITY_COOLDOWN) revert AbilityOnCooldown();
            damage = _calculateDamage(battle, isPlayer1, true);
            if (isPlayer1) { battle.hp2 -= int16(uint16(damage)); battle.lastAbility1 = battle.turn; }
            else { battle.hp1 -= int16(uint16(damage)); battle.lastAbility2 = battle.turn; }
        } else if (move == MoveType.Defend) {
            if (isPlayer1) { battle.defenseBoost1 = 2; } else { battle.defenseBoost2 = 2; }
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
                uint256 aiSeed = uint256(keccak256(abi.encodePacked(battle.battleId, battle.turn, "def")));
                defenseStat = uint16(30 + (aiSeed % 50)); defenderElement = uint8(aiSeed % 6);
            } else {
                IWhaleCards.CardStats memory defStats = whaleCards.getCardStats(battle.card2);
                defenseStat = defStats.defense; defenderElement = defStats.element;
            }
        } else {
            if (battle.mode == BattleMode.AI) {
                uint256 aiSeed = uint256(keccak256(abi.encodePacked(battle.battleId, battle.turn, "aiatk")));
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
        uint256 aiSeed = uint256(keccak256(abi.encodePacked(battle.battleId, battle.turn, block.timestamp, "ai_decision")));
        MoveType aiMove;
        uint8 aiLastAbility = battle.lastAbility2;
        bool canUseAb = aiLastAbility == 0 || battle.turn - aiLastAbility >= ABILITY_COOLDOWN;
        uint256 roll = aiSeed % 100;
        if (battle.hp2 < battle.hp2 / 3 && roll < 30) { aiMove = MoveType.Defend; }
        else if (canUseAb && roll < 40) { aiMove = MoveType.Ability; }
        else { aiMove = MoveType.Attack; }
        uint16 aiDamage = _executeMove(battle, false, aiMove);
        battleLogs[battleId].push(BattleLog({ turn: battle.turn, player: address(this), move: aiMove, damage: aiDamage, hp1After: battle.hp1, hp2After: battle.hp2 }));
        emit BattleMove(battleId, battle.turn, address(this), aiMove, aiDamage);
    }

    function _finishBattle(Battle storage battle) internal {
        battle.status = BattleStatus.Finished;
        battle.finishedAt = block.timestamp;
        if (battle.hp1 <= 0 && battle.hp2 <= 0) {
            battle.winner = address(0);
            playerRecords[battle.player1].draws++;
            if (battle.player2 != address(this)) playerRecords[battle.player2].draws++;
        } else if (battle.hp2 <= 0 || battle.hp1 > battle.hp2) {
            battle.winner = battle.player1;
            _recordWin(battle.player1);
            if (battle.player2 != address(this)) _recordLoss(battle.player2);
        } else {
            battle.winner = battle.player2;
            if (battle.player2 != address(this)) _recordWin(battle.player2);
            _recordLoss(battle.player1);
        }
        activeBattle[battle.player1] = 0;
        if (battle.player2 != address(this)) activeBattle[battle.player2] = 0;
        totalBattlesPlayed++;
        emit BattleFinished(battle.battleId, battle.winner, battle.turn);
    }

    function _recordWin(address player) internal {
        PlayerRecord storage r = playerRecords[player];
        r.wins++; r.totalBattles++; r.winStreak++;
        if (r.winStreak > r.bestStreak) r.bestStreak = r.winStreak;
        seasonWins[currentSeason][player]++;
    }

    function _recordLoss(address player) internal {
        PlayerRecord storage r = playerRecords[player];
        r.losses++; r.totalBattles++; r.winStreak = 0;
    }

    function _validateCard(address player, uint256 cardId) internal view {
        if (whaleCards.ownerOf(cardId) != player) revert NotCardOwner();
        IWhaleCards.CardStats memory stats = whaleCards.getCardStats(cardId);
        if (!stats.isSet) revert CardStatsNotSet();
    }

    /* ═══════════════════════════════════════════════════ */
    /*              SEASON & PRIZE POOL                   */
    /* ═══════════════════════════════════════════════════ */

    function endSeason(address[] calldata topPlayers) external onlyOwner {
        if (block.timestamp < seasonStart + seasonDuration) revert SeasonStillActive();
        require(topPlayers.length <= totalRewardedPlayers, "Too many players");
        uint256 season = currentSeason;
        uint256 pool = prizePool;
        for (uint256 i = 0; i < topPlayers.length; i++) seasonRankings[season][i] = topPlayers[i];
        seasonPrizePool[season] = pool;
        prizePool = 0;
        currentSeason++;
        seasonStart = block.timestamp;
        emit SeasonEnded(season, pool, topPlayers);
    }

    function claimPrize(uint256 season, uint256 rank) external nonReentrant {
        if (season >= currentSeason) revert SeasonNotEnded();
        if (rank >= totalRewardedPlayers) revert InvalidRank();
        if (seasonRankings[season][rank] != msg.sender) revert NotRankedPlayer();
        if (prizeClaimed[season][rank]) revert AlreadyClaimed();
        uint256 prizeAmount = _calculatePrize(seasonPrizePool[season], rank);
        prizeClaimed[season][rank] = true;
        pathUSD.transfer(msg.sender, prizeAmount);
        emit PrizeClaimed(season, rank, msg.sender, prizeAmount);
    }

    function _calculatePrize(uint256 pool, uint256 rank) internal view returns (uint256) {
        if (rank < topTierShares.length) {
            return (pool * topTierShares[rank]) / 10000;
        } else {
            uint256 topTierTotal = 0;
            for (uint256 i = 0; i < topTierShares.length; i++) topTierTotal += topTierShares[i];
            uint256 equalSharePlayers = totalRewardedPlayers - topTierShares.length;
            if (equalSharePlayers == 0) return 0;
            return (pool * (10000 - topTierTotal)) / 10000 / equalSharePlayers;
        }
    }

    function getPrizeAmount(uint256 season, uint256 rank) external view returns (uint256) {
        if (rank >= totalRewardedPlayers) return 0;
        return _calculatePrize(seasonPrizePool[season], rank);
    }

    function seasonTimeRemaining() external view returns (uint256) {
        uint256 end = seasonStart + seasonDuration;
        if (block.timestamp >= end) return 0;
        return end - block.timestamp;
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     ADMIN                          */
    /* ═══════════════════════════════════════════════════ */

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

    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_PLATFORM_FEE) revert InvalidFee();
        platformFeeBps = _feeBps;
    }

    function setSeasonDuration(uint256 _duration) external onlyOwner {
        seasonDuration = _duration;
    }

    /// @notice Set prize structure
    function setPrizeStructure(uint256[] calldata _topTierShares, uint256 _totalRewardedPlayers) external onlyOwner {
        require(_totalRewardedPlayers >= _topTierShares.length, "Total must be >= top tier count");
        uint256 total = 0;
        for (uint256 i = 0; i < _topTierShares.length; i++) total += _topTierShares[i];
        require(total < 10000, "Top tier shares must leave remainder for equal-share tier");
        delete topTierShares;
        for (uint256 i = 0; i < _topTierShares.length; i++) topTierShares.push(_topTierShares[i]);
        topTierCount = _topTierShares.length;
        totalRewardedPlayers = _totalRewardedPlayers;
    }

    function withdrawPlatformFees(address to) external onlyOwner {
        uint256 amount = platformFees;
        platformFees = 0;
        pathUSD.transfer(to, amount);
    }

    /// @notice Emergency withdraw prize pool — owner only
    function emergencyWithdrawPrizePool(address to) external onlyOwner {
        uint256 amount = prizePool;
        if (amount == 0) revert NothingToWithdraw();
        prizePool = 0;
        pathUSD.transfer(to, amount);
        emit EmergencyWithdraw(to, amount);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     VIEWS                          */
    /* ═══════════════════════════════════════════════════ */

    function getBattle(uint256 battleId) external view returns (Battle memory) { return battles[battleId]; }
    function getBattleLog(uint256 battleId) external view returns (BattleLog[] memory) { return battleLogs[battleId]; }
    function getPlayerRecord(address player) external view returns (PlayerRecord memory) { return playerRecords[player]; }

    function getOpenBattles(uint256 offset, uint256 limit) external view returns (Battle[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= nextBattleId && count < limit; i++) {
            if (battles[i].status == BattleStatus.Open) count++;
        }
        Battle[] memory openBattles = new Battle[](count);
        uint256 idx = 0; uint256 skipped = 0;
        for (uint256 i = 1; i <= nextBattleId && idx < count; i++) {
            if (battles[i].status == BattleStatus.Open) {
                if (skipped >= offset) { openBattles[idx++] = battles[i]; } else { skipped++; }
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

    /// @notice Returns seconds until inactivity can be claimed, 0 if already claimable
    function inactivitySecondsRemaining(uint256 battleId) external view returns (uint256) {
        Battle memory battle = battles[battleId];
        if (battle.status != BattleStatus.Active) return 0;
        uint256 deadline = battle.lastMoveAt + inactivityTimeout;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    function getPoolInfo() external view returns (
        uint256 currentPool, uint256 season, uint256 seasonEnd,
        uint256 totalBattles, uint256 currentEntryFee,
        uint256 topTier, uint256 totalRewarded
    ) {
        return (prizePool, currentSeason, seasonStart + seasonDuration, totalBattlesPlayed, entryFee, topTierCount, totalRewardedPlayers);
    }

    function getSeasonWins(uint256 season, address player) external view returns (uint32) { return seasonWins[season][player]; }
    function getTopTierShares() external view returns (uint256[] memory) { return topTierShares; }
}

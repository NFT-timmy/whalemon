// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title WhaleCards - Whalemon TCG (Multi-Collection + Crafting + Blacklist)
/// @author Whalemon TCG on Tempo Network
/// @dev SVG rendering delegated to WhalemonRenderer to stay under contract size limit.

interface IERC721Source {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
}

interface IPATHUSD {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IWhalemonRenderer {
    function renderTokenURI(
        uint256 tokenId, uint16 attack, uint16 defense, uint16 health, uint16 speed,
        uint8 element, uint8 rarity, bool isSet, bool isCrafted, string memory imageURI
    ) external view returns (string memory);
}

contract WhaleCards is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard {
    using Strings for uint256;

    struct Collection {
        address contractAddr;
        string name;
        string imageURI;
        bool active;
        uint256 totalMinted;
    }

    struct CardStats {
        uint16 attack; uint16 defense; uint16 health; uint16 speed;
        uint8 element; uint8 rarity; bytes32 abilityHash; bool isSet;
    }

    struct CardOrigin {
        address sourceContract; uint256 sourceTokenId; bool isCrafted;
    }

    struct CraftTier {
        uint8 inputRarity; uint8 outputRarity; uint8 inputCount; uint256 cost; uint8 successRate;
    }

    /* ========== STATE ========== */

    IPATHUSD public immutable pathUSD;
    IWhalemonRenderer public renderer;
    uint256 public nextCardId = 1;

    mapping(uint256 => Collection) public collections;
    uint256 public collectionCount;
    mapping(bytes32 => bool) public cardMinted;
    mapping(uint256 => CardStats) public cardStats;
    mapping(uint256 => CardOrigin) public cardOrigins;
    mapping(uint256 => string) public cardImageURI;

    address public oracle;
    string public baseMetadataURI;
    address public prizePoolTarget;
    uint256 public craftingPlatformFees;
    uint256 public craftingPrizePoolFees;
    CraftTier[4] public craftTiers;

    /// @notice Crafting fee split: basis points going to prize pool (default 5000 = 50%)
    uint256 public craftPoolSplitBps = 5000;

    /// @notice Blacklisted addresses — blocked from minting, crafting, and transferring
    mapping(address => bool) public blacklisted;

    /* ========== EVENTS ========== */

    event CollectionAdded(uint256 indexed collectionId, address indexed contractAddr, string name);
    event CollectionUpdated(uint256 indexed collectionId, bool active);
    event CardMinted(address indexed owner, uint256 indexed cardId, address indexed sourceContract, uint256 sourceTokenId);
    event StatsCommitted(uint256 indexed cardId, uint8 element, uint8 rarity);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event CardCrafted(address indexed owner, uint256 indexed newCardId, uint8 outputRarity, bool success);
    event CraftingFeesWithdrawn(address indexed to, uint256 platformAmount, uint256 prizePoolAmount);
    event Blacklisted(address indexed account, bool status);
    event CraftPoolSplitUpdated(uint256 oldBps, uint256 newBps);

    /* ========== ERRORS ========== */

    error NotNFTOwner();
    error CardAlreadyMinted();
    error StatsAlreadySet();
    error OnlyOracle();
    error CardDoesNotExist();
    error InvalidStats();
    error CollectionNotActive();
    error CollectionNotFound();
    error InvalidCraftInput();
    error CraftInputNotOwned();
    error CraftInputWrongRarity();
    error CraftInputStatsNotSet();
    error CraftInputDifferentCollection();
    error InsufficientAllowance();
    error NothingToWithdraw();
    error AccountBlacklisted();
    error InvalidSplit();

    /* ========== MODIFIERS ========== */

    modifier notBlacklisted(address account) {
        if (blacklisted[account]) revert AccountBlacklisted();
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _pathUSD, address _oracle, address _renderer
    ) ERC721("Whalemon", "WMON") Ownable(msg.sender) {
        pathUSD = IPATHUSD(_pathUSD);
        oracle = _oracle;
        renderer = IWhalemonRenderer(_renderer);
        craftTiers[0] = CraftTier(0, 1, 3, 2 ether, 100);
        craftTiers[1] = CraftTier(1, 2, 3, 5 ether, 85);
        craftTiers[2] = CraftTier(2, 3, 4, 15 ether, 60);
        craftTiers[3] = CraftTier(3, 4, 5, 50 ether, 35);
    }

    /* ========== COLLECTION MANAGEMENT ========== */

    function addCollection(address _contractAddr, string calldata _name, string calldata _imageURI) external onlyOwner returns (uint256) {
        uint256 id = collectionCount++;
        collections[id] = Collection(_contractAddr, _name, _imageURI, true, 0);
        emit CollectionAdded(id, _contractAddr, _name);
        return id;
    }

    function setCollectionActive(uint256 cid, bool active) external onlyOwner {
        if (cid >= collectionCount) revert CollectionNotFound();
        collections[cid].active = active;
        emit CollectionUpdated(cid, active);
    }

    function updateCollection(uint256 cid, string calldata _name, string calldata _imageURI) external onlyOwner {
        if (cid >= collectionCount) revert CollectionNotFound();
        collections[cid].name = _name;
        collections[cid].imageURI = _imageURI;
    }

    function getCollections() external view returns (Collection[] memory) {
        Collection[] memory r = new Collection[](collectionCount);
        for (uint256 i = 0; i < collectionCount; i++) r[i] = collections[i];
        return r;
    }

    function getCollectionIdByContract(address _addr) external view returns (uint256) {
        for (uint256 i = 0; i < collectionCount; i++) {
            if (collections[i].contractAddr == _addr) return i;
        }
        return collectionCount;
    }

    /* ========== MINTING ========== */

    function mintCard(uint256 collectionId, uint256 sourceTokenId) external notBlacklisted(msg.sender) returns (uint256) {
        if (collectionId >= collectionCount) revert CollectionNotFound();
        Collection storage col = collections[collectionId];
        if (!col.active) revert CollectionNotActive();
        if (IERC721Source(col.contractAddr).ownerOf(sourceTokenId) != msg.sender) revert NotNFTOwner();
        bytes32 mk = keccak256(abi.encodePacked(col.contractAddr, sourceTokenId));
        if (cardMinted[mk]) revert CardAlreadyMinted();
        cardMinted[mk] = true;
        uint256 cardId = nextCardId++;
        cardOrigins[cardId] = CardOrigin(col.contractAddr, sourceTokenId, false);
        col.totalMinted++;
        _safeMint(msg.sender, cardId);
        emit CardMinted(msg.sender, cardId, col.contractAddr, sourceTokenId);
        return cardId;
    }

    function batchMintCards(uint256 collectionId, uint256[] calldata sourceTokenIds) external notBlacklisted(msg.sender) returns (uint256[] memory) {
        if (collectionId >= collectionCount) revert CollectionNotFound();
        Collection storage col = collections[collectionId];
        if (!col.active) revert CollectionNotActive();
        IERC721Source src = IERC721Source(col.contractAddr);
        uint256[] memory ids = new uint256[](sourceTokenIds.length);
        for (uint256 i = 0; i < sourceTokenIds.length; i++) {
            if (src.ownerOf(sourceTokenIds[i]) != msg.sender) revert NotNFTOwner();
            bytes32 mk = keccak256(abi.encodePacked(col.contractAddr, sourceTokenIds[i]));
            if (cardMinted[mk]) revert CardAlreadyMinted();
            cardMinted[mk] = true;
            uint256 cardId = nextCardId++;
            cardOrigins[cardId] = CardOrigin(col.contractAddr, sourceTokenIds[i], false);
            col.totalMinted++;
            _safeMint(msg.sender, cardId);
            ids[i] = cardId;
            emit CardMinted(msg.sender, cardId, col.contractAddr, sourceTokenIds[i]);
        }
        return ids;
    }

    /* ========== CRAFTING ========== */

    function craftCards(uint256[] calldata inputCardIds) external nonReentrant notBlacklisted(msg.sender) returns (uint256) {
        if (inputCardIds.length < 3) revert InvalidCraftInput();
        uint8 inputRarity = cardStats[inputCardIds[0]].rarity;
        if (inputRarity > 3) revert InvalidCraftInput();
        CraftTier memory tier = craftTiers[inputRarity];
        if (inputCardIds.length != tier.inputCount) revert InvalidCraftInput();
        address srcContract = cardOrigins[inputCardIds[0]].sourceContract;

        uint256 bestAtk; uint256 bestDef; uint256 bestHp; uint256 bestSpd;
        uint256 bestTotal; uint256 bestIdx; uint8 bestElement;
        string memory bestImage;

        for (uint256 i = 0; i < inputCardIds.length; i++) {
            uint256 cid = inputCardIds[i];
            if (ownerOf(cid) != msg.sender) revert CraftInputNotOwned();
            CardStats memory s = cardStats[cid];
            if (!s.isSet) revert CraftInputStatsNotSet();
            if (s.rarity != inputRarity) revert CraftInputWrongRarity();
            if (cardOrigins[cid].sourceContract != srcContract) revert CraftInputDifferentCollection();
            if (s.attack > uint16(bestAtk)) bestAtk = s.attack;
            if (s.defense > uint16(bestDef)) bestDef = s.defense;
            if (s.health > uint16(bestHp)) bestHp = s.health;
            if (s.speed > uint16(bestSpd)) bestSpd = s.speed;
            uint256 t = uint256(s.attack) + uint256(s.defense) + uint256(s.health) + uint256(s.speed);
            if (t > bestTotal) { bestTotal = t; bestIdx = i; bestElement = s.element; bestImage = cardImageURI[cid]; }
        }

        if (pathUSD.allowance(msg.sender, address(this)) < tier.cost) revert InsufficientAllowance();
        pathUSD.transferFrom(msg.sender, address(this), tier.cost);

        // Split fee using adjustable ratio
        uint256 poolShare = (tier.cost * craftPoolSplitBps) / 10000;
        uint256 platformShare = tier.cost - poolShare;
        craftingPrizePoolFees += poolShare;
        craftingPlatformFees += platformShare;

        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, msg.sender, nextCardId, inputCardIds.length
        )));
        bool success = (seed % 100) < tier.successRate;

        if (success) {
            for (uint256 i = 0; i < inputCardIds.length; i++) _burn(inputCardIds[i]);
            uint256 newId = nextCardId++;
            uint256 bs = uint256(keccak256(abi.encodePacked(seed, "boost")));
            cardStats[newId] = CardStats({
                attack: _boost(uint16(bestAtk), bs, 0), defense: _boost(uint16(bestDef), bs, 1),
                health: _boostHp(uint16(bestHp), bs, 2), speed: _boost(uint16(bestSpd), bs, 3),
                element: bestElement, rarity: tier.outputRarity,
                abilityHash: keccak256(abi.encodePacked("crafted", newId)), isSet: true
            });
            cardOrigins[newId] = CardOrigin(srcContract, 0, true);
            if (bytes(bestImage).length > 0) cardImageURI[newId] = bestImage;
            _safeMint(msg.sender, newId);
            emit CardCrafted(msg.sender, newId, tier.outputRarity, true);
            return newId;
        } else {
            for (uint256 i = 0; i < inputCardIds.length; i++) {
                if (i != bestIdx) _burn(inputCardIds[i]);
            }
            emit CardCrafted(msg.sender, 0, tier.outputRarity, false);
            return 0;
        }
    }

    function _boost(uint16 base, uint256 seed, uint256 idx) internal pure returns (uint16) {
        uint256 b = (uint256(base) * (105 + ((seed >> (idx * 16)) % 11))) / 100;
        if (b > 100) b = 100; if (b == 0) b = 1;
        return uint16(b);
    }

    function _boostHp(uint16 base, uint256 seed, uint256 idx) internal pure returns (uint16) {
        uint256 b = (uint256(base) * (105 + ((seed >> (idx * 16)) % 11))) / 100;
        if (b > 300) b = 300; if (b < 50) b = 50;
        return uint16(b);
    }

    /* ========== ORACLE ========== */

    function commitStats(
        uint256 cardId, uint16 attack, uint16 defense, uint16 health, uint16 speed,
        uint8 element, uint8 rarity, bytes32 abilityHash, string calldata imageURI
    ) external {
        if (msg.sender != oracle && msg.sender != owner()) revert OnlyOracle();
        if (!_exists(cardId)) revert CardDoesNotExist();
        if (cardStats[cardId].isSet) revert StatsAlreadySet();
        if (attack == 0 || attack > 100 || defense == 0 || defense > 100) revert InvalidStats();
        if (health < 50 || health > 300 || speed == 0 || speed > 100) revert InvalidStats();
        if (element > 5 || rarity > 4) revert InvalidStats();
        cardStats[cardId] = CardStats(attack, defense, health, speed, element, rarity, abilityHash, true);
        if (bytes(imageURI).length > 0) cardImageURI[cardId] = imageURI;
        emit StatsCommitted(cardId, element, rarity);
    }

    function batchCommitStats(
        uint256[] calldata cardIds, uint16[] calldata attacks, uint16[] calldata defenses,
        uint16[] calldata healths, uint16[] calldata speeds, uint8[] calldata elements,
        uint8[] calldata rarities, bytes32[] calldata abilityHashes, string[] calldata imageURIs
    ) external {
        if (msg.sender != oracle && msg.sender != owner()) revert OnlyOracle();
        for (uint256 i = 0; i < cardIds.length; i++) {
            if (!_exists(cardIds[i])) revert CardDoesNotExist();
            if (cardStats[cardIds[i]].isSet) revert StatsAlreadySet();
            cardStats[cardIds[i]] = CardStats(attacks[i], defenses[i], healths[i], speeds[i], elements[i], rarities[i], abilityHashes[i], true);
            if (bytes(imageURIs[i]).length > 0) cardImageURI[cardIds[i]] = imageURIs[i];
            emit StatsCommitted(cardIds[i], elements[i], rarities[i]);
        }
    }

    /* ========== VIEWS ========== */

    function getCardStats(uint256 cardId) external view returns (uint16, uint16, uint16, uint16, uint8, uint8, bytes32, bool) {
        if (!_exists(cardId)) revert CardDoesNotExist();
        CardStats memory s = cardStats[cardId];
        return (s.attack, s.defense, s.health, s.speed, s.element, s.rarity, s.abilityHash, s.isSet);
    }

    function getCardOrigin(uint256 cardId) external view returns (address, uint256, bool) {
        if (!_exists(cardId)) revert CardDoesNotExist();
        CardOrigin memory o = cardOrigins[cardId];
        return (o.sourceContract, o.sourceTokenId, o.isCrafted);
    }

    function isCardMinted(address srcContract, uint256 srcTokenId) external view returns (bool) {
        return cardMinted[keccak256(abi.encodePacked(srcContract, srcTokenId))];
    }

    function getCraftTier(uint8 inputRarity) external view returns (CraftTier memory) {
        if (inputRarity > 3) revert InvalidCraftInput();
        return craftTiers[inputRarity];
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /* ========== TOKEN URI ========== */

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert CardDoesNotExist();
        CardStats memory s = cardStats[tokenId];
        return renderer.renderTokenURI(
            tokenId, s.attack, s.defense, s.health, s.speed,
            s.element, s.rarity, s.isSet, cardOrigins[tokenId].isCrafted, cardImageURI[tokenId]
        );
    }

    /* ========== ADMIN ========== */

    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    function setRenderer(address _renderer) external onlyOwner {
        renderer = IWhalemonRenderer(_renderer);
    }

    function setPrizePoolTarget(address _target) external onlyOwner {
        prizePoolTarget = _target;
    }

    function setBaseMetadataURI(string calldata _uri) external onlyOwner {
        baseMetadataURI = _uri;
    }

    function setCraftTier(uint8 tierIndex, uint8 inputCount, uint256 cost, uint8 successRate) external onlyOwner {
        if (tierIndex > 3) revert InvalidCraftInput();
        if (successRate > 100) revert InvalidStats();
        craftTiers[tierIndex].inputCount = inputCount;
        craftTiers[tierIndex].cost = cost;
        craftTiers[tierIndex].successRate = successRate;
    }

    /// @notice Set the crafting fee split ratio (basis points to prize pool, remainder to platform)
    /// @param _bps Basis points for prize pool (0-10000, e.g. 5000 = 50%)
    function setCraftPoolSplit(uint256 _bps) external onlyOwner {
        if (_bps > 10000) revert InvalidSplit();
        emit CraftPoolSplitUpdated(craftPoolSplitBps, _bps);
        craftPoolSplitBps = _bps;
    }

    /// @notice Blacklist or unblacklist an address
    function setBlacklist(address account, bool status) external onlyOwner {
        blacklisted[account] = status;
        emit Blacklisted(account, status);
    }

    function withdrawCraftingFees(address platformTo) external onlyOwner {
        uint256 pAmt = craftingPlatformFees;
        uint256 poolAmt = craftingPrizePoolFees;
        if (pAmt == 0 && poolAmt == 0) revert NothingToWithdraw();
        craftingPlatformFees = 0;
        craftingPrizePoolFees = 0;
        if (pAmt > 0) pathUSD.transfer(platformTo, pAmt);
        if (poolAmt > 0 && prizePoolTarget != address(0)) pathUSD.transfer(prizePoolTarget, poolAmt);
        else if (poolAmt > 0) pathUSD.transfer(platformTo, poolAmt);
        emit CraftingFeesWithdrawn(platformTo, pAmt, poolAmt);
    }

    /* ========== OVERRIDES ========== */

    /// @dev Blocks transfers to/from blacklisted addresses
    function _update(address to, uint256 tokenId, address auth)
        internal override(ERC721, ERC721Enumerable) returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && blacklisted[from]) revert AccountBlacklisted();
        if (to != address(0) && blacklisted[to]) revert AccountBlacklisted();
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal override(ERC721, ERC721Enumerable)
    { super._increaseBalance(account, value); }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721Enumerable) returns (bool)
    { return super.supportsInterface(interfaceId); }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title WhalemonMarket - Whalemon TCG Card Marketplace
/// @author Whalemon TCG on Tempo Network
/// @notice Buy, sell, and auction Whalemon cards using PATHUSD.
/// @dev All trades are in PATHUSD (TIP-20 stablecoin on Tempo).

interface IWhaleCards {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IPATHUSD {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract WhalemonMarket is Ownable, ReentrancyGuard {

    /* ═══════════════════════════════════════════════════ */
    /*                    CONSTANTS                       */
    /* ═══════════════════════════════════════════════════ */

    IWhaleCards public immutable whaleCards;
    IPATHUSD public immutable pathUSD;

    /// @notice Platform fee in basis points (250 = 2.5%)
    uint256 public platformFeeBps = 250;

    /// @notice Maximum platform fee (10%)
    uint256 public constant MAX_FEE_BPS = 1000;

    /// @notice Minimum listing price (0.01 PATHUSD)
    uint256 public constant MIN_PRICE = 0.01 ether;

    /* ═══════════════════════════════════════════════════ */
    /*                     ENUMS                          */
    /* ═══════════════════════════════════════════════════ */

    enum ListingStatus { Active, Sold, Cancelled }

    /* ═══════════════════════════════════════════════════ */
    /*                    STRUCTS                         */
    /* ═══════════════════════════════════════════════════ */

    struct Listing {
        uint256 listingId;
        uint256 cardId;
        address seller;
        uint256 price;       // In PATHUSD (18 decimals)
        ListingStatus status;
        address buyer;
        uint256 createdAt;
        uint256 soldAt;
    }

    struct Offer {
        uint256 offerId;
        uint256 cardId;
        address offerer;
        uint256 amount;      // In PATHUSD
        uint256 expiresAt;
        bool accepted;
        bool cancelled;
    }

    struct MarketStats {
        uint256 totalVolume;     // Total PATHUSD traded
        uint256 totalSales;      // Number of completed sales
        uint256 totalListings;   // Number of listings created
        uint256 totalOffers;     // Number of offers made
    }

    /* ═══════════════════════════════════════════════════ */
    /*                 STATE VARIABLES                    */
    /* ═══════════════════════════════════════════════════ */

    uint256 public nextListingId;
    uint256 public nextOfferId;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer) public offers;

    /// @notice Active listing for a card (0 if not listed)
    mapping(uint256 => uint256) public cardToListing;

    /// @notice Offers made on a specific card
    mapping(uint256 => uint256[]) public cardOffers;

    /// @notice Accumulated platform fees
    uint256 public accumulatedFees;

    /// @notice Global market statistics
    MarketStats public marketStats;

    /* ═══════════════════════════════════════════════════ */
    /*                     EVENTS                         */
    /* ═══════════════════════════════════════════════════ */

    event CardListed(uint256 indexed listingId, uint256 indexed cardId, address indexed seller, uint256 price);
    event CardSold(uint256 indexed listingId, uint256 indexed cardId, address seller, address indexed buyer, uint256 price);
    event ListingCancelled(uint256 indexed listingId, uint256 indexed cardId);
    event ListingPriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice);
    event OfferMade(uint256 indexed offerId, uint256 indexed cardId, address indexed offerer, uint256 amount);
    event OfferAccepted(uint256 indexed offerId, uint256 indexed cardId, address seller, address buyer, uint256 amount);
    event OfferCancelled(uint256 indexed offerId);
    event FeesWithdrawn(address indexed to, uint256 amount);

    /* ═══════════════════════════════════════════════════ */
    /*                   CUSTOM ERRORS                    */
    /* ═══════════════════════════════════════════════════ */

    error NotCardOwner();
    error CardAlreadyListed();
    error PriceTooLow();
    error ListingNotActive();
    error CannotBuyOwnCard();
    error InsufficientPayment();
    error NotSeller();
    error OfferExpired();
    error OfferNotActive();
    error NotOfferer();
    error CardNotApproved();
    error InvalidFee();
    error NoFeesToWithdraw();

    /* ═══════════════════════════════════════════════════ */
    /*                   CONSTRUCTOR                      */
    /* ═══════════════════════════════════════════════════ */

    constructor(
        address _whaleCards,
        address _pathUSD
    ) Ownable(msg.sender) {
        whaleCards = IWhaleCards(_whaleCards);
        pathUSD = IPATHUSD(_pathUSD);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                    LISTINGS                        */
    /* ═══════════════════════════════════════════════════ */

    /// @notice List a Whalemon card for sale
    /// @param cardId The card token ID to list
    /// @param price Asking price in PATHUSD (18 decimals)
    function listCard(uint256 cardId, uint256 price) external nonReentrant returns (uint256) {
        if (whaleCards.ownerOf(cardId) != msg.sender) revert NotCardOwner();
        if (cardToListing[cardId] != 0 && listings[cardToListing[cardId]].status == ListingStatus.Active) revert CardAlreadyListed();
        if (price < MIN_PRICE) revert PriceTooLow();

        // Verify marketplace is approved to transfer the card
        if (whaleCards.getApproved(cardId) != address(this) && !whaleCards.isApprovedForAll(msg.sender, address(this))) {
            revert CardNotApproved();
        }

        uint256 listingId = ++nextListingId;

        listings[listingId] = Listing({
            listingId: listingId,
            cardId: cardId,
            seller: msg.sender,
            price: price,
            status: ListingStatus.Active,
            buyer: address(0),
            createdAt: block.timestamp,
            soldAt: 0
        });

        cardToListing[cardId] = listingId;
        marketStats.totalListings++;

        emit CardListed(listingId, cardId, msg.sender, price);
        return listingId;
    }

    /// @notice Buy a listed card using PATHUSD
    /// @param listingId The listing to purchase
    function buyCard(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        if (listing.status != ListingStatus.Active) revert ListingNotActive();
        if (listing.seller == msg.sender) revert CannotBuyOwnCard();

        uint256 price = listing.price;

        // Verify buyer has approved enough PATHUSD
        if (pathUSD.allowance(msg.sender, address(this)) < price) revert InsufficientPayment();

        // Calculate platform fee
        uint256 fee = (price * platformFeeBps) / 10000;
        uint256 sellerProceeds = price - fee;

        // Transfer PATHUSD: buyer → seller (minus fee)
        pathUSD.transferFrom(msg.sender, listing.seller, sellerProceeds);

        // Transfer PATHUSD: buyer → contract (fee)
        if (fee > 0) {
            pathUSD.transferFrom(msg.sender, address(this), fee);
            accumulatedFees += fee;
        }

        // Transfer NFT: seller → buyer
        whaleCards.transferFrom(listing.seller, msg.sender, listing.cardId);

        // Update listing
        listing.status = ListingStatus.Sold;
        listing.buyer = msg.sender;
        listing.soldAt = block.timestamp;
        cardToListing[listing.cardId] = 0;

        // Update stats
        marketStats.totalVolume += price;
        marketStats.totalSales++;

        emit CardSold(listingId, listing.cardId, listing.seller, msg.sender, price);
    }

    /// @notice Cancel an active listing
    /// @param listingId The listing to cancel
    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (listing.status != ListingStatus.Active) revert ListingNotActive();

        listing.status = ListingStatus.Cancelled;
        cardToListing[listing.cardId] = 0;

        emit ListingCancelled(listingId, listing.cardId);
    }

    /// @notice Update the price of an active listing
    /// @param listingId The listing to update
    /// @param newPrice New price in PATHUSD
    function updateListingPrice(uint256 listingId, uint256 newPrice) external {
        Listing storage listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (listing.status != ListingStatus.Active) revert ListingNotActive();
        if (newPrice < MIN_PRICE) revert PriceTooLow();

        uint256 oldPrice = listing.price;
        listing.price = newPrice;

        emit ListingPriceUpdated(listingId, oldPrice, newPrice);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     OFFERS                         */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Make an offer on a card (listed or not)
    /// @param cardId The card to make an offer on
    /// @param amount Offer amount in PATHUSD
    /// @param duration How long the offer is valid (in seconds)
    function makeOffer(uint256 cardId, uint256 amount, uint256 duration) external nonReentrant returns (uint256) {
        if (amount < MIN_PRICE) revert PriceTooLow();
        if (whaleCards.ownerOf(cardId) == msg.sender) revert CannotBuyOwnCard();

        // Verify offerer has enough PATHUSD allowance
        if (pathUSD.allowance(msg.sender, address(this)) < amount) revert InsufficientPayment();

        uint256 offerId = ++nextOfferId;

        offers[offerId] = Offer({
            offerId: offerId,
            cardId: cardId,
            offerer: msg.sender,
            amount: amount,
            expiresAt: block.timestamp + duration,
            accepted: false,
            cancelled: false
        });

        cardOffers[cardId].push(offerId);
        marketStats.totalOffers++;

        emit OfferMade(offerId, cardId, msg.sender, amount);
        return offerId;
    }

    /// @notice Accept an offer on your card
    /// @param offerId The offer to accept
    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.accepted || offer.cancelled) revert OfferNotActive();
        if (block.timestamp > offer.expiresAt) revert OfferExpired();
        if (whaleCards.ownerOf(offer.cardId) != msg.sender) revert NotCardOwner();

        uint256 amount = offer.amount;

        // Calculate fee
        uint256 fee = (amount * platformFeeBps) / 10000;
        uint256 sellerProceeds = amount - fee;

        // Transfer PATHUSD
        pathUSD.transferFrom(offer.offerer, msg.sender, sellerProceeds);
        if (fee > 0) {
            pathUSD.transferFrom(offer.offerer, address(this), fee);
            accumulatedFees += fee;
        }

        // Transfer NFT
        whaleCards.transferFrom(msg.sender, offer.offerer, offer.cardId);

        // Update state
        offer.accepted = true;

        // Cancel the listing if card was listed
        uint256 listingId = cardToListing[offer.cardId];
        if (listingId != 0 && listings[listingId].status == ListingStatus.Active) {
            listings[listingId].status = ListingStatus.Cancelled;
            cardToListing[offer.cardId] = 0;
        }

        // Stats
        marketStats.totalVolume += amount;
        marketStats.totalSales++;

        emit OfferAccepted(offerId, offer.cardId, msg.sender, offer.offerer, amount);
    }

    /// @notice Cancel your own offer
    /// @param offerId The offer to cancel
    function cancelOffer(uint256 offerId) external {
        Offer storage offer = offers[offerId];
        if (offer.offerer != msg.sender) revert NotOfferer();
        if (offer.accepted || offer.cancelled) revert OfferNotActive();

        offer.cancelled = true;
        emit OfferCancelled(offerId);
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     VIEWS                          */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Get all active listings (paginated)
    function getActiveListings(uint256 offset, uint256 limit) external view returns (Listing[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= nextListingId && count < offset + limit; i++) {
            if (listings[i].status == ListingStatus.Active) count++;
        }

        uint256 resultCount = count > offset ? count - offset : 0;
        if (resultCount > limit) resultCount = limit;

        Listing[] memory result = new Listing[](resultCount);
        uint256 idx = 0;
        uint256 skipped = 0;

        for (uint256 i = 1; i <= nextListingId && idx < resultCount; i++) {
            if (listings[i].status == ListingStatus.Active) {
                if (skipped >= offset) {
                    result[idx++] = listings[i];
                } else {
                    skipped++;
                }
            }
        }

        return result;
    }

    /// @notice Get all offers on a card
    function getCardOffers(uint256 cardId) external view returns (Offer[] memory) {
        uint256[] memory offerIds = cardOffers[cardId];
        Offer[] memory result = new Offer[](offerIds.length);
        for (uint256 i = 0; i < offerIds.length; i++) {
            result[i] = offers[offerIds[i]];
        }
        return result;
    }

    /// @notice Get active offers for a card (not expired, not cancelled, not accepted)
    function getActiveCardOffers(uint256 cardId) external view returns (Offer[] memory) {
        uint256[] memory offerIds = cardOffers[cardId];
        uint256 activeCount = 0;

        for (uint256 i = 0; i < offerIds.length; i++) {
            Offer memory o = offers[offerIds[i]];
            if (!o.accepted && !o.cancelled && block.timestamp <= o.expiresAt) {
                activeCount++;
            }
        }

        Offer[] memory result = new Offer[](activeCount);
        uint256 idx = 0;

        for (uint256 i = 0; i < offerIds.length; i++) {
            Offer memory o = offers[offerIds[i]];
            if (!o.accepted && !o.cancelled && block.timestamp <= o.expiresAt) {
                result[idx++] = o;
            }
        }

        return result;
    }

    /// @notice Get recent sales history (last N sales)
    function getRecentSales(uint256 limit) external view returns (Listing[] memory) {
        uint256 count = 0;
        // Count sold listings from newest
        for (uint256 i = nextListingId; i >= 1 && count < limit; i--) {
            if (listings[i].status == ListingStatus.Sold) count++;
            if (i == 0) break;
        }

        Listing[] memory result = new Listing[](count);
        uint256 idx = 0;

        for (uint256 i = nextListingId; i >= 1 && idx < count; i--) {
            if (listings[i].status == ListingStatus.Sold) {
                result[idx++] = listings[i];
            }
            if (i == 0) break;
        }

        return result;
    }

    /// @notice Get market statistics
    function getMarketStats() external view returns (MarketStats memory) {
        return marketStats;
    }

    /* ═══════════════════════════════════════════════════ */
    /*                     ADMIN                          */
    /* ═══════════════════════════════════════════════════ */

    /// @notice Update platform fee (max 10%)
    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert InvalidFee();
        platformFeeBps = _feeBps;
    }

    /// @notice Withdraw accumulated platform fees
    function withdrawFees(address to) external onlyOwner {
        if (accumulatedFees == 0) revert NoFeesToWithdraw();
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        pathUSD.transfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }
}

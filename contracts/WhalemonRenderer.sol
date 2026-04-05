// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/// @title WhalemonRenderer - On-chain SVG metadata for Whalemon cards
/// @dev Separated from WhaleCards to stay under the contract size limit.

contract WhalemonRenderer {
    using Strings for uint256;

    string[6] public elementNames = ["Abyss", "Tide", "Storm", "Frost", "Coral", "Leviathan"];
    string[5] public rarityNames = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
    string[6] public elementColors = ["1a0a2e", "0ea5e9", "8b5cf6", "67e8f9", "f472b6", "dc2626"];

    function renderTokenURI(
        uint256 tokenId,
        uint16 attack,
        uint16 defense,
        uint16 health,
        uint16 speed,
        uint8 element,
        uint8 rarity,
        bool isSet,
        bool isCrafted,
        string memory imageURI
    ) external view returns (string memory) {
        string memory cardName = string.concat("Whalemon #", tokenId.toString());

        if (!isSet) {
            return string.concat(
                "data:application/json;base64,",
                Base64.encode(bytes(string.concat(
                    '{"name":"', cardName, '",',
                    '"description":"A Whalemon Trading Card awaiting its destiny.",',
                    '"image":"data:image/svg+xml;base64,',
                    Base64.encode(bytes(_renderPendingSVG(tokenId))),
                    '"}'
                )))
            );
        }

        string memory elementName = elementNames[element];
        string memory rarityName = rarityNames[rarity];
        string memory craftedTag = isCrafted ? " [Crafted]" : "";

        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(string.concat(
                '{"name":"', cardName, ' - ', elementName, ' ', rarityName, craftedTag, '",',
                '"description":"A ', rarityName, ' ', elementName, ' Whalemon card.',
                isCrafted ? ' Forged through crafting.' : '',
                '",',
                '"image":"data:image/svg+xml;base64,',
                Base64.encode(bytes(_renderCardSVG(tokenId, attack, defense, health, speed, element, rarity, isCrafted, imageURI))),
                '",',
                '"attributes":[',
                    '{"trait_type":"Element","value":"', elementName, '"},',
                    '{"trait_type":"Rarity","value":"', rarityName, '"},',
                    '{"trait_type":"Crafted","value":"', isCrafted ? 'Yes' : 'No', '"},',
                    '{"trait_type":"Attack","display_type":"number","value":', uint256(attack).toString(), '},',
                    '{"trait_type":"Defense","display_type":"number","value":', uint256(defense).toString(), '},',
                    '{"trait_type":"Health","display_type":"number","value":', uint256(health).toString(), '},',
                    '{"trait_type":"Speed","display_type":"number","value":', uint256(speed).toString(), '}',
                ']}'
            )))
        );
    }

    function _renderCardSVG(
        uint256 tokenId,
        uint16 attack,
        uint16 defense,
        uint16 health,
        uint16 speed,
        uint8 element,
        uint8 rarity,
        bool isCrafted,
        string memory imageURI
    ) internal view returns (string memory) {
        string memory bc = elementColors[element];
        string memory en = elementNames[element];
        string memory rn = rarityNames[rarity];
        string memory img;

        if (bytes(imageURI).length > 0) {
            img = string.concat(
                '<clipPath id="c"><rect x="30" y="70" width="240" height="180" rx="10"/></clipPath>',
                '<image href="', imageURI, '" x="30" y="70" width="240" height="180" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>'
            );
        } else {
            img = string.concat(
                '<circle cx="150" cy="160" r="70" fill="#', bc, '" opacity="0.15"/>',
                '<text x="150" y="170" text-anchor="middle" fill="#e2e8f0" font-size="48">&#x1F433;</text>'
            );
        }

        string memory badge = "";
        if (isCrafted) {
            badge = string.concat(
                '<rect x="30" y="76" width="56" height="20" rx="4" fill="#', bc, '" opacity="0.85"/>',
                '<text x="58" y="90" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold">CRAFTED</text>'
            );
        }

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" style="font-family:monospace">',
            '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a0e27"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs>',
            '<rect width="300" height="420" rx="16" fill="url(#bg)"/>',
            '<rect x="4" y="4" width="292" height="412" rx="14" fill="none" stroke="#', bc, '" stroke-width="3" opacity="0.8"/>',
            '<text x="150" y="36" text-anchor="middle" fill="#e2e8f0" font-size="16" font-weight="bold">WHALEMON #', tokenId.toString(), '</text>',
            '<text x="150" y="56" text-anchor="middle" fill="#', bc, '" font-size="12">', en, ' | ', rn, '</text>',
            img, badge,
            '<line x1="30" y1="260" x2="270" y2="260" stroke="#', bc, '" opacity="0.4"/>',
            _renderStats(attack, defense, health, speed, bc),
            '</svg>'
        );
    }

    function _renderStats(uint16 atk, uint16 def, uint16 hp, uint16 spd, string memory bc) internal pure returns (string memory) {
        return string.concat(
            '<text x="40" y="290" fill="#94a3b8" font-size="11">ATK</text><text x="120" y="290" fill="#f87171" font-size="14" font-weight="bold">', uint256(atk).toString(), '</text>',
            '<text x="170" y="290" fill="#94a3b8" font-size="11">DEF</text><text x="250" y="290" fill="#60a5fa" font-size="14" font-weight="bold">', uint256(def).toString(), '</text>',
            '<text x="40" y="320" fill="#94a3b8" font-size="11">HP</text><text x="120" y="320" fill="#4ade80" font-size="14" font-weight="bold">', uint256(hp).toString(), '</text>',
            '<text x="170" y="320" fill="#94a3b8" font-size="11">SPD</text><text x="250" y="320" fill="#facc15" font-size="14" font-weight="bold">', uint256(spd).toString(), '</text>',
            '<rect x="20" y="350" width="260" height="50" rx="8" fill="#', bc, '" opacity="0.1"/>',
            '<text x="150" y="380" text-anchor="middle" fill="#', bc, '" font-size="11">WHALEMON TCG</text>'
        );
    }

    function _renderPendingSVG(uint256 tokenId) internal pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" style="font-family:monospace">',
            '<rect width="300" height="420" rx="16" fill="#0a0e27"/>',
            '<rect x="4" y="4" width="292" height="412" rx="14" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="8 4"/>',
            '<text x="150" y="36" text-anchor="middle" fill="#e2e8f0" font-size="16" font-weight="bold">WHALEMON #', tokenId.toString(), '</text>',
            '<text x="150" y="56" text-anchor="middle" fill="#64748b" font-size="12">Awaiting Destiny...</text>',
            '<text x="150" y="180" text-anchor="middle" fill="#475569" font-size="64">&#x1F433;</text>',
            '<text x="150" y="300" text-anchor="middle" fill="#475569" font-size="12">Stats generating...</text>',
            '<text x="150" y="380" text-anchor="middle" fill="#334155" font-size="11">WHALEMON TCG</text>',
            '</svg>'
        );
    }
}

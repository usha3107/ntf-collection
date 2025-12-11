// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract NftCollection is ERC721, ERC721Burnable, Ownable {
    using Strings for uint256;

    uint256 public immutable maxSupply;
    uint256 public totalSupply;

    // Base URI for metadata
    string private _baseTokenURI;

    // Minting pause flag (only minting is paused, transfers allowed)
    bool private _mintPaused;

    event MintPaused(address indexed admin);
    event MintUnpaused(address indexed admin);
    event BaseURIUpdated(string newBaseURI);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        string memory baseURI_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        require(maxSupply_ > 0, "Max supply must be > 0");
        maxSupply = maxSupply_;
        _baseTokenURI = baseURI_;
        _mintPaused = false;
    }

    // -------------------
    //   View functions
    // -------------------

    function mintPaused() external view returns (bool) {
        return _mintPaused;
    }

    function baseTokenURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // tokenURI: baseURI + tokenId
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");

        string memory baseURI = _baseURI();
        if (bytes(baseURI).length == 0) {
            return "";
        }
        return string(abi.encodePacked(baseURI, tokenId.toString()));
    }

    // -------------------
    //   Admin functions
    // -------------------

    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function pauseMint() external onlyOwner {
        _mintPaused = true;
        emit MintPaused(msg.sender);
    }

    function unpauseMint() external onlyOwner {
        _mintPaused = false;
        emit MintUnpaused(msg.sender);
    }

    // Admin-only mint function
    function safeMint(address to, uint256 tokenId) external onlyOwner {
        require(!_mintPaused, "Minting is paused");
        require(to != address(0), "Cannot mint to zero address");
        require(tokenId > 0 && tokenId <= maxSupply, "TokenId out of valid range");
        require(!_exists(tokenId), "Token already minted");
        require(totalSupply < maxSupply, "Max supply reached");

        _safeMint(to, tokenId);
        totalSupply += 1;
    }

    // -------------------
    //   Burning override
    // -------------------

    function _burn(uint256 tokenId) internal override(ERC721) {
        super._burn(tokenId);
        totalSupply -= 1;
    }
}

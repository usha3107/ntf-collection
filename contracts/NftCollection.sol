// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract NftCollection is ERC721, Ownable {
    using Strings for uint256;

    uint256 public immutable maxSupply;
    uint256 public totalSupply;

    // Base URI for metadata
    string private _baseTokenURI;

    // Minting pause flag (only minting is paused, transfers allowed)
    bool private _mintPaused;

    // Track existence explicitly
    mapping(uint256 => bool) private _minted;

    event MintPaused(address indexed admin);
    event MintUnpaused(address indexed admin);
    event BaseURIUpdated(string newBaseURI);

    // Pass owner to Ownable constructor because some OZ versions expect it
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
        totalSupply = 0;
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
        require(_minted[tokenId], "ERC721Metadata: URI query for nonexistent token");

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

    // Admin-only safe mint function
    function safeMint(address to, uint256 tokenId) external onlyOwner {
        require(!_mintPaused, "Minting is paused");
        require(to != address(0), "Cannot mint to zero address");
        require(tokenId > 0 && tokenId <= maxSupply, "TokenId out of valid range");
        require(!_minted[tokenId], "Token already minted");
        require(totalSupply < maxSupply, "Max supply reached");

        _safeMint(to, tokenId);

        // Explicitly update existence and supply (no internal overrides)
        _minted[tokenId] = true;
        totalSupply += 1;
    }

    // -------------------
    //   Burn (explicit public function)
    // -------------------
    // We implement our own burn function rather than inheriting ERC721Burnable,
    // to keep explicit control over supply and existence updates and avoid OZ version issues.
    function burn(uint256 tokenId) external {
        address ownerAddr = ownerOf(tokenId);

        // Caller must be owner or approved or operator
        require(
            msg.sender == ownerAddr ||
            getApproved(tokenId) == msg.sender ||
            isApprovedForAll(ownerAddr, msg.sender),
            "Not owner nor approved"
        );

        // Call internal _burn (available from ERC721)
        _burn(tokenId);

        // Update existence and totalSupply
        if (_minted[tokenId]) {
            _minted[tokenId] = false;
            // totalSupply should be >= 1, but sanity-check not required because of require flow
            totalSupply -= 1;
        }
    }

    // Optional: expose a view for token existence
    function exists(uint256 tokenId) external view returns (bool) {
        return _minted[tokenId];
    }
}
const { expect } = require("chai");
const { ethers, loadFixture } = require("hardhat");

async function deployNftFixture() {
  const [deployer, user1, user2, operator] = await ethers.getSigners();

  const NftCollection = await ethers.getContractFactory("NftCollection");
  const maxSupply = 5n;
  const baseURI = "https://example.com/metadata/";

  const nft = await NftCollection.deploy("MyNFT", "MNFT", maxSupply, baseURI);
  await nft.waitForDeployment();

  return { nft, deployer, user1, user2, operator, maxSupply, baseURI };
}

describe("NftCollection", function () {
  // -------------------
  //   Deployment
  // -------------------
  describe("Deployment", function () {
    it("sets correct initial configuration", async function () {
      const { nft, deployer, maxSupply } = await loadFixture(deployNftFixture);

      expect(await nft.name()).to.equal("MyNFT");
      expect(await nft.symbol()).to.equal("MNFT");
      expect(await nft.maxSupply()).to.equal(maxSupply);
      expect(await nft.totalSupply()).to.equal(0n);
      expect(await nft.owner()).to.equal(deployer.address);
      expect(await nft.mintPaused()).to.equal(false);
    });
  });

  // -------------------
  //   Minting
  // -------------------
  describe("Minting", function () {
    it("allows owner to mint and updates totalSupply and balance", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      const tokenId = 1n;
      await expect(nft.safeMint(user1.address, tokenId))
        .to.emit(nft, "Transfer")
        .withArgs(ethers.ZeroAddress, user1.address, tokenId);

      expect(await nft.totalSupply()).to.equal(1n);
      expect(await nft.balanceOf(user1.address)).to.equal(1n);
      expect(await nft.ownerOf(tokenId)).to.equal(user1.address);
    });

    it("reverts if non-owner tries to mint", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      await expect(
        nft.connect(user1).safeMint(user1.address, 1n)
      ).to.be.reverted; // ownership check in onlyOwner
    });

    it("reverts when minting beyond max supply", async function () {
      const { nft, user1, maxSupply } = await loadFixture(deployNftFixture);

      for (let i = 1n; i <= maxSupply; i++) {
        await nft.safeMint(user1.address, i);
      }

      await expect(
        nft.safeMint(user1.address, maxSupply + 1n)
      ).to.be.revertedWith("Max supply reached");
    });

    it("reverts for invalid tokenId range", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      await expect(
        nft.safeMint(user1.address, 0n)
      ).to.be.revertedWith("TokenId out of valid range");
    });

    it("reverts if tokenId already minted", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      await nft.safeMint(user1.address, 1n);

      await expect(
        nft.safeMint(user1.address, 1n)
      ).to.be.revertedWith("Token already minted");
    });

    it("allows owner to pause and unpause minting", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      await nft.pauseMint();
      await expect(
        nft.safeMint(user1.address, 1n)
      ).to.be.revertedWith("Minting is paused");

      await nft.unpauseMint();
      await nft.safeMint(user1.address, 1n);
      expect(await nft.totalSupply()).to.equal(1n);
    });
  });

  // -------------------
  //   Transfers
  // -------------------
  describe("Transfers", function () {
    it("allows token owner to transfer token", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      const tokenId = 1n;
      await nft.safeMint(user1.address, tokenId);

      await expect(
        nft.connect(user1).transferFrom(user1.address, user2.address, tokenId)
      )
        .to.emit(nft, "Transfer")
        .withArgs(user1.address, user2.address, tokenId);

      expect(await nft.ownerOf(tokenId)).to.equal(user2.address);
      expect(await nft.balanceOf(user1.address)).to.equal(0n);
      expect(await nft.balanceOf(user2.address)).to.equal(1n);
    });

    it("reverts if non-owner & non-approved tries to transfer", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      const tokenId = 1n;
      await nft.safeMint(user1.address, tokenId);

      await expect(
        nft.connect(user2).transferFrom(user1.address, user2.address, tokenId)
      ).to.be.reverted;
    });

    it("reverts when transferring non-existent token", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      await expect(
        nft.connect(user1).transferFrom(user1.address, user2.address, 999n)
      ).to.be.reverted;
    });
  });

  // -------------------
  //   Approvals
  // -------------------
  describe("Approvals", function () {
    it("allows approved address to transfer token", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      const tokenId = 1n;
      await nft.safeMint(user1.address, tokenId);

      await expect(
        nft.connect(user1).approve(user2.address, tokenId)
      )
        .to.emit(nft, "Approval")
        .withArgs(user1.address, user2.address, tokenId);

      await nft.connect(user2).transferFrom(user1.address, user2.address, tokenId);
      expect(await nft.ownerOf(tokenId)).to.equal(user2.address);
    });

    it("allows operator to transfer all tokens of owner", async function () {
      const { nft, user1, user2, operator } = await loadFixture(deployNftFixture);

      await nft.safeMint(user1.address, 1n);
      await nft.safeMint(user1.address, 2n);

      await expect(
        nft.connect(user1).setApprovalForAll(operator.address, true)
      )
        .to.emit(nft, "ApprovalForAll")
        .withArgs(user1.address, operator.address, true);

      await nft.connect(operator).transferFrom(user1.address, user2.address, 1n);
      await nft.connect(operator).transferFrom(user1.address, user2.address, 2n);

      expect(await nft.balanceOf(user2.address)).to.equal(2n);
    });

    it("prevents operator transfers after revoking approval", async function () {
      const { nft, user1, operator, user2 } = await loadFixture(deployNftFixture);

      await nft.safeMint(user1.address, 1n);
      await nft.connect(user1).setApprovalForAll(operator.address, true);
      await nft.connect(user1).setApprovalForAll(operator.address, false);

      await expect(
        nft.connect(operator).transferFrom(user1.address, user2.address, 1n)
      ).to.be.reverted;
    });
  });

  // -------------------
  //   Metadata
  // -------------------
  describe("Metadata", function () {
    it("returns correct tokenURI for existing token", async function () {
      const { nft, user1, baseURI } = await loadFixture(deployNftFixture);

      const tokenId = 1n;
      await nft.safeMint(user1.address, tokenId);

      expect(await nft.tokenURI(tokenId)).to.equal(baseURI + tokenId.toString());
    });

    it("reverts tokenURI for non-existent token", async function () {
      const { nft } = await loadFixture(deployNftFixture);

      await expect(nft.tokenURI(1n)).to.be.revertedWith(
        "ERC721Metadata: URI query for nonexistent token"
      );
    });
  });

  // -------------------
  //   Burning
  // -------------------
  describe("Burning", function () {
    it("updates balance and totalSupply on burn", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      const tokenId = 1n;
      await nft.safeMint(user1.address, tokenId);

      expect(await nft.totalSupply()).to.equal(1n);

      await nft.connect(user1).burn(tokenId);

      await expect(nft.ownerOf(tokenId)).to.be.reverted;
      expect(await nft.totalSupply()).to.equal(0n);
      expect(await nft.balanceOf(user1.address)).to.equal(0n);
    });
  });

  // -------------------
  //   Gas
  // -------------------
  describe("Gas", function () {
    it("keeps mint + transfer under a reasonable gas bound", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      const tokenId = 1n;
      const mintTx = await nft.safeMint(user1.address, tokenId);
      const mintReceipt = await mintTx.wait();
      const mintGas = mintReceipt.gasUsed;

      const transferTx = await nft
        .connect(user1)
        .transferFrom(user1.address, user2.address, tokenId);
      const transferReceipt = await transferTx.wait();
      const transferGas = transferReceipt.gasUsed;

      expect(mintGas).to.be.lt(300000n);
      expect(transferGas).to.be.lt(200000n);
    });
  });
});

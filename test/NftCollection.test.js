const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Helper: normalize on-chain numeric return values to string for safe comparison
async function toStr(valuePromiseOrValue) {
  const v = valuePromiseOrValue instanceof Promise ? await valuePromiseOrValue : valuePromiseOrValue;
  // ethers v6 may return bigint, v5 returns BigNumber, fallback to toString
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v.toString === "function") return v.toString();
  return String(v);
}

async function deployNftFixture() {
  const signers = await ethers.getSigners();
  const [deployer, user1, user2, operator] = signers;

  const NftCollection = await ethers.getContractFactory("NftCollection");
  const maxSupply = 5; // small collection for tests
  const baseURI = "https://example.com/metadata/";

  // deploy and wait for deployment using ethers v6 style if available
  const nft = await NftCollection.deploy("MyNFT", "MNFT", maxSupply, baseURI);
  if (typeof nft.waitForDeployment === "function") {
    await nft.waitForDeployment();
  } else if (typeof nft.deployed === "function") {
    await nft.deployed();
  }

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
      expect(await toStr(nft.maxSupply())).to.equal(String(maxSupply));
      expect(await toStr(nft.totalSupply())).to.equal("0");
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

      const tokenId = 1;

      // just assert the Transfer event fired on mint; then verify owner/balance/totalSupply
      await expect(nft.safeMint(user1.address, tokenId)).to.emit(nft, "Transfer");

      expect(await nft.ownerOf(tokenId)).to.equal(user1.address);
      expect(await toStr(nft.balanceOf(user1.address))).to.equal("1");
      expect(await toStr(nft.totalSupply())).to.equal("1");
    });

    it("reverts if non-owner tries to mint", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      await expect(nft.connect(user1).safeMint(user1.address, 1)).to.be.reverted;
    });

    it("reverts when minting beyond max supply", async function () {
      const { nft, user1, maxSupply } = await loadFixture(deployNftFixture);

      // mint up to maxSupply
      for (let i = 1; i <= maxSupply; i++) {
        await nft.safeMint(user1.address, i);
      }

      // now minting an id > maxSupply should revert. Use a tokenId that is > maxSupply.
      await expect(nft.safeMint(user1.address, maxSupply + 1)).to.be.reverted;
    });

    it("reverts for invalid tokenId range", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      await expect(nft.safeMint(user1.address, 0)).to.be.reverted;
    });

    it("reverts if tokenId already minted", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      await nft.safeMint(user1.address, 1);
      await expect(nft.safeMint(user1.address, 1)).to.be.reverted;
    });

    it("allows owner to pause and unpause minting", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      await nft.pauseMint();
      await expect(nft.safeMint(user1.address, 1)).to.be.reverted;
      await nft.unpauseMint();
      await nft.safeMint(user1.address, 1);

      expect(await toStr(nft.totalSupply())).to.equal("1");
    });
  });

  // -------------------
  //   Transfers
  // -------------------
  describe("Transfers", function () {
    it("allows token owner to transfer token", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      const tokenId = 1;
      await nft.safeMint(user1.address, tokenId);

      await expect(nft.connect(user1).transferFrom(user1.address, user2.address, tokenId)).to.emit(
        nft,
        "Transfer"
      );

      expect(await nft.ownerOf(tokenId)).to.equal(user2.address);
      expect(await toStr(nft.balanceOf(user1.address))).to.equal("0");
      expect(await toStr(nft.balanceOf(user2.address))).to.equal("1");
    });

    it("reverts if non-owner & non-approved tries to transfer", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      const tokenId = 1;
      await nft.safeMint(user1.address, tokenId);
      await expect(nft.connect(user2).transferFrom(user1.address, user2.address, tokenId)).to.be.reverted;
    });

    it("reverts when transferring non-existent token", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);
      await expect(nft.connect(user1).transferFrom(user1.address, user2.address, 999)).to.be.reverted;
    });
  });

  // -------------------
  //   Approvals
  // -------------------
  describe("Approvals", function () {
    it("allows approved address to transfer token", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      const tokenId = 1;
      await nft.safeMint(user1.address, tokenId);

      await expect(nft.connect(user1).approve(user2.address, tokenId)).to.emit(nft, "Approval");

      await nft.connect(user2).transferFrom(user1.address, user2.address, tokenId);
      expect(await nft.ownerOf(tokenId)).to.equal(user2.address);
    });

    it("allows operator to transfer all tokens of owner", async function () {
      const { nft, user1, user2, operator } = await loadFixture(deployNftFixture);

      await nft.safeMint(user1.address, 1);
      await nft.safeMint(user1.address, 2);

      await expect(nft.connect(user1).setApprovalForAll(operator.address, true)).to.emit(
        nft,
        "ApprovalForAll"
      );

      await nft.connect(operator).transferFrom(user1.address, user2.address, 1);
      await nft.connect(operator).transferFrom(user1.address, user2.address, 2);

      expect(await toStr(nft.balanceOf(user2.address))).to.equal("2");
    });

    it("prevents operator transfers after revoking approval", async function () {
      const { nft, user1, operator, user2 } = await loadFixture(deployNftFixture);

      await nft.safeMint(user1.address, 1);
      await nft.connect(user1).setApprovalForAll(operator.address, true);
      await nft.connect(user1).setApprovalForAll(operator.address, false);

      await expect(nft.connect(operator).transferFrom(user1.address, user2.address, 1)).to.be.reverted;
    });
  });

  // -------------------
  //   Metadata
  // -------------------
  describe("Metadata", function () {
    it("returns correct tokenURI for existing token", async function () {
      const { nft, user1, baseURI } = await loadFixture(deployNftFixture);

      const tokenId = 1;
      await nft.safeMint(user1.address, tokenId);

      expect(await nft.tokenURI(tokenId)).to.equal(baseURI + tokenId.toString());
    });

    it("reverts tokenURI for non-existent token", async function () {
      const { nft } = await loadFixture(deployNftFixture);
      await expect(nft.tokenURI(1)).to.be.reverted;
    });
  });

  // -------------------
  //   Burning
  // -------------------
  describe("Burning", function () {
    it("updates balance and totalSupply on burn", async function () {
      const { nft, user1 } = await loadFixture(deployNftFixture);

      const tokenId = 1;
      await nft.safeMint(user1.address, tokenId);

      expect(await toStr(nft.totalSupply())).to.equal("1");

      // burn as owner
      await nft.connect(user1).burn(tokenId);

      await expect(nft.ownerOf(tokenId)).to.be.reverted;
      expect(await toStr(nft.totalSupply())).to.equal("0");
      expect(await toStr(nft.balanceOf(user1.address))).to.equal("0");
    });
  });

  // -------------------
  //   Gas
  // -------------------
  describe("Gas", function () {
    it("keeps mint + transfer under a reasonable gas bound", async function () {
      const { nft, user1, user2 } = await loadFixture(deployNftFixture);

      const tokenId = 1;
      const mintTx = await nft.safeMint(user1.address, tokenId);
      const mintReceipt = await mintTx.wait();
      const mintGas = mintReceipt.gasUsed;

      const transferTx = await nft.connect(user1).transferFrom(user1.address, user2.address, tokenId);
      const transferReceipt = await transferTx.wait();
      const transferGas = transferReceipt.gasUsed;

      // compare as numbers
      expect(Number(mintGas.toString())).to.be.lessThan(500000);
      expect(Number(transferGas.toString())).to.be.lessThan(400000);
    });
  });
});
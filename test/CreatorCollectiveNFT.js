const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("CreatorCollectiveNFT", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CreatorCollectiveNFT");
    const mintPrice = ethers.parseEther("0.01");
    const contract = await Factory.deploy(
      "Creator Collective",
      "CCNFT",
      mintPrice,
      "ipfs://collection.json"
    );

    await contract.waitForDeployment();
    return { contract, owner, alice, bob, mintPrice };
  }

  it("mints NFT and stores token URI", async function () {
    const { contract, alice, mintPrice } = await deployFixture();

    await expect(
      contract.connect(alice).safeMint(alice.address, "ipfs://nft-1.json", 10, { value: mintPrice })
    )
      .to.emit(contract, "NFTMinted")
      .withArgs(alice.address, alice.address, 1n, "ipfs://nft-1.json", anyValue);

    expect(await contract.ownerOf(1n)).to.equal(alice.address);
    expect(await contract.tokenURI(1n)).to.equal("ipfs://nft-1.json");
  });

  it("allows holder to create and vote on proposal", async function () {
    const { contract, alice, bob, mintPrice } = await deployFixture();

    await contract.connect(alice).safeMint(alice.address, "ipfs://nft-1.json", 10, { value: mintPrice });
    await contract.connect(bob).safeMint(bob.address, "ipfs://nft-2.json", 5, { value: mintPrice });

    await expect(contract.connect(alice).createProposal("Launch", "Ship on testnet", 3600))
      .to.emit(contract, "ProposalCreated");

    await expect(contract.connect(bob).voteOnProposal(1n, true))
      .to.emit(contract, "ProposalVoted")
      .withArgs(1n, bob.address, true, anyValue);
  });

  it("prevents duplicate votes and supports execution after deadline", async function () {
    const { contract, alice, bob, mintPrice } = await deployFixture();

    await contract.connect(alice).safeMint(alice.address, "ipfs://nft-1.json", 10, { value: mintPrice });
    await contract.connect(bob).safeMint(bob.address, "ipfs://nft-2.json", 5, { value: mintPrice });
    await contract.connect(alice).createProposal("Treasury", "Allocate rewards", 120);

    await contract.connect(alice).voteOnProposal(1n, true);
    await expect(contract.connect(alice).voteOnProposal(1n, false)).to.be.revertedWith("Already voted");

    await contract.connect(bob).voteOnProposal(1n, false);
    await time.increase(121);

    await expect(contract.executeProposal(1n))
      .to.emit(contract, "ProposalExecuted")
      .withArgs(1n, 2n, anyValue);
  });

  it("lets token owner update metadata", async function () {
    const { contract, alice, mintPrice } = await deployFixture();

    await contract.connect(alice).safeMint(alice.address, "ipfs://nft-1.json", 10, { value: mintPrice });
    await contract.connect(alice).updateTokenURI(1n, "ipfs://nft-1-updated.json");

    expect(await contract.tokenURI(1n)).to.equal("ipfs://nft-1-updated.json");
  });
});

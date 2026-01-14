import { expect } from "chai";
import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import { RewardsMerkle, Token } from "../typechain-types";

const hashFn = (data: Buffer) => Buffer.from(ethers.keccak256(data).slice(2), "hex");

const buildTree = (claims: { account: string; amount: string }[]) => {
  const leaves = claims.map(({ account, amount }) =>
    Buffer.from(ethers.solidityPackedKeccak256(["address", "uint256"], [account, amount]).slice(2), "hex")
  );
  const tree = new MerkleTree(leaves, hashFn, { sortPairs: true });
  return { tree, leaves };
};

describe("RewardsMerkle", () => {
  let token: Token;
  let rewards: RewardsMerkle;
  const epoch = 1;
  const zeroAmount = ethers.parseUnits("0", 18).toString();

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();
    const TokenFactory = await ethers.getContractFactory("Token");
    token = (await TokenFactory.deploy(
      "CryptoTracker Token",
      "CTT",
      ethers.parseUnits("1000000", 18),
      owner.address,
      owner.address
    )) as Token;
    await token.waitForDeployment();

    const RewardsFactory = await ethers.getContractFactory("RewardsMerkle");
    rewards = (await RewardsFactory.deploy(await token.getAddress(), owner.address)) as RewardsMerkle;
    await rewards.waitForDeployment();
  });

  it("sets merkle root and allows valid claims", async () => {
    const [, alice, bob] = await ethers.getSigners();
    const claims = [
      { account: alice.address, amount: ethers.parseUnits("100", 18).toString() },
      { account: bob.address, amount: ethers.parseUnits("50", 18).toString() }
    ];

    const { tree } = buildTree(claims);
    const root = tree.getHexRoot();
    await expect(rewards.setMerkleRoot(epoch, root)).to.emit(rewards, "MerkleRootUpdated");

    // fund contract
    await token.mint(await rewards.getAddress(), ethers.parseUnits("1000", 18));

    const aliceLeaf = Buffer.from(
      ethers.solidityPackedKeccak256(["address", "uint256"], [alice.address, claims[0].amount]).slice(2),
      "hex"
    );
    const proof = tree.getHexProof(aliceLeaf);

    await expect(rewards.connect(alice).claim(epoch, claims[0].amount, proof))
      .to.emit(rewards, "Claimed")
      .withArgs(epoch, alice.address, claims[0].amount);

    expect(await rewards.isClaimed(epoch, alice.address)).to.equal(true);
    expect(await token.balanceOf(alice.address)).to.equal(claims[0].amount);
  });

  it("prevents double claim and invalid proofs", async () => {
    const [, alice] = await ethers.getSigners();
    const claim = { account: alice.address, amount: ethers.parseUnits("10", 18).toString() };
    const { tree } = buildTree([claim]);
    const root = tree.getHexRoot();
    await rewards.setMerkleRoot(epoch, root);
    await token.mint(await rewards.getAddress(), ethers.parseUnits("100", 18));

    const leaf = Buffer.from(
      ethers.solidityPackedKeccak256(["address", "uint256"], [claim.account, claim.amount]).slice(2),
      "hex"
    );
    const proof = tree.getHexProof(leaf);

    await rewards.connect(alice).claim(epoch, claim.amount, proof);
    await expect(rewards.connect(alice).claim(epoch, claim.amount, proof)).to.be.revertedWith("already claimed");

    await expect(rewards.connect(alice).claim(epoch + 1, claim.amount, proof)).to.be.revertedWith("root not set");
  });

  it("rejects invalid proof", async () => {
    const [, alice, bob] = await ethers.getSigners();
    const claimAlice = { account: alice.address, amount: "10" };
    const { tree } = buildTree([claimAlice]);
    const root = tree.getHexRoot();
    await rewards.setMerkleRoot(epoch, root);
    await token.mint(await rewards.getAddress(), ethers.parseUnits("100", 18));

    const bobLeaf = Buffer.from(
      ethers.solidityPackedKeccak256(["address", "uint256"], [bob.address, "10"]).slice(2),
      "hex"
    );
    const badProof = tree.getHexProof(bobLeaf);
    await expect(rewards.connect(bob).claim(epoch, "10", badProof)).to.be.revertedWith("invalid proof");
  });

  it("emits events and prevents replay across epochs", async () => {
    const [, alice] = await ethers.getSigners();
    const claim = { account: alice.address, amount: ethers.parseUnits("15", 18).toString() };
    const { tree } = buildTree([claim]);
    const root = tree.getHexRoot();
    await expect(rewards.setMerkleRoot(epoch, root)).to.emit(rewards, "MerkleRootUpdated");
    await token.mint(await rewards.getAddress(), ethers.parseUnits("100", 18));

    const leaf = Buffer.from(
      ethers.solidityPackedKeccak256(["address", "uint256"], [claim.account, claim.amount]).slice(2),
      "hex"
    );
    const proof = tree.getHexProof(leaf);

    await expect(rewards.connect(alice).claim(epoch, claim.amount, proof))
      .to.emit(rewards, "Claimed")
      .withArgs(epoch, alice.address, claim.amount);

    // new epoch, new (different) root; old proof should fail
    const epoch2 = epoch + 1;
    const differentClaim = { account: alice.address, amount: ethers.parseUnits("20", 18).toString() };
    const { tree: tree2 } = buildTree([differentClaim]);
    const root2 = tree2.getHexRoot();
    await rewards.setMerkleRoot(epoch2, root2);
    await expect(rewards.connect(alice).claim(epoch2, claim.amount, proof)).to.be.revertedWith("invalid proof");
  });

  it("only owner can set root and reverts zero amount claim", async () => {
    const [, alice, bob] = await ethers.getSigners();
    const root = ethers.ZeroHash;
    await expect(rewards.connect(alice).setMerkleRoot(epoch, root)).to.be.revertedWith("Ownable: caller is not the owner");

    const claim = { account: bob.address, amount: zeroAmount };
    const { tree } = buildTree([claim]);
    const proof = tree.getHexProof(
      Buffer.from(ethers.solidityPackedKeccak256(["address", "uint256"], [claim.account, claim.amount]).slice(2), "hex")
    );
    await rewards.setMerkleRoot(epoch, tree.getHexRoot());
    await token.mint(await rewards.getAddress(), ethers.parseUnits("10", 18));
    const before = await token.balanceOf(bob.address);
    await expect(rewards.connect(bob).claim(epoch, zeroAmount, proof))
      .to.emit(rewards, "Claimed")
      .withArgs(epoch, bob.address, zeroAmount);
    const after = await token.balanceOf(bob.address);
    expect(after).to.equal(before); // zero transfer
    expect(await rewards.isClaimed(epoch, bob.address)).to.equal(true);
  });

  it("reverts claim when contract is underfunded", async () => {
    const [, alice] = await ethers.getSigners();
    const claim = { account: alice.address, amount: ethers.parseUnits("5", 18).toString() };
    const { tree } = buildTree([claim]);
    await rewards.setMerkleRoot(epoch, tree.getHexRoot());
    // do not fund rewards contract
    const leaf = Buffer.from(
      ethers.solidityPackedKeccak256(["address", "uint256"], [claim.account, claim.amount]).slice(2),
      "hex"
    );
    const proof = tree.getHexProof(leaf);
    await expect(rewards.connect(alice).claim(epoch, claim.amount, proof)).to.be.revertedWith(
      "ERC20: transfer amount exceeds balance"
    );
  });
});

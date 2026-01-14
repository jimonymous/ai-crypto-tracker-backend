import { expect } from "chai";
import { ethers } from "hardhat";
import { Token } from "../typechain-types";

describe("Token", () => {
  let token: Token;
  const initialSupply = ethers.parseUnits("1000000", 18);

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();
    const TokenFactory = await ethers.getContractFactory("Token");
    token = (await TokenFactory.deploy("CryptoTracker Token", "CTT", initialSupply, owner.address, owner.address)) as Token;
    await token.waitForDeployment();
  });

  it("mints initial supply to owner", async () => {
    const [owner] = await ethers.getSigners();
    expect(await token.totalSupply()).to.equal(initialSupply);
    expect(await token.balanceOf(owner.address)).to.equal(initialSupply);
  });

  it("allows owner/minter to mint", async () => {
    const [, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("1000", 18);
    await expect(token.mint(user.address, amount)).to.not.be.reverted;
    expect(await token.balanceOf(user.address)).to.equal(amount);
  });

  it("prevents non-minter from minting", async () => {
    const [, user] = await ethers.getSigners();
    await expect(token.connect(user).mint(user.address, 1)).to.be.revertedWith(
      `AccessControl: account ${user.address.toLowerCase()} is missing role ${ethers.id("MINTER_ROLE")}`
    );
  });

  it("allows granting minter role", async () => {
    const [, , minter] = await ethers.getSigners();
    await token.grantRole(ethers.id("MINTER_ROLE"), minter.address);
    await expect(token.connect(minter).mint(minter.address, 5)).to.not.be.reverted;
    expect(await token.balanceOf(minter.address)).to.equal(5);
  });
});

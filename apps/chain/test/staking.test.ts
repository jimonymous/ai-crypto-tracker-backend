import { expect } from "chai";
import { ethers } from "hardhat";
import { Staking, Token } from "../typechain-types";

describe("Staking", () => {
  let token: Token;
  let staking: Staking;

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();
    const TokenFactory = await ethers.getContractFactory("Token");
    token = (await TokenFactory.deploy(
      "ACT",
      "ACT",
      ethers.parseUnits("1000000", 18),
      owner.address,
      owner.address
    )) as Token;
    await token.waitForDeployment();

    const StakingFactory = await ethers.getContractFactory("Staking");
    staking = (await StakingFactory.deploy(await token.getAddress())) as Staking;
    await staking.waitForDeployment();
  });

  it("allows stake/unstake", async () => {
    const [owner, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("100", 18);
    await token.transfer(user.address, amount);
    await token.connect(user).approve(await staking.getAddress(), amount);
    await staking.connect(user).stake(amount);
    expect(await staking.totalStaked()).to.equal(amount);
    expect(await staking.balances(user.address)).to.equal(amount);

    await staking.connect(user).unstake(amount / 2n);
    expect(await staking.totalStaked()).to.equal(amount / 2n);
  });

  it("tracks multiple users balances independently", async () => {
    const [owner, user, other] = await ethers.getSigners();
    const amount = ethers.parseUnits("50", 18);
    await token.transfer(user.address, amount);
    await token.transfer(other.address, amount);
    await token.connect(user).approve(await staking.getAddress(), amount);
    await token.connect(other).approve(await staking.getAddress(), amount);
    await staking.connect(user).stake(amount);
    await staking.connect(other).stake(amount / 2n);
    expect(await staking.balances(user.address)).to.equal(amount);
    expect(await staking.balances(other.address)).to.equal(amount / 2n);
    expect(await staking.totalStaked()).to.equal(amount + amount / 2n);
    await staking.connect(other).unstake(amount / 4n);
    expect(await staking.balances(other.address)).to.equal(amount / 4n);
  });

  it("reverts on zero or excessive unstake", async () => {
    const [, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("10", 18);
    await token.transfer(user.address, amount);
    await token.connect(user).approve(await staking.getAddress(), amount);
    await staking.connect(user).stake(amount);

    await expect(staking.connect(user).unstake(0)).to.be.revertedWith("amount > 0");
    await expect(staking.connect(user).unstake(amount + 1n)).to.be.revertedWith("insufficient stake");
  });

  it("reverts on zero stake", async () => {
    const [, user] = await ethers.getSigners();
    await expect(staking.connect(user).stake(0)).to.be.revertedWith("amount > 0");
  });
});

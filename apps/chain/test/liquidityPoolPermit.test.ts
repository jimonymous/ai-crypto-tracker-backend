import { expect } from "chai";
import { ethers } from "hardhat";
import { LiquidityPoolStub, Token } from "../typechain-types";

describe("LiquidityPoolStub permit deposit", () => {
  let token: Token;
  let pool: LiquidityPoolStub;

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

    const PoolFactory = await ethers.getContractFactory("LiquidityPoolStub");
    pool = (await PoolFactory.deploy(await token.getAddress())) as LiquidityPoolStub;
    await pool.waitForDeployment();
  });

  it("allows deposit with permit", async () => {
    const [owner, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("20", 18);
    await token.transfer(user.address, amount);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = await token.nonces(user.address);
    const name = await token.name();
    const version = "1";
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = { name, version, chainId, verifyingContract: await token.getAddress() };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    const message = {
      owner: user.address,
      spender: await pool.getAddress(),
      value: amount.toString(),
      nonce: nonce.toString(),
      deadline
    };
    const signature = await user.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(signature);

    await pool.connect(user).depositWithPermit(amount, deadline, v, r, s);
    expect(await pool.totalLiquidity()).to.equal(amount);
  });

  it("rejects expired permit and zero amount", async () => {
    const [, user] = await ethers.getSigners();
    await expect(
      pool.connect(user).depositWithPermit(0, 0, 0, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.reverted;

    const amount = ethers.parseUnits("5", 18);
    await token.transfer(user.address, amount);
    const deadline = 1; // deliberately expired relative to mined block
    const nonce = await token.nonces(user.address);
    const domain = {
      name: await token.name(),
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await token.getAddress()
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    const message = {
      owner: user.address,
      spender: await pool.getAddress(),
      value: amount.toString(),
      nonce: nonce.toString(),
      deadline
    };
    const signature = await user.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(signature);

    // move time forward past current block and the (expired) deadline
    const latest = await ethers.provider.getBlock("latest");
    const futureTs = (latest?.timestamp ?? deadline) + 1000;
    await ethers.provider.send("evm_setNextBlockTimestamp", [futureTs]);
    await ethers.provider.send("evm_mine", []);

    await expect(pool.connect(user).depositWithPermit(amount, deadline, v, r, s)).to.be.reverted;
  });

  it("rejects replay of a permit signature", async () => {
    const [, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("12", 18);
    await token.transfer(user.address, amount);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = await token.nonces(user.address);
    const domain = {
      name: await token.name(),
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await token.getAddress()
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    const message = {
      owner: user.address,
      spender: await pool.getAddress(),
      value: amount.toString(),
      nonce: nonce.toString(),
      deadline
    };
    const sig = await user.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(sig);

    await pool.connect(user).depositWithPermit(amount, deadline, v, r, s);
    await expect(pool.connect(user).depositWithPermit(amount, deadline, v, r, s)).to.be.reverted;
  });

  it("rejects permit signed for wrong spender", async () => {
    const [, user, other] = await ethers.getSigners();
    const amount = ethers.parseUnits("8", 18);
    await token.transfer(user.address, amount);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = await token.nonces(user.address);
    const domain = {
      name: await token.name(),
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await token.getAddress()
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    const message = {
      owner: user.address,
      spender: other.address, // not the pool
      value: amount.toString(),
      nonce: nonce.toString(),
      deadline
    };
    const sig = await user.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(sig);
    await expect(pool.connect(user).depositWithPermit(amount, deadline, v, r, s)).to.be.reverted;
  });

  it("allows withdraw and updates shares/liquidity", async () => {
    const [, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("30", 18);
    await token.transfer(user.address, amount);
    await token.connect(user).approve(await pool.getAddress(), amount);
    await pool.connect(user).deposit(amount);
    expect(await pool.totalLiquidity()).to.equal(amount);
    expect(await pool.shares(user.address)).to.equal(amount);

    await pool.connect(user).withdraw(amount / 3n);
    expect(await pool.shares(user.address)).to.equal(amount - amount / 3n);
    expect(await pool.totalLiquidity()).to.equal(amount - amount / 3n);
  });

  it("reverts withdraw when shares are insufficient", async () => {
    const [, user] = await ethers.getSigners();
    await expect(pool.connect(user).withdraw(1)).to.be.revertedWith("insufficient shares");
  });
});

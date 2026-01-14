import { expect } from "chai";
import { ethers } from "hardhat";
import { Token } from "../typechain-types";

describe("Token (permit)", () => {
  let token: Token;

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
  });

  it("supports permit", async () => {
    const [owner, spender] = await ethers.getSigners();
    const amount = ethers.parseUnits("50", 18);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = await token.nonces(owner.address);
    const name = await token.name();
    const version = "1";
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name,
      version,
      chainId,
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
      owner: owner.address,
      spender: spender.address,
      value: amount.toString(),
      nonce: nonce.toString(),
      deadline
    };

    const signature = await owner.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(signature);
    await token.permit(owner.address, spender.address, amount, deadline, v, r, s);
    await token.connect(spender).transferFrom(owner.address, spender.address, amount);
    expect(await token.balanceOf(spender.address)).to.equal(amount);
  });

  it("rejects invalid signer permit", async () => {
    const [owner, spender, other] = await ethers.getSigners();
    const amount = ethers.parseUnits("5", 18);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = await token.nonces(owner.address);
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
      owner: owner.address,
      spender: spender.address,
      value: amount.toString(),
      nonce: nonce.toString(),
      deadline
    };
    const signature = await other.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(signature);
    await expect(
      token.permit(owner.address, spender.address, amount, deadline, v, r, s)
    ).to.be.reverted;
  });

  it("rejects expired or replayed permits", async () => {
    const [owner, spender] = await ethers.getSigners();
    const amount = ethers.parseUnits("10", 18);
    const expired = Math.floor(Date.now() / 1000) - 10;
    const nonce = await token.nonces(owner.address);
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
      owner: owner.address,
      spender: spender.address,
      value: amount.toString(),
      nonce: nonce.toString(),
      deadline: expired
    };
    const expiredSig = await owner.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(expiredSig);
    await expect(token.permit(owner.address, spender.address, amount, expired, v, r, s)).to.be.reverted;

    // fresh permit succeeds once
    const freshDeadline = Math.floor(Date.now() / 1000) + 3600;
    const freshMessage = { ...message, deadline: freshDeadline, nonce: nonce.toString() };
    const freshSig = await owner.signTypedData(domain, types, freshMessage);
    const fresh = ethers.Signature.from(freshSig);
    await token.permit(owner.address, spender.address, amount, freshDeadline, fresh.v, fresh.r, fresh.s);
    // replaying the same signature should fail because nonce advanced
    await expect(
      token.permit(owner.address, spender.address, amount, freshDeadline, fresh.v, fresh.r, fresh.s)
    ).to.be.reverted;
  });
});

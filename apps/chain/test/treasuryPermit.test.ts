import { expect } from "chai";
import { ethers } from "hardhat";
import { FeeTreasury, Token } from "../typechain-types";

const signPermit = async ({
  token,
  owner,
  spender,
  value,
  deadline
}: {
  token: Token;
  owner: any;
  spender: string;
  value: any;
  deadline: number;
}) => {
  const nonce = await token.nonces(owner.address);
  const name = await token.name();
  const version = "1";
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const verifyingContract = await token.getAddress();
  const domain = {
    name,
    version,
    chainId,
    verifyingContract
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
    spender,
    value: value.toString(),
    nonce: nonce.toString(),
    deadline
  };
  const signature = await owner.signTypedData(domain, types, message);
  return ethers.Signature.from(signature);
};

describe("FeeTreasury with permit", () => {
  let token: Token;
  let treasury: FeeTreasury;

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

    const TreasuryFactory = await ethers.getContractFactory("FeeTreasury");
    treasury = (await TreasuryFactory.deploy(await token.getAddress(), owner.address)) as FeeTreasury;
    await treasury.waitForDeployment();
  });

  it("collects fees with permit signature", async () => {
    const [owner, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("10", 18);
    await token.transfer(user.address, amount);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { v, r, s } = await signPermit({
      token,
      owner: user,
      spender: await treasury.getAddress(),
      value: amount,
      deadline
    });

    await treasury.connect(owner).collectWithPermit(user.address, amount, deadline, v, r, s);
    expect(await token.balanceOf(await treasury.getAddress())).to.equal(amount);
  });

  it("reverts on zero amount", async () => {
    const [owner, user] = await ethers.getSigners();
    await expect(
      treasury.connect(owner).collectWithPermit(user.address, 0, 0, 0, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.revertedWith("amount > 0");
  });

  it("reverts on expired permit", async () => {
    const [owner, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("5", 18);
    await token.transfer(user.address, amount);
    const deadline = Math.floor(Date.now() / 1000) - 10; // already expired
    const { v, r, s } = await signPermit({
      token,
      owner: user,
      spender: await treasury.getAddress(),
      value: amount,
      deadline
    });
    await expect(
      treasury.connect(owner).collectWithPermit(user.address, amount, deadline, v, r, s)
    ).to.be.reverted;
  });

  it("reverts on wrong spender in permit", async () => {
    const [owner, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("5", 18);
    await token.transfer(user.address, amount);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    // sign permit for a different spender
    const { v, r, s } = await signPermit({
      token,
      owner: user,
      spender: owner.address,
      value: amount,
      deadline
    });
    await expect(
      treasury.connect(owner).collectWithPermit(user.address, amount, deadline, v, r, s)
    ).to.be.reverted;
  });

  it("rejects replayed permit use", async () => {
    const [owner, user] = await ethers.getSigners();
    const amount = ethers.parseUnits("7", 18);
    await token.transfer(user.address, amount);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { v, r, s } = await signPermit({
      token,
      owner: user,
      spender: await treasury.getAddress(),
      value: amount,
      deadline
    });
    await treasury.connect(owner).collectWithPermit(user.address, amount, deadline, v, r, s);
    await expect(
      treasury.connect(owner).collectWithPermit(user.address, amount, deadline, v, r, s)
    ).to.be.reverted;
  });

  it("allows only owner to withdraw", async () => {
    const [owner, other] = await ethers.getSigners();
    const amount = ethers.parseUnits("3", 18);
    await token.transfer(await treasury.getAddress(), amount);
    await expect(treasury.connect(other).withdraw(other.address, amount)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
    await expect(treasury.connect(owner).withdraw(other.address, amount)).to.not.be.reverted;
    expect(await token.balanceOf(other.address)).to.equal(amount);
  });

  it("reverts withdraw when treasury balance is insufficient", async () => {
    const [owner] = await ethers.getSigners();
    await expect(treasury.connect(owner).withdraw(owner.address, ethers.parseUnits("1", 18))).to.be.reverted;
  });

  it("collect reverts without allowance", async () => {
    const [, user] = await ethers.getSigners();
    await expect(treasury.connect(user).collect(1)).to.be.reverted;
  });
});

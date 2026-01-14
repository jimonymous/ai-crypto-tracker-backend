import { expect } from "chai";
import { ethers } from "hardhat";
import { PremiumPass } from "../typechain-types";

describe("PremiumPass", () => {
  let pass: PremiumPass;
  const baseURI = "https://example.com/metadata/";

  beforeEach(async () => {
    const PassFactory = await ethers.getContractFactory("PremiumPass");
    pass = (await PassFactory.deploy("Premium Pass", "PPASS", baseURI)) as PremiumPass;
    await pass.waitForDeployment();
  });

  it("mints sequential tokenIds to recipients", async () => {
    const [, user] = await ethers.getSigners();
    const tokenId = await pass.mintTo.staticCall(user.address, "1.json");
    await pass.mintTo(user.address, "1.json");
    expect(tokenId).to.equal(1);
    expect(await pass.ownerOf(1)).to.equal(user.address);
  });

  it("returns tokenURI using base + tokenURI", async () => {
    const [, user] = await ethers.getSigners();
    await pass.mintTo(user.address, "1.json");
    expect(await pass.tokenURI(1)).to.equal(`${baseURI}1.json`);
    const newBase = "https://new-base/";
    await pass.setBaseURI(newBase);
    expect(await pass.tokenURI(1)).to.equal(`${newBase}1.json`);
  });

  it("restricts minting and base URI changes to owner", async () => {
    const [, user, other] = await ethers.getSigners();
    await expect(pass.connect(user).mintTo(user.address, "2.json")).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(pass.connect(user).setBaseURI("https://evil")).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(pass.mintTo(other.address, "3.json")).to.not.be.reverted;
  });
});

import { expect } from "chai";
import { ethers } from "hardhat";
import { GovernanceStub } from "../typechain-types";

describe("GovernanceStub", () => {
  let gov: GovernanceStub;

  beforeEach(async () => {
    const GovFactory = await ethers.getContractFactory("GovernanceStub");
    gov = (await GovFactory.deploy()) as GovernanceStub;
    await gov.waitForDeployment();
  });

  it("creates proposal and records votes", async () => {
    const [proposer, voter] = await ethers.getSigners();
    await gov.connect(proposer).createProposal("Test");
    await gov.connect(voter).vote(1, true, 5);
    const proposal = await gov.proposals(1);
    expect(proposal.yesVotes).to.equal(5);
  });

  it("allows multiple votes and accumulates quorum", async () => {
    const [proposer, voter] = await ethers.getSigners();
    await gov.connect(proposer).createProposal("Quorum");
    await gov.connect(voter).vote(1, true, 1);
    await gov.connect(voter).vote(1, false, 2);
    const proposal = await gov.proposals(1);
    expect(proposal.yesVotes).to.equal(1);
    expect(proposal.noVotes).to.equal(2);
  });

  it("reverts voting on nonexistent proposal", async () => {
    const [, voter] = await ethers.getSigners();
    await expect(gov.connect(voter).vote(999, true, 1)).to.be.revertedWith("proposal not found");
  });
});

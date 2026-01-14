import { ethers, network } from "hardhat";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const deploymentsDir = path.join(__dirname, "..", "deployments");

const saveDeployment = async (data: any) => {
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const filePath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Saved deployment to ${filePath}`);
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkInfo = await deployer.provider?.getNetwork();
  console.log(`Deploying with ${deployer.address} on network ${network.name} chainId=${networkInfo?.chainId}`);

  const Token = await ethers.getContractFactory("Token");
  const initialSupply = ethers.parseUnits("1000000", 18);
  const token = await Token.deploy("CryptoTracker Token", "CTT", initialSupply, deployer.address, deployer.address);
  await token.waitForDeployment();
  console.log(`Token deployed at ${await token.getAddress()}`);

  const PremiumPass = await ethers.getContractFactory("PremiumPass");
  const pass = await PremiumPass.deploy("Premium Pass", "PPASS", "https://example.com/metadata/");
  await pass.waitForDeployment();
  console.log(`PremiumPass deployed at ${await pass.getAddress()}`);

  const Rewards = await ethers.getContractFactory("RewardsMerkle");
  const rewards = await Rewards.deploy(await token.getAddress(), deployer.address);
  await rewards.waitForDeployment();
  console.log(`RewardsMerkle deployed at ${await rewards.getAddress()}`);

  const FeeTreasury = await ethers.getContractFactory("FeeTreasury");
  const treasury = await FeeTreasury.deploy(await token.getAddress(), deployer.address);
  await treasury.waitForDeployment();
  console.log(`FeeTreasury deployed at ${await treasury.getAddress()}`);

  const Staking = await ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(await token.getAddress());
  await staking.waitForDeployment();
  console.log(`Staking deployed at ${await staking.getAddress()}`);

  const LiquidityPool = await ethers.getContractFactory("LiquidityPoolStub");
  const lp = await LiquidityPool.deploy(await token.getAddress());
  await lp.waitForDeployment();
  console.log(`LiquidityPoolStub deployed at ${await lp.getAddress()}`);

  const Governance = await ethers.getContractFactory("GovernanceStub");
  const gov = await Governance.deploy();
  await gov.waitForDeployment();
  console.log(`GovernanceStub deployed at ${await gov.getAddress()}`);

  const deployment = {
    network: network.name,
    chainId: networkInfo?.chainId?.toString() ?? "unknown",
    deployedAt: new Date().toISOString(),
    contracts: {
      token: { address: await token.getAddress(), name: "Token" },
      premiumPass: { address: await pass.getAddress(), name: "PremiumPass" },
      rewardsMerkle: { address: await rewards.getAddress(), name: "RewardsMerkle", token: await token.getAddress() },
      feeTreasury: { address: await treasury.getAddress(), name: "FeeTreasury" },
      staking: { address: await staking.getAddress(), name: "Staking" },
      liquidityPool: { address: await lp.getAddress(), name: "LiquidityPoolStub" },
      governance: { address: await gov.getAddress(), name: "GovernanceStub" }
    }
  };

  await saveDeployment(deployment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

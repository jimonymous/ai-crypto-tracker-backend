# Crypto Tracker Chain (Hardhat)

Solidity contracts and deployment scripts for the CryptoTracker Token (`CTT`, branded “ACT”), PremiumPass, RewardsMerkle, FeeTreasury, and staking/gov/LP stubs.

## Scripts (package.json)
- `npm run test --workspace apps/chain` — deploys to in-memory `hardhat` then runs tests.
- `npm run compile --workspace apps/chain`
- `npm run deploy:local --workspace apps/chain` — deploy to `localhost` (expects RPC at 127.0.0.1:8545).
- `npm run deploy:testnet --workspace apps/chain` — deploy to `sepolia` (configure RPC/PK).
- `npm run test:deploy --workspace apps/chain` — deploy only to `hardhat` network.

## Env (hardhat.config.ts)
- `PRIVATE_KEY` — deployer for non-hardhat networks.
- `SEPOLIA_RPC_URL` or `TESTNET_RPC_URL` — RPC for `sepolia` deploys.

## Deployments
- Artifacts written to `apps/chain/deployments/<network>.json` (e.g., `hardhat.json`, `localhost.json`, `sepolia.json`).
- The API reads these via `CHAIN_DEPLOYMENT` or `MULTICHAIN_JSON`; ensure token/treasury/premium/rewards addresses are present for billing/premium/rewards flows.

## Contracts
- Token (ACT, permit), PremiumPass (ERC721), RewardsMerkle (Merkle claims), FeeTreasury (collect/permit), Staking, LiquidityPoolStub, GovernanceStub.

More detail: `docs/CHAIN_DEPLOY.md` (multi-chain, pricing knobs, deployment expectations).

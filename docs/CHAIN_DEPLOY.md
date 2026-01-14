# Chain deployment notes (multi-chain, permit, ACT pricing)

## Contracts
- Token (CTT/“ACT”) — ERC20 with permit.
- PremiumPass — ERC721 gating.
- RewardsMerkle — Merkle-based rewards claim.
- FeeTreasury — collects ACT fees; supports `collectWithPermit`.
- Staking / LiquidityPoolStub / GovernanceStub — utility stubs for fees/staking.

## Deploy script
- `apps/chain/scripts/deploy.ts` deploys Token, PremiumPass, RewardsMerkle, FeeTreasury, Staking, LiquidityPoolStub, GovernanceStub and writes `apps/chain/deployments/<network>.json`.
- Run: `npm run deploy:local --workspace apps/chain` (or target a configured network; ensure RPC/private key are set).
- For tests: `npm run test --workspace apps/chain` now runs a fresh deploy to the in-memory `hardhat` network before executing tests, regenerating `deployments/hardhat.json` each run. API integration tests, however, **reuse a Hardhat node you start separately** (`cd apps/chain && npx hardhat node --hostname 127.0.0.1 --port 8545`) along with the existing `deployments/hardhat.json`; they do not spin up their own node.
- Tests include permit/treasury/LP negative paths (expired/zero/invalid signatures), RewardsMerkle invalid/replay-proof cases, and standard positive flows.
- All chain tests passing on Hardhat with ethers v6: uses `waitForDeployment`/`getAddress`, `signTypedData`, `Signature.from`, `solidityPackedKeccak256`, and bigint arithmetic. Coverage includes Token permit, FeeTreasury permit, LiquidityPool permit, RewardsMerkle claims/replay protection, Staking stake/unstake, PremiumPass mint/tokenURI, GovernanceStub proposals/votes. Deployment artifacts written to `apps/chain/deployments/hardhat.json`.

## Deployment JSON expectations
- Each `deployments/<network>.json` should include addresses for `token`, `premiumPass`, `rewardsMerkle`, `feeTreasury`, and optionally `staking`/`liquidityPool`/`governance`.
- API reads these via `CHAIN_DEPLOYMENT`/`MULTICHAIN_JSON`; ensure permit-enabled token and FeeTreasury addresses are present for billing/permit flows.

## Scripts (quick reference)
- Local hardhat deploy + tests: `npm run test --workspace apps/chain`
- Deploy only to hardhat: `npm run test:deploy --workspace apps/chain`
- Deploy to localhost RPC: `npm run deploy:local --workspace apps/chain`
- Deploy to Sepolia/testnet: `npm run deploy:testnet --workspace apps/chain` (set `PRIVATE_KEY`, `SEPOLIA_RPC_URL`/`TESTNET_RPC_URL`)

## Multi-chain config for API
- Use `MULTICHAIN_JSON` to pass an array: `{ id, name, rpcUrl, tokenAddress, premiumPassAddress, rewardsAddress, treasuryAddress, decimals?, minBalance?, deployment? }`.
- If omitted, API falls back to `CHAIN_ID`/`CHAIN_RPC_URL` and `CHAIN_DEPLOYMENT`.

## Pricing knobs (ACT)
- Set `ACT_PRICE_PER_CALL` and `ACT_ACCESS_PERIOD_MINUTES` in `apps/api/.env`.
- Treasury address per chain: include `treasuryAddress` in `MULTICHAIN_JSON` (or use `ACT_TREASURY_ADDRESS` fallback).

## After deploy
- Copy the generated deployment JSON into `apps/chain/deployments/` (already written there by the script).
- Update `MULTICHAIN_JSON` or `CHAIN_DEPLOYMENT` to point to the correct network so the API picks up the new addresses.
- Run a quick smoke: `GET /chains`, `GET /billing/price?chainId=<id>`, `GET /premium/status?address=...&chainId=<id>` to verify addresses wired through.

## Integration test gotchas (API billing/premium)
- The API now **re-hydrates deployment data on every access**: it will pick the freshest `apps/chain/deployments/<name>.json` whose `chainId` matches (for Hardhat tests, `hardhat.json`/`localhost.json` with `31337`). If addresses are zeroed or the file is stale, premium/billing tests will fail with 402.
- Billing purchase verification decodes ERC20 `Transfer` logs (and falls back to decoding the tx input) against the token/treasury from the deployment file. When debugging, confirm the deployment JSON has non-zero `token` and `feeTreasury` addresses and matches the running chain RPC.

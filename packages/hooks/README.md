# @nactrace/hooks

Test-framework hooks for [nactrace](https://github.com/Migl992/nectrace): when a transaction fails on Etherlink / Tezos X Previewnet, print the explanation without leaving your terminal. Both hooks are thin: they find a hash and run the `nactrace` CLI.

```
npm i -D @nactrace/hooks
```

## Hardhat 3

```ts
// hardhat.config.ts
import nactrace from "@nactrace/hooks/hardhat";
export default {
  plugins: [nactrace],
  networks: {
    previewnet: {
      type: "http",
      url: "https://evm.previewnet.tezosx.nomadic-labs.com",
      chainId: 128064,
      accounts: [process.env.EVM_PRIVATE_KEY!],
    },
  },
};
```

## Hardhat 2

```ts
// hardhat.config.ts
import "@nactrace/hooks/hardhat2";
```

```
npx hardhat nactrace:last --network previewnet         # last failed tx of the first configured account
npx hardhat nactrace:last --network previewnet --any   # last tx even if it succeeded
npx hardhat nactrace:last --hash 0x…                   # a specific hash or explorer URL
npx hardhat nactrace:last --account 0x… --json
```

The network must be Etherlink previewnet, mainnet or shadownet (detected from the chain id).

## Foundry

```
nactrace-foundry                                       # failed txs of broadcast/**/run-latest.json
nactrace-foundry --broadcast broadcast/Deploy.s.sol/128064/run-latest.json --all
forge test -vvvv 2>&1 | nactrace-foundry --stdin       # any hash printed by a test
nactrace-foundry 0x… oo… -- --explain-only             # explicit hashes, options after -- go to nactrace
```

`forge test` against a fork never lands transactions on chain, so there is no hash to explain there; use broadcast runs or print hashes from your tests.

Running `forge script` against Etherlink today needs three things (details in the repo's `docs/FINDINGS.md`): the RPC shim `scripts/foundry-etherlink-shim.mjs` as `--rpc-url` (Foundry sends bare block hashes the node rejects), `--skip-simulation` (Foundry's own gas estimate is far below what a deployment costs on Etherlink), and a fixed gas on calls you expect to revert (`c.decrement{gas: 3_000_000}()`), otherwise `eth_estimateGas` refuses them before they are sent. When a broadcast call reverts, forge prints `Transaction Failure: <hash>` and stops; `nactrace-foundry` picks that hash up from the broadcast file.

Pre-alpha. MIT.

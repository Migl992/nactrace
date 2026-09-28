# Foundry setup guide

Goal: after a `forge script … --broadcast` on Etherlink / Tezos X, explain every transaction that failed on chain.

## 1. Install

```
npm i -D @nactrace/hooks      # or: npm i -g @nactrace/hooks
```

`nactrace-foundry` and `nactrace` land in `node_modules/.bin`.

## 2. Run forge against Etherlink

Three things are specific to Etherlink today (details and proofs in `docs/FINDINGS.md`, "Foundry against Previewnet"):

1. **Use the RPC shim.** Foundry sends the fork block as a bare block hash, which the Etherlink node rejects (`Z.Overflow`). Start the shim (it ships with `@nactrace/hooks`) and point forge at it:

   ```
   npx nactrace-etherlink-shim                      # proxies http://127.0.0.1:8545 to Previewnet
   npx nactrace-etherlink-shim https://node.mainnet.etherlink.com 8545
   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key $KEY --broadcast --skip-simulation
   ```

2. **Skip Foundry's simulation** (`--skip-simulation`). Its own gas estimate for a deployment is far below what Etherlink charges; the node's `eth_estimateGas` is right.

3. **Give reverting calls a fixed gas.** With node-side estimation a call that will revert is refused before it is sent, so nothing lands on chain to explain. In the script: `counter.decrement{gas: 3_000_000}();`.

When a broadcast call reverts, forge prints `Error: Transaction Failure: <hash>` and stops. The broadcast file (`broadcast/<Script>.s.sol/<chainId>/run-latest.json`) records that transaction with its hash and no receipt.

## 3. Explain

```
npx nactrace-foundry
```

Reads every `run-latest.json` under `./broadcast`, picks the transactions without a successful receipt, takes the network from the file's chain id, and runs `nactrace` on each. Exit code 1 if any reverted.

| command                                                                      | what it does                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `nactrace-foundry --broadcast broadcast/Deploy.s.sol/128064/run-latest.json` | one file                                                   |
| `nactrace-foundry --all`                                                     | every transaction of the broadcast, successful ones too    |
| `forge script … 2>&1 \| nactrace-foundry --stdin`                            | any hash printed by forge (the "Transaction Failure" line) |
| `nactrace-foundry 0x… oo… -- --explain-only`                                 | explicit hashes; everything after `--` goes to `nactrace`  |

## 4. `forge test`

`forge test` against a fork executes in Foundry's own EVM, where the NAC gateway precompile does not exist, and never sends anything to the chain. There is no hash to explain there. Use `forge script --broadcast` runs, or print hashes from your tests and pipe them with `--stdin`.

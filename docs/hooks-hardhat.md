# Hardhat setup guide

Goal: when a test or script fails on Etherlink / Tezos X Previewnet, run one task and read why, without leaving the terminal.

## 1. Install

```
npm i -D @nactrace/hooks
```

This brings `nactrace` (the CLI) and `@nactrace/core` with it. Node 20.16 or newer.

## 2. Register the plugin

**Hardhat 3** (`hardhat.config.ts`):

```ts
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

**Hardhat 2** (`hardhat.config.ts` or `.js`):

```ts
import "@nactrace/hooks/hardhat2";

export default {
  networks: {
    previewnet: {
      url: "https://evm.previewnet.tezosx.nomadic-labs.com",
      chainId: 128064,
      accounts: [process.env.EVM_PRIVATE_KEY!],
    },
  },
};
```

Mainnet (`chainId: 42793`, `https://node.mainnet.etherlink.com`) and Shadownet (`127823`, `https://node.shadownet.etherlink.com`) work the same way; the task recognises the network from the chain id.

## 3. Use it

```
npx hardhat nactrace:last --network previewnet
```

Looks up the most recent **failed** transaction sent by the first configured account (through 0xTzKT), then prints the tree and the one-sentence explanation. Exit code 1 if it reverted.

Other forms:

| command                                            | what it does                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `nactrace:last --network previewnet --any`         | the most recent transaction, even if it succeeded                                        |
| `nactrace:last --network previewnet --account 0x…` | another sender                                                                           |
| `nactrace:last --hash 0x…`                         | a specific hash, or an explorer URL (Blockscout, TzKT, 0xTzKT); a URL's own network wins |
| `nactrace:last … --json`                           | the full Trace JSON (`docs/SCHEMA.md`) instead of the tree                               |

## 4. In a test

Hardhat tests run against a live network keep the hash of a failed send in the error object. A minimal pattern with ethers:

```ts
try {
  await (await counter.decrement()).wait();
} catch (e: any) {
  const hash = e.receipt?.hash ?? e.transactionHash;
  if (hash)
    console.log(`explain with: npx hardhat nactrace:last --network previewnet --hash ${hash}`);
  throw e;
}
```

Or simply run `npx hardhat nactrace:last --network previewnet` after the failing test: it finds the failure by itself.

## Notes

- The lookup of the "last failed transaction" depends on 0xTzKT having indexed it. If the indexer lags (it happened on Previewnet in September 2026), pass `--hash` instead; the explanation itself then comes straight from the nodes.
- Nothing here signs or sends anything. The task only reads.

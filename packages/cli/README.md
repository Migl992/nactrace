# nactrace

Command-line debugger for cross-interface (NAC) calls on Etherlink / Tezos X. Give it a hash from either side and it tells you which leg failed and why.

```
npm i -g nactrace
nactrace 0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716
```

```
nactrace previewnet  REVERTED (atomic, both sides rolled back)

evm tx 0x3977…f716 0x2cad…87b3 → 0x0e11…4b3d 0x2baeceb7  [675409 gas]  ✗ reverted
   error: Cross-runtime call failed with status 400 Bad Request: Failed interpreting the Michelson contract …
└─ ↘ michelson crossing 0x0e11…4b3d → KT1LT…5Tgv %decrement  [30237 gas] mirrored opEnk…mSry  ✗ reverted
      michelson: Transfer(MichelsonContractInterpretError("runtime failure while running the script: failed with: String(\"at zero\") of type String"))
      storage: {"int":"0"} → {"int":"0"}

Why: EVM tx 0x3977…f716 from 0x2cad…87b3 to 0x0e11…4b3d calling 0x2baeceb7 reverted: Michelson entrypoint %decrement of KT1LT…5Tgv failed with FAILWITH "at zero"; whole transaction rolled back on both sides.
```

```
nactrace <hash|url> [options]
  -n, --network <name>   previewnet | mainnet | shadownet (default: auto-detect via 0xTzKT)
  -j, --json             full Trace JSON
  -e, --explain-only     only the one-sentence explanation
      --rpc-only         skip 0xTzKT, rebuild from the EVM and Tezos nodes (needs --network)
      --no-enrich        0xTzKT skeleton only
      --record <dir>     save every response      --replay <dir>  never touch the network
  -v, --verbose          full error strings         --no-color
```

Exit codes: 0 success, 1 reverted or a caught cross-runtime failure, 2 usage or lookup error.

Pre-alpha. Built on [@nactrace/core](https://www.npmjs.com/package/@nactrace/core). Source and issues: https://github.com/Migl992/nectrace. MIT.

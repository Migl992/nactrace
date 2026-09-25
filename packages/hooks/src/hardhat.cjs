// Hardhat plugin: `import "@nactrace/hooks/hardhat"` in hardhat.config, then
//   npx hardhat nactrace:last --network previewnet            # last failed tx of the first account
//   npx hardhat nactrace:last --network previewnet --any      # last tx even if it succeeded
//   npx hardhat nactrace:last --hash 0x…                      # a specific hash or explorer URL
// Plain CommonJS on purpose: Hardhat 2 loads config plugins through require(), and this file has
// no types to keep `hardhat` out of our dependencies. The logic lives in @nactrace/hooks (ESM).
const { task } = require("hardhat/config");

task("nactrace:last", "Explain the last (failed) cross-interface transaction with nactrace")
  .addOptionalParam("hash", "tx hash, op hash or explorer URL to explain instead of looking one up")
  .addOptionalParam("account", "sender address to look up (default: first configured account)")
  .addFlag("any", "take the most recent tx even if it succeeded")
  .addFlag("json", "print the Trace JSON instead of the tree")
  .setAction(async (args, hre) => {
    const hooks = await import("@nactrace/hooks");
    const extra = args.json ? ["--json"] : [];

    const chainId = await hre.network.provider.send("eth_chainId", []);
    const network = hooks.networkForChainId(chainId);
    if (!network) {
      throw new Error(
        `nactrace: network "${hre.network.name}" (chain id ${parseInt(chainId, 16)}) is not Etherlink previewnet/mainnet/shadownet`,
      );
    }

    let hash = args.hash;
    if (!hash) {
      let account = args.account;
      if (!account) {
        const accounts = await hre.network.provider.send("eth_accounts", []);
        account = accounts[0];
      }
      if (!account)
        throw new Error(
          "nactrace: no account configured for this network; pass --account or --hash",
        );
      const recent = await hooks.recentTransactionsOf(account, network, {
        limit: 1,
        failedOnly: !args.any,
      });
      if (recent.length === 0) {
        console.log(
          `nactrace: no ${args.any ? "" : "failed "}transaction from ${account} on ${network}`,
        );
        return;
      }
      hash = recent[0].hash;
      console.log(
        `nactrace: last ${args.any ? "" : "failed "}tx of ${account}: ${hash} (level ${recent[0].level})`,
      );
    }

    const { code } = hooks.runNactrace([hash, "--network", network, ...extra]);
    if (code === 2) throw new Error("nactrace could not explain the transaction");
    process.exitCode = code;
  });

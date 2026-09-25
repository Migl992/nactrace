// Action of the Hardhat 3 task `nactrace:last` (loaded lazily by hardhat.ts, as HH3 requires).
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { networkForChainId, recentTransactionsOf, runNactrace } from "./index.js";

export interface NactraceLastArgs {
  hash: string;
  account: string;
  any: boolean;
  json: boolean;
}

export default async function nactraceLast(
  args: NactraceLastArgs,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  const conn = await hre.network.connect();
  const chainId = (await conn.provider.request({ method: "eth_chainId" })) as string;
  const network = networkForChainId(chainId);
  if (!network) {
    throw new Error(
      `nactrace: network "${conn.networkName}" (chain id ${parseInt(chainId, 16)}) is not Etherlink previewnet/mainnet/shadownet`,
    );
  }
  let hash = args.hash;
  if (!hash) {
    let account = args.account;
    if (!account) {
      const accounts = (await conn.provider.request({ method: "eth_accounts" })) as string[];
      account = accounts[0] ?? "";
    }
    if (!account) {
      throw new Error("nactrace: no account configured for this network; pass --account or --hash");
    }
    const recent = await recentTransactionsOf(account, network, {
      limit: 1,
      failedOnly: !args.any,
    });
    const first = recent[0];
    if (!first) {
      console.log(
        `nactrace: no ${args.any ? "" : "failed "}transaction from ${account} on ${network}`,
      );
      return;
    }
    hash = first.hash;
    console.log(
      `nactrace: last ${args.any ? "" : "failed "}tx of ${account}: ${hash} (level ${first.level})`,
    );
  }
  const { code } = runNactrace([hash, "--network", network, ...(args.json ? ["--json"] : [])]);
  if (code === 2) throw new Error("nactrace could not explain the transaction");
  process.exitCode = code;
}

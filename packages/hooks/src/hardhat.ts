// Hardhat 3 plugin. Usage in hardhat.config.ts:
//   import nactrace from "@nactrace/hooks/hardhat";
//   export default { plugins: [nactrace], networks: { previewnet: { type: "http", url, chainId: 128064, accounts: [...] } } };
// then:
//   npx hardhat nactrace:last --network previewnet [--any] [--json] [--hash <h>] [--account <0x>]
// Hardhat 2 users: `import "@nactrace/hooks/hardhat2"` instead.
import { task } from "hardhat/config";
import type { HardhatPlugin } from "hardhat/types/plugins";

export const nactraceLastTask = task(
  "nactrace:last",
  "Explain the last (failed) cross-interface transaction with nactrace",
)
  .addOption({
    name: "hash",
    description: "tx hash, op hash or explorer URL to explain",
    defaultValue: "",
  })
  .addOption({
    name: "account",
    description: "sender to look up (default: first configured account)",
    defaultValue: "",
  })
  .addFlag({ name: "any", description: "take the most recent tx even if it succeeded" })
  .addFlag({ name: "json", description: "print the Trace JSON instead of the tree" })
  // Hardhat 3 forbids inline actions in plugins (HHE15): the action is a lazy import.
  .setAction(() => import("./hardhat-action.js"))
  .build();

const plugin: HardhatPlugin = {
  id: "nactrace",
  npmPackage: "@nactrace/hooks",
  tasks: [nactraceLastTask],
};

export default plugin;

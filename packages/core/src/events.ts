// Gateway event ABIs, transcribed from the kernel sources (tezos/tezos, master, fetched 2026-09-25):
//   CrossRuntimeCallSent     etherlink/kernel_latest/revm/src/precompiles/runtime_gateway.rs   (sol! block)
//   CrossRuntimeCallReceived etherlink/kernel_latest/tezosx-ethereum-runtime/src/lib.rs        (sol! block, ~L291)
// Both are emitted with `address = RUNTIME_GATEWAY_PRECOMPILE_ADDRESS` (0xff…07). No field is indexed,
// so topic0 is the only topic and every field lives in `data`.
// Kernel version hint: Previewnet v0.10 (2026-08-18). If topic0 stops matching real receipts, the
// nightly CI must flag it here.
import { parseAbi, parseAbiItem, toEventSelector } from "viem";

/**
 * Gateway precompile functions (runtime_gateway.rs `sol!` block). Selectors observed on chain:
 * callMichelson 0xa1544fc3, callMichelsonView 0x8326329c, call 0xfa591a56.
 */
export const gatewayFunctionsAbi = parseAbi([
  "function callMichelson(string destination, string entrypoint, bytes parameters)",
  "function callMichelsonView(string destination, string viewName, bytes input) returns (bytes response)",
  "function call(string url, (string name, string value)[] headers, bytes body, uint8 method) returns (bytes response)",
  "function resolveAddress(string addr, uint8 sourceRuntime, uint8 targetRuntime) view returns (bool classified, uint8 res, string translated)",
  "function originOf(string addr, uint8 sourceRuntime) view returns (uint8 kind, uint8 homeRuntime, string nativeAddress)",
]);

export const EVM_GATEWAY_ADDRESS = "0xff00000000000000000000000000000000000007" as const;

export const crossRuntimeCallSentEvent = parseAbiItem(
  "event CrossRuntimeCallSent(string crossRuntimeCallId, string targetRuntime, string targetAddress, uint256 amount)",
);

export const crossRuntimeCallReceivedEvent = parseAbiItem(
  "event CrossRuntimeCallReceived(string crossRuntimeCallId, string sourceRuntime, string senderAddress, string sourceAddress, string targetAddress, uint256 amount)",
);

export const CROSS_RUNTIME_CALL_SENT_TOPIC0 = toEventSelector(crossRuntimeCallSentEvent);
export const CROSS_RUNTIME_CALL_RECEIVED_TOPIC0 = toEventSelector(crossRuntimeCallReceivedEvent);

export const gatewayEventsAbi = [crossRuntimeCallSentEvent, crossRuntimeCallReceivedEvent] as const;

/** The gateway error prefix (runtime_gateway.rs): a 4xx from the callee becomes a catchable revert. */
export const CROSS_RUNTIME_FAILURE_PREFIX = "Cross-runtime call failed with status ";

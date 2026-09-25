// Address classification and labels (SPEC §6 Address). Facts behind the constants are in
// docs/FINDINGS.md "Aliases".
import { EVM_GATEWAY, MICHELSON_GATEWAY } from "./networks.js";
import type { Address, AddressRole, Runtime } from "./types.js";

/** Kernel attribution accounts: source of every mirrored op / synthetic tx frame. */
export const SYSTEM_ADDRESSES: ReadonlySet<string> = new Set([
  "0x7e20580000000000000000000000000000000001",
  "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU",
]);

export function runtimeOfAddress(value: string): Runtime {
  return value.startsWith("0x") ? "evm" : "michelson";
}

export function isGatewayAddress(value: string): boolean {
  const v = value.toLowerCase();
  return v === EVM_GATEWAY || value === MICHELSON_GATEWAY;
}

export interface AddressHint {
  /** 0xTzKT account type, e.g. x_evm_alias, x_michelson_contract. */
  type?: string | undefined;
  /** Known counterpart in the other runtime. */
  counterpart?: string | undefined;
}

export function classifyAddress(value: string, hint: AddressHint = {}): Address {
  const runtime = runtimeOfAddress(value);
  let role: AddressRole = "unknown";
  let label: string | undefined;
  if (isGatewayAddress(value)) {
    role = "gateway";
    label = runtime === "evm" ? "NAC gateway (EVM side)" : "NAC gateway (Michelson side)";
  } else if (SYSTEM_ADDRESSES.has(value)) {
    role = "system";
    label = "kernel attribution address";
  } else if (hint.type?.endsWith("_alias")) {
    role = "alias";
    label = hint.counterpart ? `alias of ${hint.counterpart}` : "alias";
  } else if (hint.type) {
    role = "native";
    if (hint.type.endsWith("_contract")) label = "contract";
  }
  const out: Address = { value, runtime, role };
  if (hint.counterpart) out.counterpart = hint.counterpart;
  if (label) out.label = label;
  return out;
}

/** 0x1234…abcd / tz1Tj…3Mh style shortening for sentences. */
export function shortAddress(value: string): string {
  if (value.startsWith("0x") && value.length > 12) return `${value.slice(0, 6)}…${value.slice(-4)}`;
  if (value.length > 12) return `${value.slice(0, 5)}…${value.slice(-4)}`;
  return value;
}

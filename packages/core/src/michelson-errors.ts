// Turns the three shapes a Michelson failure reaches us in into one short reason.
// Observed (docs/FINDINGS.md, revert 0x397704…):
//   Tezos RPC internal op error_message:
//     Transfer(MichelsonContractInterpretError("runtime failure while running the script: failed with: String(\"at zero\") of type String"))
//   0xTzKT `errors` / gateway revert string / callTracer `error`:
//     Cross-runtime call failed with status 400 Bad Request: Failed interpreting the Michelson contract with runtime failure while running the script: failed with: String("at zero") of type String
import type { TezosError } from "./tezos.js";

const FAIL_WITH = /failed with: (.+?) of type (\w+)/;

/** `String("at zero")` -> `"at zero"`, `Int(5)` -> `5`, anything else verbatim. */
function normalizeValue(v: string): string {
  const unescaped = v.replace(/\\"/g, '"');
  const m = /^(String|Int|Nat|Bytes|Bool|Unit)\((.*)\)$/s.exec(unescaped);
  return m ? m[2]! : unescaped;
}

/** The FAILWITH payload inside any of the message shapes above, or undefined. */
export function extractFailWith(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const m = FAIL_WITH.exec(text);
  return m ? normalizeValue(m[1]!) : undefined;
}

/** One-line reason for a Tezos RPC error object. */
export function summarizeTezosError(err: TezosError | undefined): string | undefined {
  if (!err) return undefined;
  const fromMessage = extractFailWith(err.error_message);
  if (fromMessage) return `FAILWITH ${fromMessage}`;
  if (err.with) return `FAILWITH ${JSON.stringify(err.with)}`;
  if (err.error_message) return err.error_message;
  return err.id;
}

/** Strip the gateway prefix: "Cross-runtime call failed with status 400 Bad Request: X" -> {status, detail}. */
export function parseGatewayFailure(
  text: string | undefined | null,
): { status: string; detail: string } | undefined {
  if (!text) return undefined;
  const m = /^Cross-runtime call failed with status (\d{3}[^:]*): ?(.*)$/s.exec(text.trim());
  return m ? { status: m[1]!.trim(), detail: m[2]!.trim() } : undefined;
}

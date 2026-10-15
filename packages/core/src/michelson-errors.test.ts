import { describe, expect, it } from "vitest";
import { extractFailWith, parseGatewayFailure, summarizeTezosError } from "./michelson-errors.js";

const RPC_MESSAGE =
  'Transfer(MichelsonContractInterpretError("runtime failure while running the script: failed with: String(\\"at zero\\") of type String"))';
const GATEWAY_MESSAGE =
  'Cross-runtime call failed with status 400 Bad Request: Failed interpreting the Michelson contract with runtime failure while running the script: failed with: String("at zero") of type String';

describe("Michelson error parsing", () => {
  it("extracts the FAILWITH payload from the Tezos RPC error_message", () => {
    expect(extractFailWith(RPC_MESSAGE)).toBe('"at zero"');
  });

  it("extracts the same payload from the gateway revert string", () => {
    expect(extractFailWith(GATEWAY_MESSAGE)).toBe('"at zero"');
    expect(extractFailWith("failed with: Int(5) of type Int")).toBe("5");
    expect(extractFailWith("nothing here")).toBeUndefined();
    expect(extractFailWith(undefined)).toBeUndefined();
  });

  it("summarizes a Tezos error object", () => {
    expect(summarizeTezosError({ id: "tezlink_error", error_message: RPC_MESSAGE })).toBe(
      'FAILWITH "at zero"',
    );
    expect(summarizeTezosError({ id: "proto.x.gas_exhausted" })).toBe("proto.x.gas_exhausted");
    expect(summarizeTezosError(undefined)).toBeUndefined();
  });

  it("splits the gateway status from its detail", () => {
    // The "Failed interpreting the Michelson contract with " prefix is dropped; the runtime failure
    // text stays so extractFailWith can still read the payload.
    expect(parseGatewayFailure(GATEWAY_MESSAGE)).toEqual({
      status: "400 Bad Request",
      detail:
        'runtime failure while running the script: failed with: String("at zero") of type String',
    });
    expect(
      parseGatewayFailure(
        "Cross-runtime call failed with status 400 Bad Request: Failed interpreting the Michelson contract with failed typechecking input: no such entrypoint: nope",
      ),
    ).toEqual({ status: "400 Bad Request", detail: 'no such entrypoint "nope"' });
    expect(
      parseGatewayFailure("Cross-runtime call failed with status 429 Too Many Requests: OOG"),
    ).toEqual({
      status: "429 Too Many Requests",
      detail: "out of gas",
    });
    expect(parseGatewayFailure("execution reverted")).toBeUndefined();
  });
});

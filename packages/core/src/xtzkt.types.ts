// GENERATED FILE — do not edit. Produced by scripts/gen-xtzkt-types.mjs from recorded 0xTzKT
// responses (107 rows across 80 fixtures, generated 2026-09-25).
// Every field is optional and every object carries an index signature: 0xTzKT is still adding
// fields (Baking Bad, 2026-09-25) and unknown fields must never break parsing.

/** Account reference as it appears in sender/target/initiator/alias/gateway. */
export interface XtzktAccountRef {
  hash?: string;
  id?: number;
  type?: string;
  [key: string]: unknown;
}

/** One leg of a transaction as returned by GET /v1/operations/transaction?hash=… */
export interface XtzktTransactionRowFields {
  /** seen in 83/107 rows (x_evm_michelson, x_michelson_evm) */
  alias?: XtzktAccountRef;
  /** seen in 24/107 rows (x_evm, x_michelson); e.g. "10000000000000000", "0", "1000000000000000" */
  amount?: string | number;
  /** seen in 83/107 rows (x_evm_michelson, x_michelson_evm); e.g. "10000000000000000", "1000000000000000000", "99950000000000000000" */
  amountReceived?: number | string;
  /** seen in 83/107 rows (x_evm_michelson, x_michelson_evm); e.g. "20000000000000000", "10000000000000000", "1000000000000000" */
  amountSent?: string | number;
  /** seen in 3/107 rows (x_evm_michelson) */
  bigMapUpdates?: number;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  chain?: {
    chainId?: string;
    id?: number;
    layer?: string;
    [key: string]: unknown;
  };
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  counter?: number;
  /** seen in 100/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "1768000000000000", "600000000000000", "0" */
  daFee?: string | number;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "x_evm_michelson", "x_michelson_evm", "x_evm" */
  direction?: string;
  /** seen in 21/107 rows (x_evm, x_evm_michelson); e.g. "1000000000" */
  effectiveGasPrice?: string;
  /** seen in 67/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "withdraw_base58(string)", "fast_withdraw_base58(string,string,bytes…", "get_and_increment()" */
  entrypoint?: string;
  /** seen in 22/107 rows (x_evm, x_evm_michelson); e.g. "Cross-runtime call failed with status 40…", "Cross-runtime call failed with status 42…" */
  errors?: string;
  /** seen in 100/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "779031000000000", "171039000000000", "0" */
  gasFee?: string | number;
  /** seen in 19/107 rows (x_michelson, x_michelson_evm) */
  gasFeeRefunded?: number;
  /** seen in 100/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  gasLimit?: number;
  /** seen in 21/107 rows (x_evm, x_evm_michelson); e.g. "2000000001", "2000000000", "1200000000" */
  gasPrice?: string;
  /** seen in 26/107 rows (x_michelson, x_michelson_evm) */
  gasRefund?: number;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  gasUsed?: number;
  /** seen in 83/107 rows (x_evm_michelson, x_michelson_evm) */
  gateway?: XtzktAccountRef;
  /** seen in 83/107 rows (x_evm_michelson, x_michelson_evm); e.g. "call(string,(string,string)[],bytes,uint…", "callMichelson(string,string,bytes)", "call_evm" */
  gatewayEntrypoint?: string;
  /** seen in 39/107 rows (x_evm_michelson); e.g. "0xfa591a56000000000000000000000000000000…", "0xa1544fc3000000000000000000000000000000…" */
  gatewayInput?: string;
  /** seen in 83/107 rows (x_evm_michelson, x_michelson_evm) */
  gatewayParameters?: {
    body?: string;
    bytes?: string;
    contract?: null | string;
    destination?: string;
    entrypoint?: string;
    headers?: unknown[];
    list?: unknown[];
    method?: string;
    nat?: string;
    parameters?: string;
    string?: string;
    string_0?: string;
    string_1?: string;
    url?: string;
    [key: string]: unknown;
  };
  /** seen in 44/107 rows (x_michelson_evm) */
  gatewayParametersRaw?: {
    args?: Record<string, unknown>[];
    prim?: string;
    [key: string]: unknown;
  };
  /** seen in 65/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  guessed?: boolean;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "0xc5e137c2ba6016f2dc7170edbf1dc03e0e7599…", "0xf4f48ca755363f51db8a835849aaa05bb1fc91…", "opZX4Z3TuidPmJDB93WatMNKBfbkDQipUXvFiVeS…" */
  hash?: string;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "1154781046073458688", "1154780987551383552", "1154794335067176960" */
  id?: string;
  /** seen in 57/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  initiator?: XtzktAccountRef;
  /** seen in 61/107 rows (x_evm, x_michelson_evm); e.g. "0xcda4fee2000000000000000000000000000000…", "0x67a32cd7000000000000000000000000000000…", "0xc5d24601" */
  input?: string;
  /** seen in 36/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  internalOperations?: number;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  level?: number;
  /** seen in 37/107 rows (x_evm, x_michelson_evm) */
  logsCount?: number;
  /** seen in 21/107 rows (x_evm, x_evm_michelson); e.g. "2000000001", "2000000000", "1200000000" */
  maxFeePerGas?: string;
  /** seen in 21/107 rows (x_evm, x_evm_michelson); e.g. "1", "0" */
  maxPriorityFeePerGas?: string;
  /** seen in 18/107 rows (x_michelson, x_michelson_evm) */
  nonce?: number;
  /** seen in 60/107 rows (x_evm, x_evm_michelson); e.g. "call", "static_call" */
  opCode?: string;
  /** seen in 60/107 rows (x_evm, x_evm_michelson); e.g. "trace", "dynamic_fee" */
  opType?: string;
  /** seen in 26/107 rows (x_evm, x_michelson_evm); e.g. "0x00000000000000000000000000000000000000…", "0x00005e6b9592a2eb45707781e4ff66001527a1…", "0x43726f73732d72756e74696d652063616c6c20…" */
  output?: string;
  /** seen in 59/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "0000000000000000000000000000000000000000…" */
  parameters?:
    | string
    | {
        add_operator?: Record<string, unknown>;
        from_?: string;
        txs?: unknown[];
        [key: string]: unknown;
      }[]
    | {
        amount?: string;
        collection?: string;
        destination?: string;
        entrypoint?: string;
        erc20?: string;
        evm_token_id?: string;
        fastWithdrawalContract?: string;
        from?: string;
        input?: string;
        parameters?: string;
        payload?: string;
        spender?: string;
        target?: string;
        to?: string;
        value?: string;
        viewName?: string;
        [key: string]: unknown;
      };
  /** seen in 34/107 rows (x_evm_michelson, x_michelson) */
  parametersRaw?:
    | {
        args?: unknown[];
        prim?: string;
        [key: string]: unknown;
      }[]
    | {
        args?: Record<string, unknown>[];
        bytes?: string;
        prim?: string;
        string?: string;
        [key: string]: unknown;
      };
  /** seen in 12/107 rows (x_evm, x_michelson_evm) */
  result?: {
    counter?: string;
    recipient?: string;
    response?: string;
    success?: boolean;
    [key: string]: unknown;
  };
  /** seen in 39/107 rows (x_evm_michelson); e.g. "0" */
  roundingLoss?: string;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  sender?: XtzktAccountRef;
  /** seen in 55/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  senderCodeHash?: number;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "applied", "failed", "backtracked" */
  status?: string;
  /** seen in 1/107 rows (x_michelson) */
  storageFee?: number;
  /** seen in 45/107 rows (x_michelson, x_michelson_evm) */
  storageLimit?: number;
  /** seen in 47/107 rows (x_michelson, x_michelson_evm) */
  storageUsed?: number;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  target?: XtzktAccountRef;
  /** seen in 89/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  targetCodeHash?: number;
  /** seen in 107/107 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "2026-08-21T08:59:01.5Z", "2026-08-21T07:20:48.5Z", "2026-09-15T12:06:19Z" */
  timestamp?: string;
  /** seen in 14/107 rows (x_evm_michelson, x_michelson_evm) */
  tokenTransfers?: number;
}

export type XtzktTransactionRow = XtzktTransactionRowFields & { [key: string]: unknown };

/** Field paths observed when this file was generated (for the nightly schema diff). */
export const XTZKT_OBSERVED_FIELDS: readonly string[] = [
  "alias",
  "alias.hash",
  "alias.id",
  "alias.type",
  "amount",
  "amountReceived",
  "amountSent",
  "bigMapUpdates",
  "chain",
  "chain.chainId",
  "chain.id",
  "chain.layer",
  "counter",
  "daFee",
  "direction",
  "effectiveGasPrice",
  "entrypoint",
  "errors",
  "gasFee",
  "gasFeeRefunded",
  "gasLimit",
  "gasPrice",
  "gasRefund",
  "gasUsed",
  "gateway",
  "gateway.hash",
  "gateway.id",
  "gateway.type",
  "gatewayEntrypoint",
  "gatewayInput",
  "gatewayParameters",
  "gatewayParameters.body",
  "gatewayParameters.bytes",
  "gatewayParameters.contract",
  "gatewayParameters.destination",
  "gatewayParameters.entrypoint",
  "gatewayParameters.headers",
  "gatewayParameters.list",
  "gatewayParameters.method",
  "gatewayParameters.nat",
  "gatewayParameters.parameters",
  "gatewayParameters.string",
  "gatewayParameters.string_0",
  "gatewayParameters.string_1",
  "gatewayParameters.url",
  "gatewayParametersRaw",
  "gatewayParametersRaw.args",
  "gatewayParametersRaw.args[].args",
  "gatewayParametersRaw.args[].args[].args",
  "gatewayParametersRaw.args[].args[].args[].args",
  "gatewayParametersRaw.args[].args[].args[].args[].bytes",
  "gatewayParametersRaw.args[].args[].args[].args[].int",
  "gatewayParametersRaw.args[].args[].args[].args[].prim",
  "gatewayParametersRaw.args[].args[].args[].bytes",
  "gatewayParametersRaw.args[].args[].args[].prim",
  "gatewayParametersRaw.args[].args[].prim",
  "gatewayParametersRaw.args[].args[].string",
  "gatewayParametersRaw.args[].prim",
  "gatewayParametersRaw.args[].string",
  "gatewayParametersRaw.prim",
  "guessed",
  "hash",
  "id",
  "initiator",
  "initiator.hash",
  "initiator.id",
  "initiator.type",
  "input",
  "internalOperations",
  "level",
  "logsCount",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "nonce",
  "opCode",
  "opType",
  "output",
  "parameters",
  "parameters.amount",
  "parameters.collection",
  "parameters.destination",
  "parameters.entrypoint",
  "parameters.erc20",
  "parameters.evm_token_id",
  "parameters.fastWithdrawalContract",
  "parameters.from",
  "parameters.input",
  "parameters.parameters",
  "parameters.payload",
  "parameters.spender",
  "parameters.target",
  "parameters.to",
  "parameters.value",
  "parameters.viewName",
  "parameters[].add_operator",
  "parameters[].add_operator.operator",
  "parameters[].add_operator.owner",
  "parameters[].add_operator.token_id",
  "parameters[].from_",
  "parameters[].txs",
  "parameters[].txs[].amount",
  "parameters[].txs[].to_",
  "parameters[].txs[].token_id",
  "parametersRaw",
  "parametersRaw.args",
  "parametersRaw.args[].args",
  "parametersRaw.args[].args[].args",
  "parametersRaw.args[].args[].args[].bytes",
  "parametersRaw.args[].args[].args[].int",
  "parametersRaw.args[].args[].bytes",
  "parametersRaw.args[].args[].int",
  "parametersRaw.args[].args[].prim",
  "parametersRaw.args[].int",
  "parametersRaw.args[].prim",
  "parametersRaw.bytes",
  "parametersRaw.prim",
  "parametersRaw.string",
  "parametersRaw[].args",
  "parametersRaw[].args[].args",
  "parametersRaw[].args[].args[].args",
  "parametersRaw[].args[].args[].args[].bytes",
  "parametersRaw[].args[].args[].args[].int",
  "parametersRaw[].args[].args[].bytes",
  "parametersRaw[].args[].args[].prim",
  "parametersRaw[].args[].bytes",
  "parametersRaw[].args[].prim",
  "parametersRaw[].prim",
  "result",
  "result.counter",
  "result.recipient",
  "result.response",
  "result.success",
  "roundingLoss",
  "sender",
  "sender.hash",
  "sender.id",
  "sender.type",
  "senderCodeHash",
  "status",
  "storageFee",
  "storageLimit",
  "storageUsed",
  "target",
  "target.hash",
  "target.id",
  "target.type",
  "targetCodeHash",
  "timestamp",
  "tokenTransfers",
];

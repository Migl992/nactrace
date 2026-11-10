// GENERATED FILE — do not edit. Produced by scripts/gen-xtzkt-types.mjs from recorded 0xTzKT
// responses (218 rows across 109 fixtures, generated 2026-11-10).
// Every field is optional and every object carries an index signature: 0xTzKT is still adding
// fields (Baking Bad, 2026-09-25) and unknown fields must never break parsing.

/** Account reference as it appears in sender/target/initiator/alias/gateway. */
export interface XtzktAccountRef {
  domain?: string;
  hash?: string;
  id?: number;
  owner?: Record<string, unknown>;
  profile?: string;
  type?: string;
  [key: string]: unknown;
}

/** One leg of a transaction as returned by GET /v1/operations/transaction?hash=… */
export interface XtzktTransactionRowFields {
  /** seen in 147/218 rows (x_evm_michelson, x_michelson_evm) */
  alias?: XtzktAccountRef;
  /** seen in 71/218 rows (x_evm, x_michelson); e.g. "10000000000000000", "0", "1000000000000000000" */
  amount?: string | number;
  /** seen in 147/218 rows (x_evm_michelson, x_michelson_evm); e.g. "0", "10000000000000000", "1000000000000000000" */
  amountReceived?: number | string;
  /** seen in 147/218 rows (x_evm_michelson, x_michelson_evm); e.g. "20000000000000000", "10000000000000000", "1000000000000000000" */
  amountSent?: string | number;
  /** seen in 4/218 rows (x_michelson) */
  bigMapUpdates?: number;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  chain?: {
    chainId?: string;
    id?: number;
    layer?: string;
    [key: string]: unknown;
  };
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  counter?: number;
  /** seen in 137/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "1768000000000000", "600000000000000", "1896000000000000" */
  daFee?: string | number;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "x_evm_michelson", "x_michelson_evm", "x_evm" */
  direction?: string;
  /** seen in 59/218 rows (x_evm, x_evm_michelson); e.g. "1000000000" */
  effectiveGasPrice?: string;
  /** seen in 79/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "withdraw_base58(string)", "fast_withdraw_base58(string,string,bytes…", "get_and_increment()" */
  entrypoint?: string;
  /** seen in 36/218 rows (x_evm, x_evm_michelson, x_michelson); e.g. "OutOfGas", "1167d8fb00000000000000000000000000000000…", "Cross-runtime call failed with status 40…" */
  errors?: string;
  /** seen in 137/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "779031000000000", "171039000000000", "125911000000000" */
  gasFee?: string | number;
  /** seen in 78/218 rows (x_michelson, x_michelson_evm) */
  gasFeeRefunded?: number;
  /** seen in 137/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  gasLimit?: number;
  /** seen in 59/218 rows (x_evm, x_evm_michelson); e.g. "2000000001", "2000000000", "1200000000" */
  gasPrice?: string;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  gasUsed?: number;
  /** seen in 147/218 rows (x_evm_michelson, x_michelson_evm) */
  gateway?: XtzktAccountRef;
  /** seen in 147/218 rows (x_evm_michelson, x_michelson_evm); e.g. "call(string,(string,string)[],bytes,uint…", "callMichelson(string,string,bytes)", "call_evm" */
  gatewayEntrypoint?: string;
  /** seen in 71/218 rows (x_evm_michelson); e.g. "0xfa591a56000000000000000000000000000000…", "0xa1544fc3000000000000000000000000000000…" */
  gatewayInput?: string;
  /** seen in 147/218 rows (x_evm_michelson, x_michelson_evm) */
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
  /** seen in 76/218 rows (x_michelson_evm) */
  gatewayParametersRaw?: {
    args?: Record<string, unknown>[];
    prim?: string;
    [key: string]: unknown;
  };
  /** seen in 78/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  guessed?: boolean;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "0xc5e137c2ba6016f2dc7170edbf1dc03e0e7599…", "0xf4f48ca755363f51db8a835849aaa05bb1fc91…", "ooUkfnnNPGDmcX9Yzrj46sC8Ph2pB53Cw8QfQGRi…" */
  hash?: string;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "1154781046073458688", "1154780987551383552", "1154818034499584000" */
  id?: string;
  /** seen in 81/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  initiator?: XtzktAccountRef;
  /** seen in 114/218 rows (x_evm, x_michelson_evm); e.g. "0x5c36b186", "0xcda4fee2000000000000000000000000000000…", "0x67a32cd7000000000000000000000000000000…" */
  input?: string;
  /** seen in 53/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  internalOperations?: number;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  level?: number;
  /** seen in 34/218 rows (x_evm, x_michelson_evm) */
  logsCount?: number;
  /** seen in 57/218 rows (x_evm, x_evm_michelson); e.g. "2000000001", "2000000000", "1200000000" */
  maxFeePerGas?: string;
  /** seen in 57/218 rows (x_evm, x_evm_michelson); e.g. "1", "0" */
  maxPriorityFeePerGas?: string;
  /** seen in 9/218 rows (x_michelson, x_michelson_evm) */
  nonce?: number;
  /** seen in 131/218 rows (x_evm, x_evm_michelson); e.g. "call", "static_call", "delegate_call" */
  opCode?: string;
  /** seen in 131/218 rows (x_evm, x_evm_michelson); e.g. "trace", "dynamic_fee", "legacy" */
  opType?: string;
  /** seen in 46/218 rows (x_evm, x_michelson_evm); e.g. "0x00000000000000000000000000000000000000…", "0x00005e6b9592a2eb45707781e4ff66001527a1…", "0x1167d8fb000000000000000000000000000000…" */
  output?: string;
  /** seen in 74/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "1", "-13", "5" */
  parameters?:
    | string
    | number
    | {
        from_?: string;
        txs?: unknown[];
        [key: string]: unknown;
      }[]
    | {
        account?: string;
        addr?: string;
        amount?: string;
        ask_id?: string;
        buyer?: string;
        condition_extra?: null;
        destination?: string;
        entrypoint?: string;
        fastWithdrawalContract?: string;
        from?: string;
        input?: string;
        item?: string;
        paid?: string;
        parameters?: string;
        payload?: string;
        proxy_for?: null;
        referrers?: {
          [key: string]: unknown;
        };
        sourceRuntime?: string;
        spender?: string;
        target?: string;
        targetRuntime?: string;
        to?: string;
        value?: string;
        viewName?: string;
        withdrawalId?: string;
        [key: string]: unknown;
      };
  /** seen in 34/218 rows (x_evm_michelson, x_michelson) */
  parametersRaw?:
    | {
        args?: unknown[];
        prim?: string;
        [key: string]: unknown;
      }[]
    | {
        args?: Record<string, unknown>[];
        bytes?: string;
        int?: string;
        prim?: string;
        string?: string;
        [key: string]: unknown;
      };
  /** seen in 20/218 rows (x_evm, x_michelson_evm) */
  result?: {
    balance?: string;
    counter?: string;
    recipient?: string;
    response?: string;
    success?: boolean;
    [key: string]: unknown;
  };
  /** seen in 71/218 rows (x_evm_michelson); e.g. "0", "162686273" */
  roundingLoss?: string;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  sender?: XtzktAccountRef;
  /** seen in 79/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  senderCodeHash?: number;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "applied", "failed", "backtracked" */
  status?: string;
  /** seen in 2/218 rows (x_michelson) */
  storageFee?: number;
  /** seen in 78/218 rows (x_michelson, x_michelson_evm) */
  storageLimit?: number;
  /** seen in 87/218 rows (x_michelson, x_michelson_evm) */
  storageUsed?: number;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  target?: XtzktAccountRef;
  /** seen in 133/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm) */
  targetCodeHash?: number;
  /** seen in 218/218 rows (x_evm, x_evm_michelson, x_michelson, x_michelson_evm); e.g. "2026-08-21T08:59:01.5Z", "2026-08-21T07:20:48.5Z", "2026-10-29T10:19:06Z" */
  timestamp?: string;
  /** seen in 4/218 rows (x_evm, x_michelson) */
  tokenTransfers?: number;
}

export type XtzktTransactionRow = XtzktTransactionRowFields & { [key: string]: unknown };

/** Field paths observed when this file was generated (for the nightly schema diff). */
export const XTZKT_OBSERVED_FIELDS: readonly string[] = [
  "alias",
  "alias.hash",
  "alias.id",
  "alias.owner",
  "alias.owner.domain",
  "alias.owner.hash",
  "alias.owner.id",
  "alias.owner.profile",
  "alias.owner.type",
  "alias.profile",
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
  "gasUsed",
  "gateway",
  "gateway.hash",
  "gateway.id",
  "gateway.profile",
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
  "initiator.profile",
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
  "parameters.account",
  "parameters.addr",
  "parameters.amount",
  "parameters.ask_id",
  "parameters.buyer",
  "parameters.condition_extra",
  "parameters.destination",
  "parameters.entrypoint",
  "parameters.fastWithdrawalContract",
  "parameters.from",
  "parameters.input",
  "parameters.item",
  "parameters.paid",
  "parameters.parameters",
  "parameters.payload",
  "parameters.proxy_for",
  "parameters.referrers",
  "parameters.sourceRuntime",
  "parameters.spender",
  "parameters.target",
  "parameters.targetRuntime",
  "parameters.to",
  "parameters.value",
  "parameters.viewName",
  "parameters.withdrawalId",
  "parameters[].from_",
  "parameters[].txs",
  "parameters[].txs[].amount",
  "parameters[].txs[].to_",
  "parameters[].txs[].token_id",
  "parametersRaw",
  "parametersRaw.args",
  "parametersRaw.args[].args",
  "parametersRaw.args[].args[].args",
  "parametersRaw.args[].args[].args[].args",
  "parametersRaw.args[].args[].args[].args[].prim",
  "parametersRaw.args[].args[].args[].prim",
  "parametersRaw.args[].args[].bytes",
  "parametersRaw.args[].args[].int",
  "parametersRaw.args[].args[].prim",
  "parametersRaw.args[].int",
  "parametersRaw.args[].prim",
  "parametersRaw.bytes",
  "parametersRaw.int",
  "parametersRaw.prim",
  "parametersRaw.string",
  "parametersRaw[].args",
  "parametersRaw[].args[].bytes",
  "parametersRaw[].prim",
  "result",
  "result.balance",
  "result.counter",
  "result.recipient",
  "result.response",
  "result.success",
  "roundingLoss",
  "sender",
  "sender.domain",
  "sender.hash",
  "sender.id",
  "sender.owner",
  "sender.owner.hash",
  "sender.owner.id",
  "sender.owner.profile",
  "sender.owner.type",
  "sender.profile",
  "sender.type",
  "senderCodeHash",
  "status",
  "storageFee",
  "storageLimit",
  "storageUsed",
  "target",
  "target.hash",
  "target.id",
  "target.owner",
  "target.owner.hash",
  "target.owner.id",
  "target.owner.profile",
  "target.owner.type",
  "target.profile",
  "target.type",
  "targetCodeHash",
  "timestamp",
  "tokenTransfers",
];

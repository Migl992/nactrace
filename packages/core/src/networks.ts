export type NetworkName = "previewnet" | "mainnet" | "shadownet";

export interface NetworkConfig {
  name: NetworkName;
  evmRpc: string;
  evmChainId: number;
  michelsonRpc: string;
  xtzktApi: string;
  blockscout?: string;
}

/** Same on every network (SPEC §2). */
export const EVM_GATEWAY = "0xff00000000000000000000000000000000000007" as const;
export const MICHELSON_GATEWAY = "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw" as const;

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  previewnet: {
    name: "previewnet",
    evmRpc: "https://evm.previewnet.tezosx.nomadic-labs.com",
    evmChainId: 128064,
    michelsonRpc: "https://michelson.previewnet.tezosx.nomadic-labs.com",
    xtzktApi: "https://api.previewnet.xtzkt.io",
    blockscout: "https://blockscout.previewnet.tezosx.nomadic-labs.com",
  },
  mainnet: {
    name: "mainnet",
    evmRpc: "https://node.mainnet.etherlink.com",
    evmChainId: 42793,
    michelsonRpc: "https://michelson.etherlink.mainnet.octez.io",
    xtzktApi: "https://api.xtzkt.io",
    blockscout: "https://explorer.etherlink.com",
  },
  shadownet: {
    name: "shadownet",
    evmRpc: "https://node.shadownet.etherlink.com",
    evmChainId: 127823,
    michelsonRpc: "https://michelson.etherlink.shadownet.octez.io",
    xtzktApi: "https://api.shadownet.xtzkt.io",
    blockscout: "https://shadownet.explorer.etherlink.com",
  },
};

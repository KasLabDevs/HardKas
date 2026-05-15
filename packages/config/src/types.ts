export type HardkasTargetKind =
  | "simulated"
  | "kaspa-node"
  | "kaspa-rpc"
  | "igra";

export type HardkasNetworkName = string;

export interface HardkasSimulatedTarget {
  kind: "simulated";
}

export interface HardkasKaspaNodeTarget {
  kind: "kaspa-node";
  network: "mainnet" | "testnet-10" | "testnet-11" | "testnet-12" | "devnet";
  rpcUrl?: string;
  dataDir?: string;
  binaryPath?: string;
}

export interface HardkasKaspaRpcTarget {
  kind: "kaspa-rpc";
  network: "mainnet" | "testnet-10" | "testnet-11" | "testnet-12" | "devnet";
  rpcUrl: string;
}

export interface HardkasIgraTarget {
  kind: "igra";
  chainId: number;
  rpcUrl: string;
  currencySymbol?: "iKAS";
}

export type HardkasNetworkTarget =
  | HardkasSimulatedTarget
  | HardkasKaspaNodeTarget
  | HardkasKaspaRpcTarget
  | HardkasIgraTarget;

export type HardkasAccountConfig =
  | { kind: "simulated"; address?: string }
  | { kind: "kaspa-private-key"; privateKeyEnv: string; address?: string }
  | { kind: "external-wallet"; walletId?: string; address?: string }
  | { kind: "evm-private-key"; privateKeyEnv: string; address?: string };

export interface HardkasConfig {
  defaultNetwork?: HardkasNetworkName;
  networks?: Record<HardkasNetworkName, HardkasNetworkTarget>;
  accounts?: Record<string, HardkasAccountConfig>;
  l2?: {
    networks?: Record<string, any>; // Will be refined in @hardkas/l2
  };
}

export interface LoadedHardkasConfig {
  path?: string;
  cwd: string;
  config: HardkasConfig;
}

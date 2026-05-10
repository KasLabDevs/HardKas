export type KaspaRealNetwork =
  | "mainnet"
  | "testnet-10"
  | "testnet-11"
  | "testnet-12"
  | "devnet";

export interface KaspaNodeConfig {
  network: KaspaRealNetwork;
  binaryPath?: string;
  dataDir?: string;
  rpcListen?: string;
  p2pListen?: string;
  enableUtxoIndex?: boolean;
  reset?: boolean;
  extraArgs?: string[];
}

export interface KaspaNodeRuntimeConfig {
  network: KaspaRealNetwork;
  binaryPath: string;
  dataDir: string;
  pidFile: string;
  logFile: string;
  configFile: string;
  rpcListen: string;
  rpcUrl: string;
  args: string[];
}

export interface KaspaNodeStatus {
  running: boolean;
  pid?: number;
  network?: KaspaRealNetwork;
  rpcUrl?: string;
  dataDir?: string;
  logFile?: string;
  message?: string;
}

export interface KaspaNodeHandle {
  pid: number;
  rpcUrl: string;
  dataDir: string;
  stop(): Promise<void>;
  status(): Promise<KaspaNodeStatus>;
}

export interface KaspaNodeDoctorReport {
  network: KaspaRealNetwork;
  binaryPath: string;
  binaryFound: boolean;
  dataDir: string;
  dataDirExists: boolean;
  pidFile: string;
  pidFileExists: boolean;
  running: boolean;
  pid?: number | undefined;
  rpcUrl: string;
  logFile: string;
  logFileExists: boolean;
  warnings: string[];
}

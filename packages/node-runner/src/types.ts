export type KaspadNetwork = "simnet";

export interface KaspadPorts {
  readonly rpc: number;
  readonly borshRpc: number;
  readonly jsonRpc: number;
}

export interface DockerKaspadOptions {
  readonly cwd?: string;
  readonly image?: string;
  readonly containerName?: string;
  readonly network?: KaspadNetwork;
  readonly ports?: Partial<KaspadPorts>;
  readonly dataDir?: string;
  readonly detach?: boolean;
}

export interface KaspadNodeStatus {
  readonly containerName: string;
  readonly image: string;
  readonly network: KaspadNetwork;
  readonly running: boolean;
  readonly statusText?: string;
  readonly ports: KaspadPorts;
  readonly dataDir: string;
}

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
  readonly allowFloatingImage?: boolean;
  /**
   * Opt-in: when Docker is unavailable, report a simulated node instead of
   * failing. Also enabled by HARDKAS_ALLOW_SIMULATED_NODE=1. Never implied by
   * a test environment: a simulated node is not a real node.
   */
  readonly allowSimulatedFallback?: boolean;
  readonly mineTo?: string | undefined;
}

export interface KaspadNodeStatus {
  readonly containerName: string;
  readonly image: string;
  readonly network: KaspadNetwork;
  readonly running: boolean;
  readonly statusText?: string;
  readonly ports: KaspadPorts;
  readonly dataDir: string;
  readonly rpcUrl: string;
  readonly rpcReady: boolean;
  readonly transports: {
    readonly grpc: { readonly port: number; readonly ready: boolean };
    readonly borsh: { readonly port: number; readonly ready: boolean };
    readonly json: {
      readonly port: number;
      readonly ready: boolean;
      readonly url: string;
    };
  };
  readonly lastError?: string | null;
}

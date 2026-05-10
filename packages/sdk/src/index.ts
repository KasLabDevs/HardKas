import { loadHardkasConfig as loadConfig, LoadedHardkasConfig as LoadedConfig } from "@hardkas/config";
import { JsonWrpcKaspaClient, KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { NetworkId } from "@hardkas/core";
import { HardkasAccounts } from "./accounts.js";
import { HardkasTx } from "./tx.js";
import { HardkasL2 } from "./l2.js";
import { HardkasQuery } from "./query.js";
import { HardkasLocalnet } from "./localnet.js";

// Curated explicit exports only. No `export *`
export { HardkasAccounts } from "./accounts.js";
export { HardkasTx } from "./tx.js";
export { HardkasL2 } from "./l2.js";
export { HardkasQuery } from "./query.js";
export { HardkasLocalnet } from "./localnet.js";
export { defineTask, type TaskContext, type TaskArgs } from "./tasks.js";

export { 
  SOMPI_PER_KAS, 
  HardkasError,
  parseKasToSompi,
  formatSompi,
  type TxId,
  type KaspaAddress,
  type ArtifactId,
  type LineageId
} from "@hardkas/core";
export type { NetworkId } from "@hardkas/core";

export interface HardkasOptions {
  cwd?: string;
  configPath?: string;
}

/**
 * HardKAS SDK - Main Entry Point
 * 
 * Provides a high-level facade for interacting with the Kaspa ecosystem.
 * Acts as a DI container and coordinator.
 */
export class Hardkas {
  public readonly accounts: HardkasAccounts;
  public readonly tx: HardkasTx;
  public readonly l2: HardkasL2;
  public readonly query: HardkasQuery;
  public readonly localnet: HardkasLocalnet;

  public readonly rpc: KaspaRpcClient;

  private constructor(
    public readonly config: LoadedConfig,
    rpc?: KaspaRpcClient
  ) {
    // Default to the standard client if none provided
    this.rpc = rpc || new JsonWrpcKaspaClient({ 
      rpcUrl: this.resolveRpcUrl() 
    });

    this.accounts = new HardkasAccounts(this);
    this.tx = new HardkasTx(this);
    this.l2 = new HardkasL2();
    this.query = new HardkasQuery(this);
    this.localnet = new HardkasLocalnet(this);
  }

  private resolveRpcUrl(): string {
    const networkId = this.config.config.defaultNetwork || "simnet";
    const target = this.config.config.networks?.[networkId];
    
    if (target && (target.kind === "kaspa-rpc" || target.kind === "igra" || target.kind === "kaspa-node")) {
      return target.rpcUrl || "ws://127.0.0.1:18210";
    }
    return "ws://127.0.0.1:18210";
  }

  /**
   * Opens a HardKAS project in the given directory.
   */
  static async open(dirOrOptions: string | HardkasOptions = "."): Promise<Hardkas> {
    const options = typeof dirOrOptions === "string" ? { cwd: dirOrOptions } : dirOrOptions;
    const loaded = await loadConfig(options);
    return new Hardkas(loaded);
  }

  /**
   * Current active network name.
   */
  get network(): NetworkId {
    return (this.sdkConfig.defaultNetwork as NetworkId) || "simnet";
  }

  get sdkConfig() {
    return this.config.config;
  }
  
  get cwd() {
    return this.config.cwd;
  }
}

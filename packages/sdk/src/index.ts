import {
  loadHardkasConfig as loadConfig,
  LoadedHardkasConfig as LoadedConfig,
  defineHardkasConfig
} from "@hardkas/config";
import { JsonWrpcKaspaClient, KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { NetworkId, HardkasError } from "@hardkas/core";
import { HardkasAccounts } from "./accounts.js";
import { HardkasTx } from "./tx.js";
import { HardkasL2 } from "./l2.js";
import { HardkasQuery } from "./query.js";
import { HardkasLocalnet } from "./localnet.js";
import { HardkasReplay } from "./replay.js";
import { HardkasLineage } from "./lineage.js";
import { HardkasWorkspace } from "./workspace.js";
import { HardkasArtifactsManager } from "./artifacts-manager.js";
import { HardkasWorkflow } from "./workflow.js";

// Curated explicit exports only. No `export *`
export { HardkasAccounts } from "./accounts.js";
export { HardkasTx } from "./tx.js";
export { HardkasL2 } from "./l2.js";
export { HardkasQuery } from "./query.js";
export { HardkasLocalnet } from "./localnet.js";
export { HardkasReplay } from "./replay.js";
export { HardkasLineage } from "./lineage.js";
export { HardkasWorkspace } from "./workspace.js";
export { HardkasArtifactsManager } from "./artifacts-manager.js";
export { defineHardkasConfig } from "@hardkas/config";
export { defineTask, type TaskContext, type TaskArgs } from "./tasks.js";
export { buildPaymentPlan } from "@hardkas/tx-builder";
export { signTxPlanArtifact } from "@hardkas/accounts";
export {
  writeArtifact,
  createTxPlanArtifact,
  ARTIFACT_SCHEMAS,
  HARDKAS_VERSION,
  type TxPlanArtifact,
  type SignedTxArtifact,
  type TxReceiptArtifact,
  type TxTraceArtifact
} from "@hardkas/artifacts";

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
  mode?: "developer" | "agent";
  network?: string;
  autoBootstrap?: boolean;
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
    [key: string]: any;
  };
  policy?: {
    allowNetwork?: boolean;
    allowMainnet?: boolean;
    allowExternalWallet?: boolean;
    requireDryRun?: boolean;
  };
}

/**
 * HardKAS SDK - Main Entry Point
 *
 * Provides a high-level facade for interacting with the Kaspa ecosystem.
 * Acts as a DI container and coordinator.
 */
export class Hardkas {
  public readonly workspace: HardkasWorkspace;
  public readonly artifacts: HardkasArtifactsManager;
  public readonly accounts: HardkasAccounts;
  public readonly tx: HardkasTx;
  public readonly l2: HardkasL2;
  public readonly query: HardkasQuery;
  public readonly localnet: HardkasLocalnet;
  public readonly replay: HardkasReplay;
  public readonly lineage: HardkasLineage;
  public readonly workflow: HardkasWorkflow;

  public readonly mode: "developer" | "agent";
  public readonly policy: Required<NonNullable<HardkasOptions["policy"]>>;

  public readonly rpc: KaspaRpcClient;

  private constructor(
    public readonly config: LoadedConfig,
    options?: HardkasOptions,
    rpc?: KaspaRpcClient
  ) {
    this.mode = options?.mode || "developer";
    this.policy = {
      allowNetwork: options?.policy?.allowNetwork ?? this.mode === "developer",
      allowMainnet: options?.policy?.allowMainnet ?? false,
      allowExternalWallet:
        options?.policy?.allowExternalWallet ?? this.mode === "developer",
      requireDryRun: options?.policy?.requireDryRun ?? this.mode === "agent"
    };

    // Default to the standard client if none provided
    this.rpc =
      rpc ||
      new JsonWrpcKaspaClient({
        rpcUrl: this.resolveRpcUrl()
      });

    this.workspace = new HardkasWorkspace(this.config.cwd);
    this.artifacts = new HardkasArtifactsManager(this.workspace);

    this.accounts = new HardkasAccounts(this);
    this.tx = new HardkasTx(this);
    this.l2 = new HardkasL2();
    this.query = new HardkasQuery(this);
    this.localnet = new HardkasLocalnet(this);
    this.replay = new HardkasReplay(this);
    this.lineage = new HardkasLineage(this);
    this.workflow = new HardkasWorkflow(this);
  }

  private resolveRpcUrl(): string {
    const networkId = this.config.config.defaultNetwork || "simnet";
    const target = this.config.config.networks?.[networkId];

    if (target && "rpcUrl" in target && typeof target.rpcUrl === "string") {
      return target.rpcUrl;
    }
    return "ws://127.0.0.1:18210";
  }

  /**
   * Opens a HardKAS project in the given directory.
   */
  static async open(dirOrOptions: string | HardkasOptions = "."): Promise<Hardkas> {
    const options =
      typeof dirOrOptions === "string" ? { cwd: dirOrOptions } : dirOrOptions;
    const loaded = await loadConfig(options);
    
    const activeNetwork = options.network || loaded.config.defaultNetwork || "simnet";
    const isSimulated = activeNetwork === "simulated" || loaded.config.networks?.[activeNetwork]?.kind === "simulated";
    const autoBootstrap = options.autoBootstrap ?? (isSimulated ? true : false);

    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = options.cwd || process.cwd();
    const hardkasDir = path.join(cwd, ".hardkas");

    if (autoBootstrap) {
      if (!isSimulated) {
        if (options.logger) {
           options.logger.warn("[HardKAS] autoBootstrap ignored for non-simulated network");
        }
      } else {
        if (!fs.existsSync(hardkasDir)) {
          if (options.logger) {
             options.logger.info("[HardKAS] Auto-bootstrapping simulated workspace");
          }
          fs.mkdirSync(hardkasDir, { recursive: true });
        }
        try {
          const { loadOrCreateLocalnetState } = await import("@hardkas/localnet");
          await loadOrCreateLocalnetState({ cwd });
        } catch {
          // ignore error if it fails to init localnet
        }
      }
    } else {
      if (!fs.existsSync(hardkasDir)) {
        throw new HardkasError("NOT_INITIALIZED", "Workspace not initialized. Run npx hardkas init . or pass autoBootstrap: true.");
      }
    }

    // Pass the overridden network back into config for downstream use if needed
    if (options.network) {
       loaded.config.defaultNetwork = options.network;
    }

    let provider: KaspaRpcClient | undefined;
    if (isSimulated) {
      const { LocalnetSimulatedProvider } = await import("@hardkas/localnet");
      provider = new LocalnetSimulatedProvider(cwd);
    }

    return new Hardkas(loaded, options, provider);
  }

  /**
   * Alias for open(). Used in most examples.
   */
  static async create(dirOrOptions: string | HardkasOptions = "."): Promise<Hardkas> {
    return this.open(dirOrOptions);
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

  /**
   * Validates an action against the active security policy.
   * Throws HardkasError if the policy is violated.
   */
  public enforcePolicy(
    action: "network" | "mainnet" | "external-wallet" | "mutation",
    context?: string
  ): void {
    if (this.mode === "developer") return; // Developers are trusted

    const msg = (policy: string) =>
      `Agent Mode Policy Violation: '${action}' is restricted by policy '${policy}'. ${context || ""}`;

    switch (action) {
      case "network":
        if (!this.policy.allowNetwork)
          throw new HardkasError("POLICY_VIOLATION", msg("allowNetwork"));
        break;
      case "mainnet":
        if (!this.policy.allowMainnet)
          throw new HardkasError("POLICY_VIOLATION", msg("allowMainnet"));
        break;
      case "external-wallet":
        if (!this.policy.allowExternalWallet)
          throw new HardkasError("POLICY_VIOLATION", msg("allowExternalWallet"));
        break;
      case "mutation":
        if (this.policy.requireDryRun)
          throw new HardkasError("POLICY_VIOLATION", msg("requireDryRun"));
        break;
    }
  }
}

export {
  createHardkasClient,
  type HardkasClientOptions,
  type ClientEnvelope
} from "./client.js";

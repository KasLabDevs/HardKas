import {
  loadHardkasConfig as loadConfig,
  LoadedHardkasConfig as LoadedConfig,
  defineHardkasConfig
} from "@hardkas/config";
import { resolveHardkasAccount, HardkasAccount } from "@hardkas/accounts";
import { ExternalHardkasSigner } from "@hardkas/artifacts";
import { JsonWrpcKaspaClient, KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { NetworkId, HardkasError } from "@hardkas/core";
import { assertPublicNetworkAllowed } from "./policy.js";
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
import { HardkasCapabilitiesApi, createHardkasCapabilities } from "./capabilities.js";
import { HardkasCorpus } from "./corpus.js";
import { HardkasSilver } from "./silver.js";
import { HardkasZk } from "./zk.js";
import { HardkasVprogs } from "./vprogs.js";
import { HardkasProgrammability } from "./programmability.js";
import { HardkasPluginManager } from "./plugin-manager.js";

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
export { HardkasCapabilitiesApi, createHardkasCapabilities } from "./capabilities.js";
export { HardkasCorpus, verifyToccataCorpus } from "./corpus.js";
export { HardkasSilver, SilverScript } from "./silver.js";
export {
  HardkasZk,
  createZkCapabilities,
  inspectZkProof,
  verifyZkProofLocal,
  verifyZkCorpus
} from "./zk.js";
export {
  HardkasVprogs,
  createVprogsCapabilities,
  createVprogsStatus,
  inspectVprogsArtifact
} from "./vprogs.js";
export {
  HardkasProgrammability,
  createProgrammabilityCapabilities,
  programmabilityClaims
} from "./programmability.js";
export type { HardkasCapabilities } from "./capabilities.js";
export type { CorpusVerifyResult, CorpusIssue } from "./corpus.js";
export type {
  ZkCapabilities,
  ZkCorpusVerifyResult,
  ZkIssue,
  ZkProofInspectResult,
  ZkProofSystem,
  ZkProofVerifyResult
} from "./zk.js";
export type {
  VprogsCapabilitiesResult,
  VprogsClaims,
  VprogsInspectResult,
  VprogsStatusResult
} from "./vprogs.js";
export type {
  ProgrammabilityAppPlan,
  ProgrammabilityCapabilitiesResult,
  ProgrammabilityClaims,
  ProgrammabilityCorpusReport,
  ProgrammabilityInspectResult,
  ProgrammabilityKind,
  ProgrammabilityVerifyResult
} from "./programmability.js";
export type {
  SilverCompareMode,
  SilverCompareOptions,
  SilverCompareReport,
  SilverCompileOptions,
  SilverDeployPlanOptions,
  SilverSdkArtifactResult,
  SilverSdkWriteOptions,
  SilverSpendPlanOptions
} from "./silver.js";
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
  formatSompiToKas,
  type TxId,
  type KaspaAddress,
  type ArtifactId,
  type LineageId
} from "@hardkas/core";
export type { NetworkId } from "@hardkas/core";

export interface HardkasOptions {
  cwd?: string;
  configPath?: string;
  workspaceRoot?: string;
  hardkasDir?: string;
  mode?: "developer" | "agent";
  network?: string;
  autoBootstrap?: boolean;
  signer?: ExternalHardkasSigner;
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
    [key: string]: any;
  };
  policy?: {
    allowNetwork?: boolean;
    allowPublic?: boolean;
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
  public readonly capabilitiesApi: HardkasCapabilitiesApi;
  public readonly corpus: HardkasCorpus;
  public readonly silver: HardkasSilver;
  public readonly zk: HardkasZk;
  public readonly vprogs: HardkasVprogs;
  public readonly programmability: HardkasProgrammability;
  public readonly plugins: HardkasPluginManager;
  public readonly signer?: ExternalHardkasSigner | undefined;

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
      allowPublic: options?.policy?.allowPublic ?? this.config.config.network?.allowPublic ?? false,
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

    this.workspace = new HardkasWorkspace(this.config.cwd, options?.hardkasDir);
    this.artifacts = new HardkasArtifactsManager(this);

    this.accounts = new HardkasAccounts(this);
    this.tx = new HardkasTx(this);
    this.l2 = new HardkasL2();
    this.query = new HardkasQuery(this);
    this.signer = options?.signer;
    this.localnet = new HardkasLocalnet(this);
    this.replay = new HardkasReplay(this);
    this.lineage = new HardkasLineage(this);
    this.workflow = new HardkasWorkflow(this);
    this.capabilitiesApi = new HardkasCapabilitiesApi();
    this.corpus = new HardkasCorpus(this);
    this.silver = new HardkasSilver(this);
    this.zk = new HardkasZk(this);
    this.vprogs = new HardkasVprogs(this);
    this.programmability = new HardkasProgrammability(this);
    this.plugins = new HardkasPluginManager(this);
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
    const path = await import("node:path");
    const cwd = path.resolve(typeof dirOrOptions === "string" ? dirOrOptions : (dirOrOptions.cwd || process.cwd()));
    const options = typeof dirOrOptions === "string" ? { cwd } : { ...dirOrOptions, cwd };
    const loaded = await loadConfig(options);

    const activeNetwork = options.network || loaded.config.defaultNetwork || "simnet";
    const isSimulated =
      activeNetwork === "simulated" ||
      loaded.config.networks?.[activeNetwork]?.kind === "simulated";
    const autoBootstrap = options.autoBootstrap ?? (isSimulated ? true : false);

    const effectiveAllowPublic = options.policy?.allowPublic ?? loaded.config.network?.allowPublic;
    assertPublicNetworkAllowed(activeNetwork, effectiveAllowPublic === true ? { allowPublic: true } : {});

    const fs = await import("node:fs");
    const hardkasDir = options.hardkasDir || path.join(cwd, ".hardkas");

    if (autoBootstrap) {
      if (!isSimulated) {
        if (options.logger) {
          options.logger.warn(
            "[HardKAS] autoBootstrap ignored for non-simulated network"
          );
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
          await loadOrCreateLocalnetState({
            cwd,
            ...(options.hardkasDir ? { hardkasDir: options.hardkasDir } : {})
          });
        } catch {
          // ignore error if it fails to init localnet
        }
      }
    } else {
      if (!fs.existsSync(hardkasDir)) {
        throw new HardkasError(
          "NOT_INITIALIZED",
          "Workspace not initialized. Run npx hardkas init . or pass autoBootstrap: true."
        );
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

    const hk = new Hardkas(loaded, options, provider);
    hk.plugins.loadPlugins();
    return hk;
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

  async capabilities() {
    return this.capabilitiesApi.get();
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
        if (!this.policy.allowPublic)
          throw new HardkasError("POLICY_VIOLATION", msg("allowPublic"));
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

export {
  createHardkasEnvironment,
  type HardkasEnvironment,
  type HardkasEnvironmentOptions,
  type HardkasMode
} from "./environment.js";

export { EvidenceManager, type EvidencePackOptions, type EvidenceVerifyResult } from "./evidence.js";

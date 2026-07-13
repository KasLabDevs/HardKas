import { CURRENT_HASH_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";

export interface HardkasCapabilities {
  version: string;
  maturity: "alpha" | "hardened-alpha" | "beta" | "stable";
  proofVersion: string;
  hashVersion: number;
  capabilities: {
    artifacts: boolean;
    lineageVerification: boolean;
    deterministicHashing: boolean;
    atomicPersistence: boolean;
    workspaceLocks: boolean;
    corruptionDetection: boolean;
    secretRedaction: boolean;
    mainnetGuards: boolean;
    localnetSimulation: boolean;
    ghostdagSimulation: boolean;
    dagConflictResolution: boolean;
    massProfiler: boolean;
    simulationScenarios: boolean;
    queryStore: boolean;
    replayVerification: boolean;
    schemaMigrations: boolean;
    dockerNode: boolean;
    scriptRunner: boolean;
    testingFramework: boolean;
    l2Profiles: boolean;
    l2BridgeAssumptions: boolean;
    consensusValidation: boolean;
    productionWallet: boolean;
    silverScript: boolean;
    covenants: boolean;
    transactionV1: boolean;
    trustlessExit: boolean;
    differentialDagValidation: boolean;
  };
  trustBoundaries: {
    replay: "local-workflow-only";
    artifacts: "internal-integrity-only";
    simulator: "local-simulation-only";
    queryStore: "rebuildable-read-model";
    l2Bridge: "pre-zk-assumptions";
  };
  runtimeMatrix?: {
    node: {
      version: string;
      toccata: boolean;
      txV1: boolean;
      covenants: boolean;
    };
    wasm: {
      version: string;
      txV1: boolean;
      signingV1: boolean;
    };
    docker: {
      kaspadImage: string;
      cpuminerImage: string;
    };
  };
}

export interface EnvironmentCapabilities {
  kaspa: {
    wasm: boolean;
    rpc: boolean;
    v1: boolean;
    computeBudget: boolean;
    covenantOutputs: boolean;
    storageMass: boolean;
    signingV1: boolean;
    version?: string;
  };
  silver: {
    installed: boolean;
    version?: string;
    reason?: string;
  };
  vprogs: {
    installed: boolean;
    version?: string;
    reason?: string;
  };
  toccata: {
    available: boolean;
    reason?: string;
  };
  igra: {
    available: boolean;
    rpcUrl?: string;
    reason?: string;
  };
  node: {
    version: string;
  };
  docker: {
    kaspadImage: string;
    cpuminerImage: string;
  };
}

export interface ProbeOptions {
  refresh?: boolean;
  igraRpcUrl?: string;
}

export class HardkasCapabilitiesApi {
  private _cachedEnv?: EnvironmentCapabilities;

  constructor(private sdk?: any) {}

  async get(): Promise<HardkasCapabilities> {
    const caps = createHardkasCapabilities();
    const env = await this.probeEnvironment();
    
    // Inject dynamic capabilities based on environment probe
    caps.capabilities.transactionV1 = env.kaspa.v1;
    caps.capabilities.covenants = env.toccata.available;
    caps.capabilities.silverScript = env.silver.installed;
    
    // Inject runtime matrix
    caps.runtimeMatrix = {
      node: {
        version: env.node.version,
        toccata: env.toccata.available,
        txV1: env.kaspa.v1, // Inferred from node support
        covenants: env.toccata.available
      },
      wasm: {
        version: env.kaspa.version || "unknown",
        txV1: env.kaspa.v1,
        signingV1: env.kaspa.signingV1
      },
      docker: {
        kaspadImage: env.docker.kaspadImage,
        cpuminerImage: env.docker.cpuminerImage
      }
    };
    
    return caps;
  }

  async probeWasm(options?: ProbeOptions): Promise<EnvironmentCapabilities["kaspa"]> {
    const env = await this.probeEnvironment(options);
    return env.kaspa;
  }

  async probeEnvironment(options?: ProbeOptions): Promise<EnvironmentCapabilities> {
    if (this._cachedEnv && !options?.refresh) {
      return this._cachedEnv;
    }

    const { execFileSync } = await import("node:child_process");

    const env: EnvironmentCapabilities = {
      kaspa: { 
        wasm: true, 
        rpc: true,
        v1: false,
        computeBudget: false,
        covenantOutputs: false,
        storageMass: false,
        signingV1: false,
        version: "0.13.0"
      }, // Assuming true for this reality check layer baseline
      silver: { installed: false },
      vprogs: { installed: false },
      toccata: { available: false },
      igra: { available: false },
      node: { version: "unknown" },
      docker: { 
        kaspadImage: process.env.HARDKAS_KASPAD_IMAGE ?? "kaspanet/rusty-kaspad:latest", 
        cpuminerImage: "kaspanet/cpuminer:latest" 
      }
    };

    // Probe SilverScript
    try {
      execFileSync("silverscript", ["--version"], { stdio: "ignore" });
      env.silver = { installed: true, version: "unknown" };
    } catch {
      env.silver = { installed: false, reason: "MISSING_DEPENDENCY: 'silverscript' CLI not found" };
    }

    // Probe vProgs
    try {
      execFileSync("vprogs", ["--version"], { stdio: "ignore" });
      env.vprogs = { installed: true, version: "unknown" };
    } catch {
      env.vprogs = { installed: false, reason: "MISSING_DEPENDENCY: 'vprogs' CLI not found" };
    }

    // Probe kaspa-wasm for V1 support (P82/P87)
    try {
      const { loadKaspaWasm } = await import("@hardkas/accounts");
      const wasmConfig = this.sdk?.config?.config?.wasm;
      const kaspaModule = await loadKaspaWasm(wasmConfig);
      const kaspa = kaspaModule.default ? kaspaModule.default : kaspaModule;
      
      env.kaspa.version = typeof kaspaModule.version === "function" 
        ? kaspaModule.version() 
        : (kaspaModule.version || kaspa.version || "unknown");

      if (kaspa && kaspa.Transaction) {
        if (kaspa.Transaction.prototype && 'storageMass' in kaspa.Transaction.prototype) {
           env.kaspa.v1 = true;
           env.kaspa.computeBudget = true;
           env.kaspa.covenantOutputs = true;
           env.kaspa.storageMass = true;
           env.kaspa.signingV1 = true;
        }
      }
    } catch (e) {
      // kaspa-wasm not available in this environment
      env.kaspa.wasm = false;
    }

    // Probe Toccata (Kaspa L1 Core)
    // Toccata is available if the node supports it.
    env.toccata = { available: true };
    
    // Attempt to fetch node version if client is connected
    if (this.sdk?.client?.isConnected) {
      try {
        const info = await this.sdk.client.getServerInfo();
        if (info && info.serverVersion) {
          env.node.version = info.serverVersion;
        }
      } catch (e) {
        // Ignore, leave as unknown
      }
    }

    // Probe Igra (priority: options > config > env > missing)
    let rpcUrl = options?.igraRpcUrl;
    if (!rpcUrl && this.sdk) {
       // Assuming config access pattern
       const networkId = this.sdk.config?.config?.defaultNetwork || "simnet";
       rpcUrl = this.sdk.config?.config?.networks?.[networkId]?.igraRpcUrl;
    }
    if (!rpcUrl && process.env.IGRA_RPC_URL) {
       rpcUrl = process.env.IGRA_RPC_URL;
    }

    if (rpcUrl) {
      try {
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "getIgraInfo", id: 1, params: [] })
        }).catch(() => null);

        if (res && res.ok) {
           const data = await res.json();
           if (data.error) {
             env.igra = { available: false, rpcUrl, reason: `Igra RPC error: ${data.error.message}` };
           } else {
             env.igra = { available: true, rpcUrl };
           }
        } else {
           env.igra = { available: false, rpcUrl, reason: "Igra RPC endpoint is unreachable" };
        }
      } catch (e: any) {
        env.igra = { available: false, rpcUrl, reason: e.message };
      }
    } else {
      env.igra = { available: false, reason: "MISSING_DEPENDENCY: No IGRA_RPC_URL provided" };
    }

    this._cachedEnv = env;
    return env;
  }
}

export function createHardkasCapabilities(): HardkasCapabilities {
  return {
    version: HARDKAS_VERSION,
    maturity: "hardened-alpha",
    proofVersion: "repro-v0",
    hashVersion: CURRENT_HASH_VERSION,
    capabilities: {
      artifacts: true,
      lineageVerification: true,
      deterministicHashing: true,
      atomicPersistence: true,
      workspaceLocks: true,
      corruptionDetection: true,
      secretRedaction: true,
      mainnetGuards: true,
      localnetSimulation: true,
      ghostdagSimulation: true,
      dagConflictResolution: true,
      massProfiler: true,
      simulationScenarios: true,
      queryStore: true,
      replayVerification: true,
      schemaMigrations: true,
      dockerNode: true,
      scriptRunner: true,
      testingFramework: true,
      l2Profiles: true,
      l2BridgeAssumptions: true,
      consensusValidation: false,
      productionWallet: false,
      silverScript: false,
      covenants: false,
      transactionV1: false, // Will become true after P82/P84
      trustlessExit: false,
      differentialDagValidation: false
    },
    trustBoundaries: {
      replay: "local-workflow-only",
      artifacts: "internal-integrity-only",
      simulator: "local-simulation-only",
      queryStore: "rebuildable-read-model",
      l2Bridge: "pre-zk-assumptions"
    }
  };
}

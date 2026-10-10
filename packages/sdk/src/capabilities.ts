import { CURRENT_HASH_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";
import {
  KASPAD_REFERENCE_IMAGE,
  CPUMINER_REFERENCE_IMAGE,
  SILVERSCRIPT_RELEASE,
  redactUrlCredentials,
  redactUrlCredentialsInText
} from "@hardkas/core";

// SURFACE-TRUTH-1B (ST-A, D-ST1): one capability authority. The entries that depend on this environment are derived
// from the checks the features themselves use (`probeSilverReadiness`, the same checks `hardkas silver doctor` reports,
// and the kaspa-wasm probe); `hardkas capabilities` renders this report and `covenants.isSupported()` reads it. A node
// that was not observed (the canonical node proving its identity) is never reported as Toccata- or covenant-capable.
// The other entries describe what this build contains; L2 (Igra, the bridge) is not part of the L1 core.

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
    /** The SilverScript compiler: the managed silverc resolves (`hardkas silver compile`). */
    silverScript: boolean;
    /**
     * The real covenant builders are ready here: 1:1 auth-bound transitions only, built by
     * `hardkas silver covenant genesis|transition` (managed silverc + verified kaspa-wasm + the canonical node). Not
     * general covenant support, and not the SDK's planning (`sdkCovenantPlanning`).
     */
    covenants: boolean;
    /** Always false in this build: `covenants.planDeploy()`/`planSpend()` refuse with COVENANT_PLAN_UNSUPPORTED. */
    sdkCovenantPlanning: boolean;
    transactionV1: boolean;
    trustlessExit: boolean;
    differentialDagValidation: boolean;
  };
  /**
   * The concrete surface each programmability entry covers, so a boolean is never read as generic support
   * (SURFACE-TRUTH-1B: the compiler, the real covenant builders, and the SDK planning that is not supported).
   */
  scopes?: {
    silverScript: string;
    covenants: string;
    sdkCovenantPlanning: string;
  };
  /**
   * Why an entry derived from this environment is false here (absent when it is true). `createHardkasCapabilities()`
   * probes nothing, so it marks them "not probed".
   */
  reasons?: {
    silverScript?: string;
    covenants?: string;
    transactionV1?: string;
  };
  trustBoundaries: {
    /** `hardkas replay verify`: simulator-mode receipts, replayed locally (no node or consensus replay). */
    replay: "local-simulator-only";
    artifacts: "internal-integrity-only";
    simulator: "local-simulation-only";
    queryStore: "rebuildable-read-model";
    /** The Igra bridge model (Labs; not part of the L1 core). */
    l2Bridge: "pre-zk-assumptions";
  };
  runtimeMatrix?: {
    /** The canonical localnet node, as its identity check observed it: "unknown" and false unless it was verified. */
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

/** One check of `probeSilverReadiness`. */
export interface ReadinessCheck {
  ok: boolean;
  detail: string;
}

/**
 * The checks behind the SilverScript and covenant capabilities, in one place: `hardkas silver doctor` reports them and
 * `HardkasCapabilitiesApi.get()` derives `silverScript`, `covenants` and the node matrix from them.
 */
export interface SilverReadiness {
  toolchains: { "kaspa-wasm": ReadinessCheck; silverc: ReadinessCheck };
  /** The canonical localnet node proving its identity (container, image digest, endpoint, network and version). */
  node: ReadinessCheck & { serverVersion?: string };
  ready: {
    "silver.compile.v1": boolean;
    "silver.p2sh.deploy-spend.v1": boolean;
    "toccata.covenant.auth-1to1-transition.v1": boolean;
  };
}

/**
 * The managed silverc resolves, the managed kaspa-wasm is verified on disk, and the canonical node proves its identity:
 * what `hardkas silver compile|deploy|spend|covenant` need. Read-only; failures are reported, never thrown.
 */
export async function probeSilverReadiness(): Promise<SilverReadiness> {
  const core = await import("@hardkas/core");
  const wasm = core.verifyManagedToolchainSync(core.KASPA_WASM_REFERENCE);
  let silverc: ReadinessCheck;
  try {
    const s = core.resolveManagedSilverc();
    silverc = { ok: true, detail: `${s.ref.assetName} ${s.ref.files[s.ref.entry]!.sha256}` };
  } catch (e: any) {
    silverc = { ok: false, detail: String(e?.code ?? e?.message) };
  }
  let node: SilverReadiness["node"];
  try {
    const { verifyNodeIdentity } = await import("@hardkas/node-runner");
    const id = await verifyNodeIdentity();
    node = id.verified
      ? {
          ok: true,
          detail: `${id.observed.container?.name} rusty-kaspad ${id.observed.server?.serverVersion}`,
          serverVersion: String(id.observed.server?.serverVersion)
        }
      : { ok: false, detail: id.problems.join("; ") };
  } catch (e: any) {
    node = { ok: false, detail: String(e?.message ?? e) };
  }
  const operational = silverc.ok && wasm.ok && node.ok;
  return {
    toolchains: {
      "kaspa-wasm": { ok: wasm.ok, detail: wasm.ok ? core.KASPA_WASM_REFERENCE.version : wasm.problems.join("; ") },
      silverc
    },
    node,
    ready: {
      "silver.compile.v1": silverc.ok,
      "silver.p2sh.deploy-spend.v1": operational,
      "toccata.covenant.auth-1to1-transition.v1": operational
    }
  };
}

function covenantReason(r: SilverReadiness): string {
  const missing = [
    ...(r.toolchains.silverc.ok ? [] : ["the managed silverc does not resolve"]),
    ...(r.toolchains["kaspa-wasm"].ok ? [] : ["the managed kaspa-wasm is not verified"]),
    ...(r.node.ok ? [] : ["the canonical node did not prove its identity"])
  ];
  return `${missing.join("; ")} (see \`hardkas silver doctor\`)`;
}

export class HardkasCapabilitiesApi {
  private _cachedEnv?: EnvironmentCapabilities;
  private _readiness?: SilverReadiness;

  constructor(private sdk?: any) {}

  async get(): Promise<HardkasCapabilities> {
    const caps = createHardkasCapabilities();
    const env = await this.probeEnvironment();
    const readiness = await this.silverReadiness();

    caps.capabilities.silverScript = readiness.ready["silver.compile.v1"];
    caps.capabilities.covenants = readiness.ready["toccata.covenant.auth-1to1-transition.v1"];
    caps.capabilities.transactionV1 = env.kaspa.v1;

    const reasons: NonNullable<HardkasCapabilities["reasons"]> = {};
    if (!caps.capabilities.silverScript) {
      reasons.silverScript = `the managed silverc does not resolve: ${readiness.toolchains.silverc.detail} (see \`hardkas silver doctor\`)`;
    }
    if (!caps.capabilities.covenants) reasons.covenants = covenantReason(readiness);
    if (!caps.capabilities.transactionV1) {
      reasons.transactionV1 = env.kaspa.wasm ? "the loaded kaspa-wasm does not sign transaction v1" : "kaspa-wasm could not be loaded";
    }
    if (Object.keys(reasons).length > 0) caps.reasons = reasons;
    else delete caps.reasons;

    caps.runtimeMatrix = {
      node: {
        version: env.node.version,
        toccata: env.toccata.available,
        txV1: env.toccata.available,
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

  /** The checks behind `silverScript`, `covenants` and the node matrix, cached like the environment probe. */
  async silverReadiness(options?: { refresh?: boolean }): Promise<SilverReadiness> {
    if (!this._readiness || options?.refresh) this._readiness = await probeSilverReadiness();
    return this._readiness;
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

    // SURFACE-TRUTH-1B: nothing is assumed; every field below starts false/"unknown" and is set by its probe (the former
    // baseline assumed wasm and RPC, a fixed "0.13.0" version and a Toccata node that nothing had reached).
    const env: EnvironmentCapabilities = {
      kaspa: {
        wasm: false,
        rpc: false,
        v1: false,
        computeBudget: false,
        covenantOutputs: false,
        storageMass: false,
        signingV1: false,
        version: "unknown"
      },
      silver: { installed: false },
      vprogs: { installed: false },
      toccata: { available: false },
      igra: { available: false },
      node: { version: "unknown" },
      docker: {
        kaspadImage: process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE,
        cpuminerImage: CPUMINER_REFERENCE_IMAGE
      }
    };

    // SilverScript and the canonical node: the same checks `hardkas silver doctor` reports (only the managed, verified
    // silverc counts, never PATH; a node counts only once it proves its identity).
    const readiness = await this.silverReadiness(options?.refresh ? { refresh: true } : undefined);
    if (readiness.toolchains.silverc.ok) {
      const { SILVERSCRIPT_RELEASE } = await import("@hardkas/core");
      env.silver = { installed: true, version: `silverc ${SILVERSCRIPT_RELEASE.releaseTag}` };
    } else {
      env.silver = { installed: false, reason: `SILVERC_UNAVAILABLE: ${readiness.toolchains.silverc.detail}` };
    }
    if (readiness.node.ok) {
      env.toccata = { available: true };
      env.node = { version: readiness.node.serverVersion ?? "unknown" };
    } else {
      env.toccata = { available: false, reason: "no node observed: the canonical node did not prove its identity (see `hardkas silver doctor`)" };
    }

    // Probe vProgs
    try {
      execFileSync("vprogs", ["--version"], { stdio: "ignore" });
      env.vprogs = { installed: true, version: "unknown" };
    } catch {
      env.vprogs = { installed: false, reason: "MISSING_DEPENDENCY: 'vprogs' CLI not found" };
    }

    // Probe kaspa-wasm for V1 support (P82/P87): the runtime `tx.sign` loads, with the check its signer applies
    // (`detectCapabilities`), so this report and the signer cannot disagree.
    try {
      const { loadKaspaWasm, detectCapabilities } = await import("@hardkas/accounts");
      const wasmConfig = this.sdk?.config?.config?.wasm;
      const kaspaModule = await loadKaspaWasm(wasmConfig);
      const kaspa = kaspaModule.default ? kaspaModule.default : kaspaModule;

      env.kaspa.wasm = true;
      env.kaspa.rpc = typeof kaspa?.RpcClient === "function";
      env.kaspa.version = typeof kaspaModule.version === "function"
        ? kaspaModule.version()
        : (kaspaModule.version || kaspa.version || "unknown");

      if (detectCapabilities(kaspaModule).transactionV1Signing) {
        env.kaspa.v1 = true;
        env.kaspa.computeBudget = true;
        env.kaspa.covenantOutputs = true;
        env.kaspa.storageMass = true;
        env.kaspa.signingV1 = true;
      }
    } catch (e) {
      // kaspa-wasm not available in this environment: every kaspa field stays false
    }

    // Probe Igra (priority: options > config > env > missing)
    let rpcUrl = options?.igraRpcUrl;
    if (!rpcUrl && this.sdk) {
       // Assuming config access pattern
       const networkId = (this.sdk.network as string) || "simnet";
       rpcUrl = this.sdk.config?.config?.networks?.[networkId]?.igraRpcUrl;
    }
    if (!rpcUrl && process.env.IGRA_RPC_URL) {
       rpcUrl = process.env.IGRA_RPC_URL;
    }

    if (rpcUrl) {
      // SURFACE-TRUTH-1B (ST-D): the raw URL is only used to probe; what this report returns is the URL and the error text
      // without credentials (the URL secret boundary of EVIDENCE-TRUST-1). It used to return both raw.
      const shownUrl = redactUrlCredentials(rpcUrl);
      try {
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "getIgraInfo", id: 1, params: [] })
        }).catch(() => null);

        if (res && res.ok) {
           const data = await res.json();
           if (data.error) {
             env.igra = { available: false, rpcUrl: shownUrl, reason: redactUrlCredentialsInText(`Igra RPC error: ${data.error.message}`) };
           } else {
             env.igra = { available: true, rpcUrl: shownUrl };
           }
        } else {
           env.igra = { available: false, rpcUrl: shownUrl, reason: "Igra RPC endpoint is unreachable" };
        }
      } catch (e: any) {
        env.igra = { available: false, rpcUrl: shownUrl, reason: redactUrlCredentialsInText(String(e?.message ?? e)) };
      }
    } else {
      env.igra = { available: false, reason: "MISSING_DEPENDENCY: No IGRA_RPC_URL provided" };
    }

    this._cachedEnv = env;
    return env;
  }
}

/**
 * What this build contains, without probing anything: the entries that depend on the environment (`silverScript`,
 * `covenants`, `transactionV1`) are false and marked "not probed" in `reasons`. `HardkasCapabilitiesApi.get()` derives
 * them.
 */
export function createHardkasCapabilities(): HardkasCapabilities {
  const notProbed = "not probed: HardkasCapabilitiesApi.get() checks it";
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
      // L2 (Igra profiles, the bridge model) is a Lab, not the L1 core: the L1 CLI registers no L2 group and the SDK's L2
      // operations refuse (L2_NOT_IN_CORE). The SDK still carries the Igra profile list (`l2.listProfiles()`) until the
      // Surface Cut; that is data, not an L2 capability.
      l2Profiles: false,
      l2BridgeAssumptions: false,
      consensusValidation: false,
      productionWallet: false,
      silverScript: false,
      covenants: false,
      // the SDK plans no covenant transaction (SURFACE-TRUTH-1A: planDeploy/planSpend refuse); a fact of this build
      sdkCovenantPlanning: false,
      transactionV1: false,
      trustlessExit: false,
      differentialDagValidation: false
    },
    scopes: {
      silverScript: `compiler: managed silverc ${SILVERSCRIPT_RELEASE.releaseTag} (hardkas silver compile)`,
      covenants:
        "1:1 auth-bound covenant transitions only, built by hardkas silver covenant genesis|transition against the canonical localnet; no general covenant support",
      sdkCovenantPlanning: "not supported: the SDK's covenants.planDeploy/planSpend refuse with COVENANT_PLAN_UNSUPPORTED"
    },
    reasons: { silverScript: notProbed, covenants: notProbed, transactionV1: notProbed },
    trustBoundaries: {
      replay: "local-simulator-only",
      artifacts: "internal-integrity-only",
      simulator: "local-simulation-only",
      queryStore: "rebuildable-read-model",
      l2Bridge: "pre-zk-assumptions"
    }
  };
}

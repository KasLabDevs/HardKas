import fs from "node:fs";
import path from "node:path";
import { CURRENT_HASH_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";
import {
  KASPAD_REFERENCE_IMAGE,
  CPUMINER_REFERENCE_IMAGE,
  SILVERSCRIPT_RELEASE,
  nodeSyncStateOf,
  redactUrlCredentials,
  redactUrlCredentialsInText,
  isMainnetNetworkId,
  declaredNetworkIdOf,
  type NodeIdentityRecord
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
     * `hardkas silver covenant genesis|transition` (managed silverc + verified kaspa-wasm + the node those commands would
     * use proving its identity: the canonical localnet unless another node is given, INT9-C5). Not
     * general covenant support, and not the SDK's planning (`sdkCovenantPlanning`).
     */
    covenants: boolean;
    /**
     * Generic covenant planning from the SDK (`covenants.planDeploy()`/`planSpend()`): false in this build, they refuse
     * with COVENANT_PLAN_UNSUPPORTED. It does NOT say the SDK plans no covenant transaction: the v1 engine does
     * (`covenants.planGenesis/planTransition/planContractDeploy/planContractSpend`, `sign`, `send`); see
     * `scopes.sdkCovenantPlanning` for what of it a node has certified (HK-15).
     */
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
    /** Where a `vprogs` was found on PATH (it is never executed by the probe). */
    path?: string;
    /** Always false: HardKAS pins no vprogs toolchain. */
    verified?: false;
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
  /**
   * The node the Silver on-chain commands would use, proving its identity (INT9-C5): the canonical localnet by container,
   * image digest, endpoint, network and version (`verification: "canonical"`); any other node by what it reports at its
   * endpoint — network, this release's version, synced, not the simulator (`"endpoint"`); `"unresolved"` when no node
   * could be chosen (a refused network, no endpoint declared), nothing contacted.
   */
  node: ReadinessCheck & {
    serverVersion?: string;
    verification?: "canonical" | "endpoint" | "unresolved";
    url?: string;
    network?: string;
    /**
     * INT9 (A × C5): the node proved its identity but does not say it is synced. Being synced is a verdict apart from
     * identity, and the Silver on-chain commands require it on every node (NODE_NOT_SYNCED), so the node is not ready.
     */
    notSynced?: boolean;
  };
  ready: {
    "silver.compile.v1": boolean;
    "silver.p2sh.deploy-spend.v1": boolean;
    "toccata.covenant.auth-1to1-transition.v1": boolean;
  };
}

/**
 * INT9-C5 · which node the readiness checks. Default: the canonical localnet. Since L1-CORE-1 B3 `hardkas silver
 * deploy|spend|covenant` run on any node that proves its identity by what it reports (`--url`, or the endpoint the
 * workspace declares), so `hardkas silver doctor` and `hardkas capabilities` pass the node those commands would use.
 */
export interface SilverReadinessOptions {
  /** A node HardKAS does not manage, proven by what it reports at `url` for `network` (never mainnet). */
  readonly endpoint?: { readonly url: string; readonly network: string } | undefined;
  /** No node could be chosen (why, with its code): reported as the node check, nothing contacted. */
  readonly unresolved?: string | undefined;
  /**
   * RC1-R2 (D4): the identity record the caller already probed for that same node (the endpoint's, or the canonical
   * localnet's when `endpoint` is absent), with its own bounded timeout: judged by the same rules, never probed again.
   * `hardkas doctor` passes the record its connectivity and identity sections were built from.
   */
  readonly identity?: NodeIdentityRecord | undefined;
}

/** How to check another node when the canonical one did not prove itself. */
const OTHER_NODE_HINT = "the Silver on-chain commands also run on another node that proves its identity: check one with `hardkas silver doctor --url <url>`";

/** The record's sync verdict (records built before INT9-A carry none: read it from the observation). */
function syncOf(id: NodeIdentityRecord): ReturnType<typeof nodeSyncStateOf> {
  return (id as { sync?: ReturnType<typeof nodeSyncStateOf> }).sync ?? nodeSyncStateOf(id.observed);
}

async function nodeReadiness(options: SilverReadinessOptions): Promise<SilverReadiness["node"]> {
  if (options.unresolved !== undefined) return { ok: false, verification: "unresolved", detail: options.unresolved };
  if (options.endpoint) {
    const { url, network } = options.endpoint;
    const shown = redactUrlCredentials(url);
    // MAINNET TOTAL LOCKDOWN: any mainnet spelling (the caller passes the network the entry declares)
    if (isMainnetNetworkId(network)) return { ok: false, verification: "unresolved", url: shown, network, detail: "MAINNET_CONNECTION_DISABLED: mainnet is refused: nothing was contacted" };
    try {
      const { verifyEndpointIdentity } = await import("@hardkas/node-runner");
      const id = options.identity ?? (await verifyEndpointIdentity(url, network));
      // INT9 (A × C5): identity first, then sync, as the Silver commands require both
      if (id.verified && id.kind === "rusty-kaspad" && syncOf(id) !== "synced") {
        return {
          ok: false,
          verification: "endpoint",
          url: shown,
          network,
          notSynced: true,
          detail: `rusty-kaspad ${id.observed.server?.serverVersion} at ${shown} (${network}) proved its identity but is not synced (${syncOf(id)}): the Silver on-chain commands would refuse it with NODE_NOT_SYNCED`,
          serverVersion: String(id.observed.server?.serverVersion)
        };
      }
      // HK-01: only a verified rusty-kaspad counts, never a simulator; no container or image is checked for an endpoint
      return id.verified && id.kind === "rusty-kaspad"
        ? {
            ok: true,
            verification: "endpoint",
            url: shown,
            network,
            detail: `rusty-kaspad ${id.observed.server?.serverVersion} at ${shown} (${network}), proven by what it reports: network, version, not the simulator; and synced; no container or image checked`,
            serverVersion: String(id.observed.server?.serverVersion)
          }
        : {
            ok: false,
            verification: "endpoint",
            url: shown,
            network,
            detail: id.verified ? `the node at ${shown} is a ${id.kind}, not a rusty-kaspad` : `the node at ${shown}: ${id.problems.join("; ")}`
          };
    } catch (e: unknown) {
      return { ok: false, verification: "endpoint", url: shown, network, detail: `the node at ${shown}: ${String((e as Error | null | undefined)?.message ?? e)}` };
    }
  }
  try {
    const { verifyNodeIdentity } = await import("@hardkas/node-runner");
    const id = options.identity ?? (await verifyNodeIdentity());
    // HK-01: only a verified rusty-kaspad counts (never a simulator, whatever the environment); the detail names the
    // container and the digest that were observed.
    const container = id.observed.container?.name;
    // INT9 (A × C5): the managed localnet too must say it is synced (the Silver commands require it there as well)
    if (id.verified && id.kind === "rusty-kaspad" && container && syncOf(id) !== "synced") {
      return {
        ok: false,
        verification: "canonical",
        notSynced: true,
        detail: `${container} rusty-kaspad ${id.observed.server?.serverVersion} proved its identity but is not synced (${syncOf(id)}): the Silver on-chain commands would refuse it with NODE_NOT_SYNCED`,
        serverVersion: String(id.observed.server?.serverVersion)
      };
    }
    return id.verified && id.kind === "rusty-kaspad" && container
      ? {
          ok: true,
          verification: "canonical",
          detail: `${container} rusty-kaspad ${id.observed.server?.serverVersion} (${id.observedImageDigest ?? "digest not observed"})`,
          serverVersion: String(id.observed.server?.serverVersion)
        }
      : {
          ok: false,
          verification: "canonical",
          detail: `${id.verified ? `the verified node is a ${id.kind}, not the canonical rusty-kaspad` : id.problems.join("; ")} (${OTHER_NODE_HINT})`
        };
  } catch (e: unknown) {
    return { ok: false, verification: "canonical", detail: `${String((e as Error | null | undefined)?.message ?? e)} (${OTHER_NODE_HINT})` };
  }
}

/**
 * The managed silverc resolves, the managed kaspa-wasm is verified on disk, and the node the Silver on-chain commands
 * would use proves its identity (the canonical localnet by default; `options.endpoint` for another node): what
 * `hardkas silver compile|deploy|spend|covenant` need. Read-only; failures are reported, never thrown.
 */
export async function probeSilverReadiness(options: SilverReadinessOptions = {}): Promise<SilverReadiness> {
  const core = await import("@hardkas/core");
  const wasm = core.verifyManagedToolchainSync(core.KASPA_WASM_REFERENCE);
  let silverc: ReadinessCheck;
  try {
    const s = core.resolveManagedSilverc();
    silverc = { ok: true, detail: `${s.ref.assetName} ${s.ref.files[s.ref.entry]!.sha256}` };
  } catch (e: any) {
    silverc = { ok: false, detail: String(e?.code ?? e?.message) };
  }
  const node = await nodeReadiness(options);
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

/** The first file named `command` (with PATHEXT on Windows) in a PATH directory, without running it. */
export function findOnPath(command: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const dirs = String(env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? ["", ...String(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)] : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // not here
      }
    }
  }
  return undefined;
}

function nodeReason(node: SilverReadiness["node"]): string {
  if (node.notSynced) {
    return node.verification === "endpoint" ? `the node at ${node.url} is not synced (NODE_NOT_SYNCED)` : `the canonical node is not synced (NODE_NOT_SYNCED)`;
  }
  if (node.verification === "endpoint") return `the node at ${node.url} did not prove its identity`;
  if (node.verification === "unresolved") return `no node to check: ${node.detail}`;
  return `the canonical node did not prove its identity (${OTHER_NODE_HINT})`;
}

function covenantReason(r: SilverReadiness): string {
  const missing = [
    ...(r.toolchains.silverc.ok ? [] : ["the managed silverc does not resolve"]),
    ...(r.toolchains["kaspa-wasm"].ok ? [] : ["the managed kaspa-wasm is not verified"]),
    ...(r.node.ok ? [] : [nodeReason(r.node)])
  ];
  return `${missing.join("; ")} (see \`hardkas silver doctor\`)`;
}

export class HardkasCapabilitiesApi {
  private _cachedEnv?: EnvironmentCapabilities;
  private _readiness?: SilverReadiness;

  /**
   * `readiness`: which node the Silver readiness checks (INT9-C5; default the canonical localnet). `hardkas
   * capabilities` passes the node the Silver on-chain commands would use (`--url`, or the workspace's endpoint).
   */
  constructor(private sdk?: any, private readonly readinessOptions: SilverReadinessOptions = {}) {}

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
    if (!this._readiness || options?.refresh) this._readiness = await probeSilverReadiness(this.readinessOptions);
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
      env.toccata = { available: false, reason: `no node observed: ${nodeReason(readiness.node)} (see \`hardkas silver doctor\`)` };
    }

    // Probe vProgs (L-08, audit 3-nov): HardKAS pins no vprogs toolchain, so the probe only LOOKS for a `vprogs` on PATH
    // and reports where it is, marked unverified; it no longer executes whatever binary of that name PATH resolves to.
    const vprogsPath = findOnPath("vprogs");
    env.vprogs = vprogsPath
      ? { installed: true, version: "unknown", path: vprogsPath, verified: false, reason: "UNVERIFIED: found on PATH, not executed and not pinned by HardKAS" }
      : { installed: false, reason: "MISSING_DEPENDENCY: 'vprogs' CLI not found on PATH" };

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
    // MAINNET TOTAL LOCKDOWN: on a mainnet instance the Igra endpoint (an L2 of Kaspa mainnet) is never probed
    const instanceNetwork = this.sdk ? String(this.sdk.network ?? "") : "";
    const onMainnet = this.sdk !== undefined && (isMainnetNetworkId(instanceNetwork) || isMainnetNetworkId(declaredNetworkIdOf(this.sdk.config?.config, instanceNetwork)));

    if (rpcUrl && onMainnet) {
      env.igra = { available: false, rpcUrl: redactUrlCredentials(rpcUrl), reason: "MAINNET_CONNECTION_DISABLED: mainnet connections are disabled in HardKAS; nothing was contacted" };
    } else if (rpcUrl) {
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
      // operations refuse (L2_NOT_IN_CORE). Since L2-EXT stage 2 the SDK does not carry the Igra profile list either
      // (`l2.listProfiles()` refuses with L2_EXTENSION_REQUIRED; the list is in @hardkas/l2).
      l2Profiles: false,
      l2BridgeAssumptions: false,
      consensusValidation: false,
      productionWallet: false,
      silverScript: false,
      covenants: false,
      // generic planning (planDeploy/planSpend) refuses (SURFACE-TRUTH-1A); the v1 engine's planning is described in
      // scopes.sdkCovenantPlanning (HK-15): a fact of this build
      sdkCovenantPlanning: false,
      transactionV1: false,
      trustlessExit: false,
      differentialDagValidation: false
    },
    scopes: {
      silverScript: `compiler: managed silverc ${SILVERSCRIPT_RELEASE.releaseTag} (hardkas silver compile)`,
      covenants:
        "1:1 auth-bound covenant transitions, built by hardkas silver covenant genesis|transition against the canonical localnet " +
        "or another node that proves its identity by what it reports (--url, or the workspace's endpoint; a verified rusty-kaspad, " +
        "never a simulator); node-certified for that topology only; no general covenant support",
      sdkCovenantPlanning:
        "generic planning not supported: the SDK's covenants.planDeploy/planSpend refuse with COVENANT_PLAN_UNSUPPORTED. " +
        "The SDK's v1 engine plans, validates (F1.4), signs and sends covenant transactions (covenants.planGenesis/planTransition/" +
        "planContractDeploy/planContractSpend, sign, send): node-certified for 1:1 auth-bound transitions (a corpus capability); " +
        "1:N, N:M and termination judged by a real rusty-kaspad on simnet only (covenant-topologies-node.simnet), not a corpus " +
        "capability, with no testnet-10 evidence"
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

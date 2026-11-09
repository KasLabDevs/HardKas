// RC1-R2 · D4 — the node part of `hardkas doctor`: which node the workspace (or `--url` / `--network`) declares, and
// whether it answers, is who it says it is, is synced, and can carry the flow asked for (payment, Silver, covenants).
//
// What it contacts, and when:
//  - nothing when no node is declared (the simulator, no workspace), when the check runs offline (`ci verify`), for
//    mainnet (refused before any connection, whatever the endpoint) and for a public testnet without the payments'
//    opt-in (experimental: true and network.allowPublic: true) — each is a typed SKIP and the diagnosis is PARTIAL;
//  - the canonical localnet only when it is the workspace's node (a simnet whose endpoint is the canonical one) and
//    Docker reports its container running; never because it happens to exist on this machine;
//  - otherwise ONE getServerInfo on the declared endpoint, with a bounded timeout (connect and answer), and nothing
//    else is asked of the node (the Silver readiness reuses that same answer).
// The statuses keep doctor's contract: a check that proves something broken FAILS (exit 1); a node that does not
// answer, is not synced or cannot carry a flow that was not asked for WARNS; what was not checked is SKIP (exit 0).
// A flow asked for with `--flow` and not ready FAILS.
import type { NetworkIdentity, NodeIdentityRecord } from "@hardkas/core";

export type DoctorSectionId = "local-config" | "connectivity" | "network-identity" | "sync" | "capability";
export type DoctorCheckStatus = "pass" | "fail" | "warn" | "skip";
export type DoctorFlow = "payment" | "silver" | "covenant";

export const DOCTOR_SECTIONS: ReadonlyArray<{ id: DoctorSectionId; title: string }> = [
  { id: "local-config", title: "Local configuration" },
  { id: "connectivity", title: "Connectivity" },
  { id: "network-identity", title: "Network identity" },
  { id: "sync", title: "Synchronization" },
  { id: "capability", title: "Capability for the flow" }
];

export const DOCTOR_FLOWS: readonly DoctorFlow[] = ["payment", "silver", "covenant"];

/** The capability each Silver flow is reported as (the same ids `silver doctor` and `capabilities` use). */
const FLOW_CAPABILITY: Record<Exclude<DoctorFlow, "payment">, "silver.p2sh.deploy-spend.v1" | "toccata.covenant.auth-1to1-transition.v1"> = {
  silver: "silver.p2sh.deploy-spend.v1",
  covenant: "toccata.covenant.auth-1to1-transition.v1"
};

export interface DoctorNodeCheck {
  name: string;
  section: Exclude<DoctorSectionId, "local-config">;
  category: "network";
  code: string;
  status: DoctorCheckStatus;
  message: string;
  suggestion?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface DoctorNodeReport {
  /** Where the node came from: `--url`, `--network`, the workspace's declaration, or none. */
  source: "explicit-url" | "explicit-network" | "workspace" | "none";
  /** The config entry name, when one names the node. */
  name?: string | undefined;
  /** The network the node must serve. */
  network?: string | undefined;
  /** The endpoint (credentials redacted). */
  url?: string | undefined;
  /** How the endpoint was chosen (the shared endpoint authority). */
  endpointSource?: "explicit" | "declared" | "local-default" | undefined;
  /** The canonical localnet HardKAS manages (proven by container + image digest), or any other node (by its report). */
  managed?: boolean | undefined;
  contacted: boolean;
  timeoutMs: number;
  latencyMs?: number | undefined;
  /** `hardkas.networkIdentity.v1` of the node that answered. */
  identity?: NetworkIdentity | undefined;
  hasUtxoIndex?: boolean | undefined;
  virtualDaaScore?: string | undefined;
}

export interface DoctorNodeDiagnosis {
  checks: DoctorNodeCheck[];
  node: DoctorNodeReport;
  /** Set when the node's identity or sync could not be established: the diagnosis is partial, and why. */
  partial?: { code: string; message: string } | undefined;
}

export interface DoctorNodeOptions {
  root: string;
  url?: string | undefined;
  network?: string | undefined;
  flows?: readonly DoctorFlow[] | undefined;
  timeoutMs?: number | undefined;
  /** `ci verify`: the workspace is checked offline; no node is contacted. */
  offline?: boolean | undefined;
  /** Whether the Docker daemon answered (the canonical localnet's container can only be asked through it). */
  dockerReachable: boolean;
}

export const DOCTOR_DEFAULT_TIMEOUT_MS = 8000;

/** A usage error of the doctor's node options (typed, exit 2), raised before anything runs. */
export async function doctorUsageError(code: string, message: string): Promise<never> {
  const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
  throw new HardkasCliError(code, message, { exitCode: HardkasExitCode.USAGE_ERROR });
}

/** `--flow` values: one or more of payment, silver, covenant (comma-separated or repeated). */
export async function parseDoctorFlows(value: unknown): Promise<DoctorFlow[]> {
  if (value === undefined) return [];
  const raw = (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(",")).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const alias: Record<string, DoctorFlow> = { payment: "payment", payments: "payment", silver: "silver", covenant: "covenant", covenants: "covenant" };
  const flows: DoctorFlow[] = [];
  for (const r of raw) {
    const f = alias[r];
    if (!f) await doctorUsageError("DOCTOR_FLOW_INVALID", `--flow '${r}' is not one of payment, silver, covenant`);
    if (!flows.includes(f!)) flows.push(f!);
  }
  return flows;
}

export async function parseDoctorTimeout(value: unknown): Promise<number> {
  if (value === undefined) return DOCTOR_DEFAULT_TIMEOUT_MS;
  const n = Number(value);
  if (!/^\d{1,6}$/.test(String(value)) || n < 100 || n > 120_000) {
    await doctorUsageError("DOCTOR_TIMEOUT_INVALID", `--timeout '${String(value)}' must be a whole number of milliseconds between 100 and 120000`);
  }
  return n;
}

const norm = (u: string) => u.trim().replace(/\/+$/, "").replace("://localhost:", "://127.0.0.1:");

function deadline<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type Probe = { error?: unknown; latencyMs?: number; hasUtxoIndex?: boolean; virtualDaaScore?: string };

/** How a failed getServerInfo failed: no connection, no answer in time, or an answer that is not a node identity. */
function failureOf(e: unknown): { code: "NODE_UNREACHABLE" | "NODE_TIMEOUT" | "NODE_ANSWER_UNREADABLE"; text: string } {
  const err = e as { code?: unknown; message?: unknown } | null | undefined;
  const text = String(err?.message ?? e);
  const code = String(err?.code ?? "");
  if (code === "DOCTOR_PROBE_DEADLINE" || code === "RPC_TIMEOUT" || /timed out|timeout/i.test(text)) return { code: "NODE_TIMEOUT", text };
  if (code === "RPC_CONNECTION_FAILED" || /cannot connect|ECONNREFUSED|connection (refused|lost|closed)|not connected/i.test(text)) {
    return { code: "NODE_UNREACHABLE", text };
  }
  return { code: "NODE_ANSWER_UNREADABLE", text };
}

/** ONE bounded getServerInfo (connect + answer), never the getInfo fallback; the answer's facts are kept for the report. */
function boundedServerInfo(timeoutMs: number, probe: Probe) {
  return async (url: string) => {
    const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
    const client = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs });
    const started = Date.now();
    try {
      const info: any = await deadline(client.call<any>("getServerInfo", {}), timeoutMs + 2000, () =>
        Object.assign(new Error(`no answer from ${url} within ${timeoutMs + 2000}ms`), { code: "DOCTOR_PROBE_DEADLINE" })
      );
      probe.latencyMs = Date.now() - started;
      if (typeof info?.hasUtxoIndex === "boolean") probe.hasUtxoIndex = info.hasUtxoIndex;
      if (info?.virtualDaaScore !== undefined) probe.virtualDaaScore = String(info.virtualDaaScore);
      return {
        networkId: String(info?.networkId ?? "unknown"),
        serverVersion: String(info?.serverVersion ?? ""),
        ...(typeof info?.isSynced === "boolean" ? { isSynced: info.isSynced } : {}),
        ...(typeof info?.rpcApiVersion === "number" ? { rpcApiVersion: info.rpcApiVersion } : {}),
        ...(typeof info?.rpcApiRevision === "number" ? { rpcApiRevision: info.rpcApiRevision } : {}),
        ...(typeof info?.hasUtxoIndex === "boolean" ? { hasUtxoIndex: info.hasUtxoIndex } : {})
      };
    } catch (e) {
      probe.error = e;
      throw e;
    } finally {
      await deadline(client.close(), timeoutMs + 2000, () => new Error("close timed out")).catch(() => {});
    }
  };
}

interface Resolved {
  node: DoctorNodeReport;
  /** Not contacted, and why (status of the connectivity check). */
  stop?: { code: string; status: DoctorCheckStatus; message: string; suggestion?: string };
  /** The payments' opt-in for a public network. */
  publicOptIn: boolean;
  simulatedWorkspace: boolean;
}

async function resolveNode(opts: DoctorNodeOptions, timeoutMs: number): Promise<Resolved> {
  const { loadHardkasConfig, resolveNodeEndpoint, isPublicKaspaNetwork } = await import("@hardkas/config");
  const core = await import("@hardkas/core");
  let config: any;
  try {
    config = (await loadHardkasConfig({ cwd: opts.root })).config;
  } catch {
    config = undefined;
  }
  const exec: any = config?.execution;
  const target = exec?.default ? exec.targets?.[exec.default] : undefined;
  const workspaceName: string | undefined = typeof target?.network === "string" ? target.network : config?.defaultNetwork;
  const workspaceEntry = workspaceName ? (config?.networks?.[workspaceName] as { network?: unknown; kind?: unknown } | undefined) : undefined;
  const simulatedWorkspace =
    target?.mode === "simulator" || workspaceEntry?.kind === "simulated" || core.declaredNetworkIdOf(config, workspaceName) === "simulated" || !workspaceName;
  const publicOptIn = config?.network?.allowPublic === true && config?.experimental === true;

  const source: DoctorNodeReport["source"] = opts.network !== undefined ? "explicit-network" : opts.url !== undefined ? "explicit-url" : "workspace";
  const name = opts.network ?? (simulatedWorkspace ? undefined : workspaceName);
  const base = { contacted: false, timeoutMs };
  if (!name) {
    if (opts.url !== undefined) {
      await doctorUsageError(
        "DOCTOR_NETWORK_REQUIRED",
        `--url needs the network the node must serve: this workspace declares none (it runs on the HardKAS simulator, or there is no workspace). Pass --network <name> too; an address never says which network it is. Nothing was contacted.`
      );
    }
    return {
      node: { source: "none", ...base },
      simulatedWorkspace,
      publicOptIn,
      stop: {
        code: "NO_NODE_CONFIGURED",
        status: "skip",
        message: simulatedWorkspace
          ? "the workspace runs on the HardKAS simulator, which has no node: no node was checked"
          : "no node is declared: no node was checked",
        suggestion: "Check a node with 'hardkas doctor --network <name>' (a network of hardkas.config.ts) or 'hardkas doctor --network <name> --url <endpoint>'."
      }
    };
  }
  const network = core.declaredNetworkIdOf(config, name) ?? name;
  const node: DoctorNodeReport = { source, name, network, ...base };
  const entry = config?.networks?.[name] as { kind?: unknown } | undefined;
  if (network === "simulated" || entry?.kind === "simulated") {
    return {
      node,
      simulatedWorkspace,
      publicOptIn,
      stop: { code: "SIMULATOR_HAS_NO_NODE", status: "skip", message: `'${name}' is the HardKAS simulator: it executes in this process and has no node. Nothing was contacted.` }
    };
  }
  // never mainnet, whatever the endpoint: refused before any connection (not even a read)
  if (core.isMainnetNetworkId(network)) {
    return {
      node,
      simulatedWorkspace,
      publicOptIn,
      stop: {
        code: "MAINNET_NOT_CONTACTED",
        status: "skip",
        message: `${network}: doctor never contacts a mainnet node, not even to read, and HardKAS does not sign or send there. Nothing was contacted.`
      }
    };
  }
  if (!core.isKaspaL1NetworkId(network)) {
    return {
      node,
      simulatedWorkspace,
      publicOptIn,
      stop: { code: "NETWORK_ID_INVALID", status: "fail", message: `'${network}' is not a Kaspa L1 network id (simnet, devnet, testnet-<n>). Nothing was contacted.`, suggestion: "Declare networks['<name>'].network in hardkas.config.ts." }
    };
  }
  if (opts.offline) {
    return { node, simulatedWorkspace, publicOptIn, stop: { code: "NODE_NOT_CONTACTED", status: "skip", message: "not contacted: this check runs offline (hardkas doctor checks the node)" } };
  }
  if (isPublicKaspaNetwork(network) && !publicOptIn) {
    return {
      node,
      simulatedWorkspace,
      publicOptIn,
      stop: {
        code: "PUBLIC_NETWORK_BLOCKED",
        status: "skip",
        message: `${network} is a public network: HardKAS contacts it only with the payments' opt-in (experimental: true and network.allowPublic: true in hardkas.config.ts). Nothing was contacted.`,
        suggestion: "Set experimental: true and network.allowPublic: true in hardkas.config.ts to use a public testnet."
      }
    };
  }
  let resolved: { url: string; source: "explicit" | "declared" | "local-default" };
  try {
    resolved = resolveNodeEndpoint({ config: config ?? { networks: {} }, networkId: name, ...(opts.url !== undefined ? { explicitUrl: opts.url } : {}) });
  } catch (e: unknown) {
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    const code = String(err?.code ?? "NETWORK_ENDPOINT_REQUIRED");
    return {
      node,
      simulatedWorkspace,
      publicOptIn,
      stop: {
        code,
        status: "fail",
        message: `${code}: ${String(err?.message ?? e).replace(new RegExp(`^${code}:\\s*`), "")}`,
        suggestion: `Declare networks['${name}'].rpcUrl in hardkas.config.ts or pass --url.`
      }
    };
  }
  const managed = network === "simnet" && norm(resolved.url) === norm(core.nodeRpcUrl());
  return {
    node: { ...node, url: core.redactUrlCredentials(resolved.url), endpointSource: resolved.source, managed, rawUrl: resolved.url } as DoctorNodeReport & { rawUrl: string },
    simulatedWorkspace,
    publicOptIn
  };
}

/**
 * The node part of the diagnosis: connectivity, network identity, sync and the flows' capability, as typed checks.
 * Never throws for what the node does (a usage error of the options is the only throw, before anything is contacted).
 */
export async function diagnoseNode(opts: DoctorNodeOptions): Promise<DoctorNodeDiagnosis> {
  const timeoutMs = opts.timeoutMs ?? DOCTOR_DEFAULT_TIMEOUT_MS;
  const flows = opts.flows && opts.flows.length > 0 ? opts.flows : DOCTOR_FLOWS;
  const requested = (f: DoctorFlow) => (opts.flows ?? []).includes(f);
  const core = await import("@hardkas/core");
  const resolved = await resolveNode(opts, timeoutMs);
  const node = resolved.node as DoctorNodeReport & { rawUrl?: string };
  const rawUrl = node.rawUrl;
  delete node.rawUrl;
  const checks: DoctorNodeCheck[] = [];
  const add = (c: Omit<DoctorNodeCheck, "category">) => checks.push({ category: "network", ...c });
  const identityName = node.managed ? `Managed localnet (${node.network})` : `Network endpoint (${node.network ?? "?"})`;

  // ------------------------------------------------------------------ flows (shared by every outcome)
  type FlowVerdict = { ready: boolean; code: string; message: string; evaluated: boolean };
  const flowCheck = (flow: DoctorFlow, v: FlowVerdict) => {
    const label = flow === "payment" ? "Payment flow" : flow === "silver" ? `Silver flow (${FLOW_CAPABILITY.silver})` : `Covenant flow (${FLOW_CAPABILITY.covenant})`;
    const status: DoctorCheckStatus = v.ready ? "pass" : requested(flow) ? "fail" : v.evaluated ? "warn" : "skip";
    add({ name: label, section: "capability", code: v.code, status, message: v.message, ...(flow !== "payment" ? { details: { capability: FLOW_CAPABILITY[flow] } } : {}) });
  };
  const policyBlock = (network: string | undefined): FlowVerdict | undefined => {
    if (network && core.isMainnetNetworkId(network)) {
      return { ready: false, evaluated: true, code: "MAINNET_TRANSACTIONS_DISABLED", message: "HardKAS does not sign or send on mainnet in this release" };
    }
    return undefined;
  };

  // ------------------------------------------------------------------ not contacted
  if (resolved.stop) {
    const stop = resolved.stop;
    add({ name: "Node connectivity", section: "connectivity", code: stop.code, status: stop.status, message: stop.message, ...(stop.suggestion ? { suggestion: stop.suggestion } : {}) });
    add({ name: identityName, section: "network-identity", code: "NODE_NOT_CHECKED", status: "skip", message: `not checked: ${stop.code}` });
    add({ name: "Node sync", section: "sync", code: "NODE_NOT_CHECKED", status: "skip", message: `not checked: ${stop.code}` });
    for (const flow of flows) {
      const blocked = policyBlock(node.network);
      if (blocked) flowCheck(flow, blocked);
      else if (stop.code === "PUBLIC_NETWORK_BLOCKED") flowCheck(flow, { ready: false, evaluated: true, code: "PUBLIC_NETWORK_BLOCKED", message: stop.message });
      else if (flow === "payment" && (stop.code === "NO_NODE_CONFIGURED" || stop.code === "SIMULATOR_HAS_NO_NODE") && resolved.simulatedWorkspace && !opts.network) {
        flowCheck(flow, {
          ready: true,
          evaluated: true,
          code: "FLOW_SIMULATED",
          message: "payments run on the HardKAS simulator in this workspace: no node is involved, and nothing it produces is evidence of a real network"
        });
      } else flowCheck(flow, { ready: false, evaluated: false, code: stop.code, message: `not evaluated: no node was checked (${stop.code})` });
    }
    return { checks, node, partial: { code: stop.code, message: stop.message } };
  }

  // ------------------------------------------------------------------ the managed localnet: only if Docker says it runs
  const network = node.network!;
  const probe: Probe = {};
  let record: NodeIdentityRecord | undefined;
  let notRunning: { code: string; message: string } | undefined;
  if (node.managed) {
    if (!opts.dockerReachable) {
      notRunning = { code: "DOCKER_UNAVAILABLE", message: `the workspace's node is the managed localnet (${node.url}), and Docker did not answer: its container cannot be proven, so nothing was contacted` };
    } else {
      let container: Awaited<ReturnType<typeof core.inspectNodeContainer>> | undefined;
      try {
        container = await core.inspectNodeContainer(core.CANONICAL_LOCALNET.containerName);
      } catch (e: unknown) {
        notRunning = { code: "DOCKER_UNAVAILABLE", message: `Docker could not be asked for ${core.CANONICAL_LOCALNET.containerName}: ${String((e as Error)?.message ?? e)}` };
      }
      if (!notRunning && !container) notRunning = { code: "LOCALNET_NOT_FOUND", message: `the managed localnet (${core.CANONICAL_LOCALNET.containerName}) does not exist: nothing was contacted` };
      else if (!notRunning && container && !container.running) notRunning = { code: "LOCALNET_NOT_RUNNING", message: `the managed localnet (${core.CANONICAL_LOCALNET.containerName}) is not running: nothing was contacted` };
    }
    if (notRunning) {
      add({ name: "Node connectivity", section: "connectivity", code: notRunning.code, status: "skip", message: notRunning.message, suggestion: "Start it with 'hardkas node start', or check another node with --url." });
      add({ name: identityName, section: "network-identity", code: "NODE_NOT_CHECKED", status: "skip", message: `not checked: ${notRunning.code}` });
      add({ name: "Node sync", section: "sync", code: "NODE_NOT_CHECKED", status: "skip", message: `not checked: ${notRunning.code}` });
      for (const flow of flows) flowCheck(flow, { ready: false, evaluated: false, code: notRunning.code, message: `not evaluated: ${notRunning.message}` });
      return { checks, node, partial: notRunning };
    }
    record = await core.probeNodeIdentity({ expected: core.CANONICAL_NODE_EXPECTATION, getServerInfo: boundedServerInfo(timeoutMs, probe) });
  } else {
    record = await core.probeNodeIdentity({ expected: core.endpointNodeExpectation(rawUrl!, network), getServerInfo: boundedServerInfo(timeoutMs, probe) });
  }
  node.contacted = true;
  if (probe.latencyMs !== undefined) node.latencyMs = probe.latencyMs;
  if (probe.hasUtxoIndex !== undefined) node.hasUtxoIndex = probe.hasUtxoIndex;
  if (probe.virtualDaaScore !== undefined) node.virtualDaaScore = probe.virtualDaaScore;
  const server = record.observed.server;

  // ------------------------------------------------------------------ connectivity
  if (!server) {
    const f = failureOf(probe.error ?? record.problems.join("; "));
    if (f.code === "NODE_ANSWER_UNREADABLE") {
      add({ name: "Node connectivity", section: "connectivity", code: "NODE_REACHABLE", status: "pass", message: `${node.url} answered, but not with a node identity it could read` });
      add({
        name: identityName,
        section: "network-identity",
        code: "NODE_NETWORK_UNKNOWN",
        status: "fail",
        message: `NODE_NETWORK_UNKNOWN: ${node.url} did not say which network it serves (getServerInfo: ${f.text}); HardKAS uses nothing from it`,
        suggestion: `Point the workspace at a rusty-kaspad that serves ${network}.`
      });
      add({ name: "Node sync", section: "sync", code: "NODE_NOT_CHECKED", status: "skip", message: "not checked: the node's identity is unknown" });
      for (const flow of flows) flowCheck(flow, { ready: false, evaluated: true, code: "NODE_NETWORK_UNKNOWN", message: "the node did not identify itself" });
      return { checks, node, partial: { code: "NODE_NETWORK_UNKNOWN", message: "the node's identity could not be read" } };
    }
    add({
      name: "Node connectivity",
      section: "connectivity",
      code: f.code,
      status: "warn",
      message: `${f.code}: ${node.url} ${f.code === "NODE_TIMEOUT" ? `did not answer within ${timeoutMs}ms` : "did not accept a connection"} (${f.text})`,
      suggestion: node.managed ? "Check the node with 'hardkas node status'." : "Is the node running with --rpclisten-json on that address? (--timeout <ms> waits longer.)",
      details: { timeoutMs }
    });
    add({ name: identityName, section: "network-identity", code: "NODE_NOT_CHECKED", status: "skip", message: `not checked: ${f.code}` });
    add({ name: "Node sync", section: "sync", code: "NODE_NOT_CHECKED", status: "skip", message: `not checked: ${f.code}` });
    for (const flow of flows) flowCheck(flow, { ready: false, evaluated: true, code: f.code, message: `the node did not answer (${f.code})` });
    return { checks, node, partial: { code: f.code, message: `the node did not answer: its identity and sync are unknown` } };
  }
  add({
    name: "Node connectivity",
    section: "connectivity",
    code: "NODE_REACHABLE",
    status: "pass",
    message: `${node.url} answered getServerInfo${probe.latencyMs !== undefined ? ` in ${probe.latencyMs}ms` : ""}`,
    details: { timeoutMs, ...(probe.latencyMs !== undefined ? { latencyMs: probe.latencyMs } : {}) }
  });

  // ------------------------------------------------------------------ network identity
  const { canonicalNetworkId } = await import("@hardkas/kaspa-rpc");
  const identity = core.networkIdentityOf(record, network);
  node.identity = identity;
  const observed = String(server.networkId ?? "");
  const version = String(server.serverVersion ?? "");
  const simulator = version.endsWith(core.KASPA_SIMULATOR_VERSION_SUFFIX);
  const unknownNetwork = observed === "" || observed === "unknown" || observed === "undefined";
  const mismatch = !unknownNetwork && canonicalNetworkId(observed) !== canonicalNetworkId(network);
  const containerProblems = node.managed ? record.problems.filter((p) => !/node reports (network|version)/.test(p)) : [];
  const versionOff = version !== record.expected.serverVersion;
  let identityOk = false;
  if (unknownNetwork) {
    add({ name: identityName, section: "network-identity", code: "NODE_NETWORK_UNKNOWN", status: "fail", message: `NODE_NETWORK_UNKNOWN: ${node.url} did not say which network it serves; HardKAS uses nothing from it` });
  } else if (mismatch) {
    add({
      name: identityName,
      section: "network-identity",
      code: "NODE_NETWORK_MISMATCH",
      status: "fail",
      message: `NODE_NETWORK_MISMATCH: ${node.url} serves ${observed}, not ${network}${core.isMainnetNetworkId(observed) ? " (a mainnet node: nothing more was asked of it)" : ""}`,
      suggestion: `Point networks['${node.name}'].rpcUrl at a node that serves ${network}.`,
      details: { expected: network, observed }
    });
  } else if (simulator) {
    add({
      name: identityName,
      section: "network-identity",
      code: "NODE_IS_SIMULATOR",
      status: "fail",
      message: `NODE_IS_SIMULATOR: ${node.url} identifies itself as the HardKAS simulator (${version}), never a node of a real network`,
      details: { observed, serverVersion: version }
    });
  } else if (containerProblems.length > 0) {
    add({
      name: identityName,
      section: "network-identity",
      code: "NODE_IDENTITY_UNVERIFIED",
      status: "fail",
      message: `NODE_IDENTITY_UNVERIFIED: the managed localnet did not prove its container identity: ${containerProblems.join("; ")}`,
      details: { problems: containerProblems }
    });
  } else {
    identityOk = true;
    const how = node.managed
      ? `container ${record.observed.container?.name} with image ${record.observedImageDigest ?? "?"}`
      : "proven by what it reports: network, version, not the simulator; no container or image checked";
    add({
      name: identityName,
      section: "network-identity",
      code: versionOff ? "NODE_VERSION_UNEXPECTED" : "NETWORK_IDENTITY_VERIFIED",
      status: versionOff ? "warn" : "pass",
      message: versionOff
        ? `${node.url} serves ${observed}, but reports version '${version}', not this release's reference '${record.expected.serverVersion}': payments can use it; Silver and covenants refuse it (NODE_IDENTITY_UNVERIFIED)`
        : `${node.url} serves ${observed} (rusty-kaspad ${version}, ${how})`,
      details: { network: observed, serverVersion: version, trust: identity.trust, ...(server.rpcApiVersion !== undefined ? { rpcApiVersion: server.rpcApiVersion } : {}) }
    });
  }

  // ------------------------------------------------------------------ sync
  const sync = record.sync;
  if (!identityOk) {
    add({ name: "Node sync", section: "sync", code: "NODE_NOT_CHECKED", status: "skip", message: "not checked: the node did not prove it serves this network" });
  } else if (sync === "synced") {
    add({ name: "Node sync", section: "sync", code: "NODE_SYNCED", status: "pass", message: `the node says it is synced${probe.virtualDaaScore ? ` (virtual DAA score ${probe.virtualDaaScore})` : ""}` });
  } else {
    add({
      name: "Node sync",
      section: "sync",
      code: sync === "not-synced" ? "NODE_NOT_SYNCED" : "NODE_SYNC_UNKNOWN",
      status: "warn",
      message:
        sync === "not-synced"
          ? `NODE_NOT_SYNCED: the node says it is not synced; plan, send, wait, Silver and covenants refuse it (a well-identified node is not a synced node)`
          : `NODE_SYNC_UNKNOWN: the node did not say whether it is synced; every operation that needs the chain state refuses it`,
      suggestion: "Let it sync (a local simnet/devnet node with no peers needs recent blocks: mine some), then run doctor again."
    });
  }

  // ------------------------------------------------------------------ capability
  const nodeBlock = (): FlowVerdict | undefined => {
    if (unknownNetwork) return { ready: false, evaluated: true, code: "NODE_NETWORK_UNKNOWN", message: "the node did not say which network it serves" };
    if (mismatch) return { ready: false, evaluated: true, code: "NODE_NETWORK_MISMATCH", message: `the node serves ${observed}, not ${network}` };
    if (simulator) return { ready: false, evaluated: true, code: "NODE_IS_SIMULATOR", message: "the node is the HardKAS simulator" };
    if (containerProblems.length > 0) return { ready: false, evaluated: true, code: "NODE_IDENTITY_UNVERIFIED", message: "the managed localnet did not prove its identity" };
    if (sync !== "synced") return { ready: false, evaluated: true, code: sync === "not-synced" ? "NODE_NOT_SYNCED" : "NODE_SYNC_UNKNOWN", message: "the node is not synced" };
    return undefined;
  };
  let silverReadiness: import("@hardkas/sdk").SilverReadiness | undefined;
  for (const flow of flows) {
    const blocked = policyBlock(network) ?? nodeBlock();
    if (blocked) {
      flowCheck(flow, blocked);
      continue;
    }
    if (flow === "payment") {
      if (probe.hasUtxoIndex === false) {
        flowCheck(flow, { ready: false, evaluated: true, code: "NODE_NO_UTXO_INDEX", message: "the node keeps no UTXO index (--utxoindex): HardKAS cannot read the UTXOs a payment spends" });
      } else {
        flowCheck(flow, { ready: true, evaluated: true, code: "FLOW_READY", message: `tx plan/sign/send/wait can use this node for ${network}` });
      }
      continue;
    }
    if (!silverReadiness) {
      const { probeSilverReadiness } = await import("@hardkas/sdk");
      silverReadiness = await probeSilverReadiness(node.managed ? { identity: record } : { endpoint: { url: rawUrl!, network }, identity: record });
    }
    const capability = FLOW_CAPABILITY[flow];
    const ready = silverReadiness.ready[capability] === true;
    const missing = [
      ...(silverReadiness.toolchains.silverc.ok ? [] : [`silverc: ${silverReadiness.toolchains.silverc.detail}`]),
      ...(silverReadiness.toolchains["kaspa-wasm"].ok ? [] : [`kaspa-wasm: ${silverReadiness.toolchains["kaspa-wasm"].detail}`]),
      ...(silverReadiness.node.ok ? [] : [`node: ${silverReadiness.node.detail}`])
    ];
    flowCheck(flow, {
      ready,
      evaluated: true,
      code: ready ? "FLOW_READY" : !silverReadiness.node.ok ? "NODE_IDENTITY_UNVERIFIED" : "TOOLCHAIN_NOT_READY",
      message: ready ? `${capability} is ready on this node (see 'hardkas silver doctor')` : `${capability} is not ready: ${missing.join("; ")}`
    });
  }
  const partial = !identityOk
    ? { code: checks.find((c) => c.section === "network-identity")?.code ?? "NODE_IDENTITY_UNVERIFIED", message: "the node did not prove it serves this network: its sync was not checked" }
    : undefined;
  return { checks, node, ...(partial ? { partial } : {}) };
}

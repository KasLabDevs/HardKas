import { execFile } from "node:child_process";
import { KASPAD_REFERENCE_DIGEST, KASPAD_REFERENCE_IMAGE, KASPAD_REFERENCE_VERSION } from "./node-images.js";
import { redactUrlCredentials } from "./security.js";

/**
 * The node HardKAS treats as real localnet, and how to prove a running node is it.
 *
 * The container name is only an operational identifier (how HardKAS finds and
 * manages the node). Trust comes from the combination checked by
 * {@link evaluateNodeIdentity}: the container's image digest, the container
 * owning the RPC endpoint, and the network and version the node itself reports.
 * A container that merely carries the canonical name is not accepted.
 *
 * Three kinds of node are kept apart (HK-01, audit 6-nov-2026):
 * - `rusty-kaspad`: a real node, proven by container + image digest + endpoint (the canonical localnet and the
 *   harness's own containers). Only this kind is ever evidence of node behaviour.
 * - `kaspa-simulator`: the in-process `@hardkas/simulator`, which reports itself with a `-kaspa-simulator` server version.
 *   It has its own expectation ({@link SIMULATOR_NODE_EXPECTATION}) on its own port and never satisfies the canonical one.
 * - `unverified`: whatever answered did not prove the expected identity.
 * No environment variable changes any of this: {@link evaluateNodeIdentity} is pure.
 */
export type NodeKind = "rusty-kaspad" | "kaspa-simulator";

/** What a {@link NodeIdentityRecord} attests: the expected kind once verified, `unverified` otherwise. */
export type NodeIdentityKind = NodeKind | "unverified";

export interface NodeIdentityExpectation {
  /**
   * The kind of node expected. Absent in expectations written before the field existed: those are `rusty-kaspad`
   * (the only kind HardKAS verified then).
   */
  readonly kind?: NodeKind | undefined;
  /** Container that must own the endpoint (`rusty-kaspad`); empty for the simulator, which runs in no container. */
  readonly containerName: string;
  /** Pinned image reference the node is started from (`rusty-kaspad`); the package name for the simulator. */
  readonly image: string;
  /** Digest the running container's image must carry (`rusty-kaspad`); empty for the simulator. */
  readonly imageDigest: string;
  /** Network id the node must report via getServerInfo. */
  readonly network: string;
  /** Server version the node must report via getServerInfo. */
  readonly serverVersion: string;
  readonly host: string;
  /** Host port of the wRPC (JSON) endpoint HardKAS talks to. */
  readonly rpcPort: number;
  /**
   * L1-CORE-1 B3: how a `rusty-kaspad` is proven. `container` (the default, and the only mode before this field):
   * container + image digest + endpoint ownership + what the node reports — the managed localnet and the harness's own
   * containers. `endpoint`: what the node reports only (getServerInfo: network, version, synced, not the simulator) — a
   * node HardKAS does not manage (an operator's kaspad, a public testnet node), whose container nothing here can
   * inspect. Every record keeps the mode, so the weaker proof is never read as the stronger one.
   */
  readonly verification?: NodeIdentityVerification | undefined;
  /** The endpoint itself, when it is not `ws://host:rpcPort` (a `wss://` URL with a path). */
  readonly url?: string | undefined;
}

export type NodeIdentityVerification = "container" | "endpoint";

/** Canonical real localnet: one lifecycle, managed by DockerKaspadRunner. */
export const CANONICAL_LOCALNET = {
  profile: "toccata-v2",
  containerName: "hardkas-kaspad-toccata-v2",
  minerContainerName: "hardkas-toccata-miner",
  image: KASPAD_REFERENCE_IMAGE,
  imageDigest: KASPAD_REFERENCE_DIGEST,
  network: "simnet",
  // Derived from the pinned release, so a maintenance bump changes one constant.
  serverVersion: KASPAD_REFERENCE_VERSION.replace(/^v/, ""),
  host: "127.0.0.1",
  ports: { rpc: 16210, borshRpc: 17210, jsonRpc: 18210 },
  dataDir: ".hardkas/kaspad"
} as const;

export const CANONICAL_NODE_EXPECTATION: NodeIdentityExpectation = {
  kind: "rusty-kaspad",
  containerName: CANONICAL_LOCALNET.containerName,
  image: CANONICAL_LOCALNET.image,
  imageDigest: CANONICAL_LOCALNET.imageDigest,
  network: CANONICAL_LOCALNET.network,
  serverVersion: CANONICAL_LOCALNET.serverVersion,
  host: CANONICAL_LOCALNET.host,
  rpcPort: CANONICAL_LOCALNET.ports.jsonRpc
};

/**
 * Suffix the simulator adds to the rusty-kaspad version whose RPC it imitates (`2.1.0-kaspa-simulator`): a valid semver
 * pre-release, so clients that parse the version keep working, and never equal to a release a real node reports.
 */
export const KASPA_SIMULATOR_VERSION_SUFFIX = "-kaspa-simulator";

/** Default wRPC/HTTP port of the simulator: outside every port a Kaspa network or the canonical localnet uses. */
export const KASPA_SIMULATOR_DEFAULT_PORT = 19110;

/** Every host port the canonical localnet publishes: a simulator expectation may never name one of them. */
const CANONICAL_PORTS: ReadonlySet<number> = new Set(Object.values(CANONICAL_LOCALNET.ports));

/**
 * The simulator's own expectation: the network it simulates and its suffixed version, on its own port, with no
 * container. Never used for the canonical localnet (a simulator expectation naming a canonical port is refused).
 */
export const SIMULATOR_NODE_EXPECTATION: NodeIdentityExpectation = {
  kind: "kaspa-simulator",
  containerName: "",
  image: "@hardkas/simulator",
  imageDigest: "",
  network: "simnet",
  serverVersion: `${CANONICAL_LOCALNET.serverVersion}${KASPA_SIMULATOR_VERSION_SUFFIX}`,
  host: "127.0.0.1",
  rpcPort: KASPA_SIMULATOR_DEFAULT_PORT
};

/** The kind an expectation describes (legacy expectations without `kind` are `rusty-kaspad`). */
export function nodeKindOf(expected: NodeIdentityExpectation): NodeKind {
  return expected.kind ?? "rusty-kaspad";
}

/** wRPC (JSON) URL of a node expectation. */
export function nodeRpcUrl(expected: NodeIdentityExpectation = CANONICAL_NODE_EXPECTATION): string {
  return expected.url ?? `ws://${expected.host}:${expected.rpcPort}`;
}

/**
 * L1-CORE-1 B3: the expectation for a rusty-kaspad HardKAS does not manage, proven by what it reports (`endpoint`
 * verification): the reference version of this release, the network it must serve, and its endpoint.
 *
 * INT9-A (I-3a): no image and no digest. Nothing here inspects an image, so the expectation never carries one: a
 * record of this check cannot be read as "the image was compared" (it used to copy the canonical pin into `expected`).
 */
export function endpointNodeExpectation(url: string, network: string): NodeIdentityExpectation {
  let host = "";
  let rpcPort = 0;
  try {
    const u = new URL(url);
    host = u.hostname;
    rpcPort = Number(u.port) || (u.protocol === "wss:" || u.protocol === "https:" ? 443 : 80);
  } catch {
    // an unparsable URL proves nothing: the probe reports it
  }
  return {
    kind: "rusty-kaspad",
    verification: "endpoint",
    containerName: "",
    image: "",
    imageDigest: "",
    network,
    serverVersion: CANONICAL_NODE_EXPECTATION.serverVersion,
    host,
    rpcPort,
    url
  };
}

export interface ObservedContainer {
  readonly name: string;
  readonly id: string;
  readonly running: boolean;
  /** Image id the container was created from (`.Image`). */
  readonly imageId: string;
  /** RepoDigests of that image. */
  readonly repoDigests: readonly string[];
  readonly publishedPorts: readonly { readonly containerPort: string; readonly hostIp: string; readonly hostPort: number }[];
}

export interface ObservedServer {
  readonly url: string;
  readonly networkId: string;
  readonly serverVersion: string;
  /** What the node said about its sync state. Never part of the identity verdict (INT9-A: see `NodeIdentityRecord.sync`). */
  readonly isSynced?: boolean | undefined;
  /** INT9-A: the RPC protocol version and revision the node reported (getServerInfo `rpcApiVersion` / `rpcApiRevision`). */
  readonly rpcApiVersion?: number | undefined;
  readonly rpcApiRevision?: number | undefined;
  /** INT9-A: whether the node said it keeps a UTXO index. */
  readonly hasUtxoIndex?: boolean | undefined;
}

export interface ObservedNode {
  readonly container?: ObservedContainer | undefined;
  readonly server?: ObservedServer | undefined;
  /** Errors from the probes themselves (Docker unreachable, RPC timeout, ...). */
  readonly probeErrors: readonly string[];
}

export const NODE_IDENTITY_SCHEMA = "hardkas.nodeIdentity.v1";

/**
 * Serializable proof of which node a run talked to.
 *
 * `kind` and `observedImageDigest` were added after the first records were written (same schema, additive fields):
 * read stored records with {@link readNodeIdentityRecord}, which re-evaluates them instead of trusting `verified`.
 */
export interface NodeIdentityRecord {
  readonly schema: typeof NODE_IDENTITY_SCHEMA;
  /** What this record attests: `rusty-kaspad` or `kaspa-simulator` when verified against that kind, else `unverified`. */
  readonly kind: NodeIdentityKind;
  readonly verified: boolean;
  readonly problems: readonly string[];
  readonly expected: NodeIdentityExpectation;
  readonly observed: ObservedNode;
  /**
   * The image digest Docker reported for the observed container (the RepoDigest or image id that carries the expected
   * digest, else the first one seen); absent when no container was observed. The expected digest is `expected.imageDigest`.
   */
  readonly observedImageDigest?: string | undefined;
  /**
   * INT9-A (I-3b): what the node said about its sync state, kept apart from the identity verdict. A well-identified
   * node is not a synced node: `verified` never depends on this, and every operation that needs the current chain state
   * asks for it separately ({@link assertNodeSynced}). `unknown` when the node did not say (or did not answer).
   */
  readonly sync: NodeSyncState;
  readonly checkedAt: string;
}

/** INT9-A: what a node reported about its sync state (getServerInfo `isSynced`): never inferred. */
export type NodeSyncState = "synced" | "not-synced" | "unknown";

/** The sync state an observation shows. */
export function nodeSyncStateOf(observed: ObservedNode | undefined): NodeSyncState {
  const s = observed?.server?.isSynced;
  return s === true ? "synced" : s === false ? "not-synced" : "unknown";
}

const LOOPBACK_OR_ANY = new Set(["127.0.0.1", "0.0.0.0", "", "::", "::1", "localhost"]);
const DIGEST = /^sha256:[0-9a-f]{64}$/;

/**
 * The digest of the image the container runs, as Docker reported it: the one that matches `expectedDigest` when one
 * does (through the image id with the containerd store, or a RepoDigest with the classic store), else the first
 * RepoDigest, else the image id. Undefined when no container was observed.
 */
export function observedImageDigest(container: ObservedContainer | undefined, expectedDigest?: string): string | undefined {
  if (!container) return undefined;
  const repo = container.repoDigests.map((d) => d.slice(d.lastIndexOf("@") + 1)).filter((d) => DIGEST.test(d));
  if (expectedDigest) {
    if (container.imageId === expectedDigest) return expectedDigest;
    if (repo.includes(expectedDigest)) return expectedDigest;
  }
  return repo[0] ?? (container.imageId || undefined);
}

/**
 * Compares what is running against what is expected. Pure: every fact comes
 * from `observed` (never the environment), so it can be tested and re-evaluated from a stored record.
 */
export function evaluateNodeIdentity(
  expected: NodeIdentityExpectation,
  observed: ObservedNode,
  checkedAt: Date = new Date()
): NodeIdentityRecord {
  const kind = nodeKindOf(expected);
  const problems: string[] = [...observed.probeErrors];
  const c = observed.container;
  const byEndpoint = kind === "rusty-kaspad" && expected.verification === "endpoint";

  if (byEndpoint) {
    // L1-CORE-1 B3: no container is inspected; what the node reports below is the whole proof (and the record says so)
  } else if (kind === "kaspa-simulator") {
    // The simulator is a process, not a container, and it is never the canonical localnet.
    if (CANONICAL_PORTS.has(expected.rpcPort)) {
      problems.push(`a simulator expectation cannot name the canonical localnet port ${expected.rpcPort}`);
    }
    if (c) problems.push(`a container ('${c.name}') was observed; the simulator runs in none`);
  } else if (!c) {
    problems.push(`container '${expected.containerName}' not found`);
  } else {
    if (c.name !== expected.containerName) {
      problems.push(`container is '${c.name}', expected '${expected.containerName}'`);
    }
    if (!c.running) problems.push(`container '${c.name}' is not running`);

    const digestMatches =
      c.imageId === expected.imageDigest || c.repoDigests.some((d) => d.endsWith(`@${expected.imageDigest}`));
    if (!digestMatches) {
      problems.push(`container image ${c.imageId} does not carry the expected digest ${expected.imageDigest}`);
    }

    const owner = c.publishedPorts.find(
      (p) => p.hostPort === expected.rpcPort && LOOPBACK_OR_ANY.has(p.hostIp) && p.containerPort.startsWith(`${expected.rpcPort}/`)
    );
    if (!owner) {
      problems.push(`container does not publish the RPC endpoint ${expected.host}:${expected.rpcPort}`);
    }
  }

  const s = observed.server;
  if (!s) {
    problems.push(`no node answered at ${nodeRpcUrl(expected)}`);
  } else {
    if (s.networkId !== expected.network) problems.push(`node reports network '${s.networkId}', expected '${expected.network}'`);
    if (s.serverVersion !== expected.serverVersion) {
      problems.push(`node reports version '${s.serverVersion}', expected '${expected.serverVersion}'`);
    }
    if (kind === "rusty-kaspad" && String(s.serverVersion).endsWith(KASPA_SIMULATOR_VERSION_SUFFIX)) {
      problems.push("the node identifies itself as the HardKAS kaspa simulator, not rusty-kaspad");
    }
    // INT9-A (I-3b): "synced" is no longer part of the identity (it was, for endpoint-proven nodes only). It is the
    // record's `sync`, which the operations that need the current chain state require on every node, managed included.
  }

  const verified = problems.length === 0;
  const digest = kind === "rusty-kaspad" ? observedImageDigest(c, expected.imageDigest || undefined) : undefined;
  return {
    schema: NODE_IDENTITY_SCHEMA,
    kind: verified ? kind : "unverified",
    verified,
    problems,
    expected,
    observed,
    ...(digest ? { observedImageDigest: digest } : {}),
    sync: nodeSyncStateOf(observed),
    checkedAt: checkedAt.toISOString()
  };
}

/**
 * Reads a stored identity record (any version of it) by re-evaluating its observation against its expectation: the
 * stored `verified` and `kind` are not trusted, so a record whose observation does not prove the identity (for
 * example one written while an environment variable skipped the container check) reads as `unverified`.
 */
export function readNodeIdentityRecord(raw: unknown): NodeIdentityRecord {
  const r = raw as Partial<NodeIdentityRecord> | null | undefined;
  if (!r || typeof r !== "object" || r.schema !== NODE_IDENTITY_SCHEMA || !r.expected || !r.observed) {
    const err = new Error(`NODE_IDENTITY_RECORD_INVALID: not a ${NODE_IDENTITY_SCHEMA} record`);
    (err as any).code = "NODE_IDENTITY_RECORD_INVALID";
    throw err;
  }
  const observed: ObservedNode = { ...r.observed, probeErrors: Array.isArray(r.observed.probeErrors) ? r.observed.probeErrors : [] };
  const at = typeof r.checkedAt === "string" && !Number.isNaN(Date.parse(r.checkedAt)) ? new Date(r.checkedAt) : new Date(0);
  return evaluateNodeIdentity(r.expected, observed, at);
}

/**
 * The node facts a record of an operation keeps (Silver deploy/spend/covenant records): the kind, the verdict, the
 * observed container and digest, the expected digest and the version the node reported (CA-TX-04: the digest kept is
 * the one observed, no longer the expected one).
 */
export interface NodeIdentitySummary {
  readonly kind: NodeIdentityKind;
  readonly verified: boolean;
  readonly container?: string | undefined;
  /** Digest observed on the container (absent when none was observed). */
  readonly imageDigest?: string | undefined;
  /** The pinned digest the container was checked against; absent for a node proven by its endpoint (nothing was). */
  readonly expectedImageDigest?: string | undefined;
  readonly serverVersion?: string | undefined;
  /** L1-CORE-1 B3: how the node was proven (`container` or `endpoint`); absent in summaries written before it existed. */
  readonly verification?: NodeIdentityVerification | undefined;
  /** L1-CORE-1 B3: the network the node reported (getServerInfo). */
  readonly network?: string | undefined;
  /**
   * INT9-A: the sync state the node reported when the operation proved it (absent in summaries written before it
   * existed: not known, never assumed). A record of a send is written only after the node said it was synced.
   */
  readonly sync?: NodeSyncState | undefined;
  /** INT9-A: the endpoint that was asked (credentials redacted); absent in summaries written before it existed. */
  readonly endpoint?: string | undefined;
}

export function summarizeNodeIdentity(record: NodeIdentityRecord): NodeIdentitySummary {
  const byEndpoint = nodeKindOf(record.expected) === "rusty-kaspad" && record.expected.verification === "endpoint";
  const endpoint = record.observed.server?.url ?? nodeRpcUrl(record.expected);
  return {
    kind: record.kind,
    verified: record.verified,
    ...(record.observed.container?.name ? { container: record.observed.container.name } : {}),
    ...(record.observedImageDigest ? { imageDigest: record.observedImageDigest } : {}),
    // INT9-A (I-3a): the pin is kept only when an image was compared against it (a container check), never invented
    ...(!byEndpoint && record.expected.imageDigest ? { expectedImageDigest: record.expected.imageDigest } : {}),
    ...(record.observed.server?.serverVersion !== undefined ? { serverVersion: record.observed.server.serverVersion } : {}),
    ...(nodeKindOf(record.expected) === "rusty-kaspad" ? { verification: record.expected.verification ?? "container" } : {}),
    ...(record.observed.server?.networkId !== undefined ? { network: record.observed.server.networkId } : {}),
    sync: record.sync ?? nodeSyncStateOf(record.observed),
    ...(endpoint ? { endpoint: redactUrlCredentials(endpoint) } : {})
  };
}

/**
 * INT9-A (I-3b): an operation that needs the current chain state (plan, send, deploy, spend, covenant genesis and
 * transition, wait) runs only on a node that says it is synced — the managed localnet included. A node that is well
 * identified but not synced, or that does not say, is refused with NODE_NOT_SYNCED (typed, before any key is used or
 * anything is sent). Offline and diagnostic paths (doctor, rpc info, `artifact verify` offline) never call this.
 */
export function assertNodeSynced(record: NodeIdentityRecord, operation = "this operation"): NodeIdentityRecord {
  const sync = record.sync ?? nodeSyncStateOf(record.observed);
  if (sync === "synced") return record;
  const url = record.observed.server?.url ?? nodeRpcUrl(record.expected);
  const err = new Error(
    `NODE_NOT_SYNCED: the node at ${redactUrlCredentials(url)} ${sync === "not-synced" ? "reports it is not synced" : "did not say whether it is synced"}; ` +
      `${operation} needs the current chain state and refuses it (a well-identified node is not a synced node). ` +
      `Let it sync (a local simnet/devnet node with no peers needs recent blocks: mine some), then retry. Nothing was signed or sent.`
  );
  (err as any).code = "NODE_NOT_SYNCED";
  (err as any).sync = sync;
  (err as any).identity = record;
  throw err;
}

function execFileText(file: string, args: readonly string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()));
      else resolve(String(stdout));
    });
  });
}

/**
 * Reads a container's identity-relevant facts from Docker. Returns undefined
 * when no container has that name; throws when Docker itself is unreachable.
 */
export async function inspectNodeContainer(containerName: string): Promise<ObservedContainer | undefined> {
  let raw: string;
  try {
    raw = await execFileText("docker", ["container", "inspect", containerName]);
  } catch (e: any) {
    if (/no such (container|object)/i.test(String(e?.message))) return undefined;
    throw e;
  }
  const info = JSON.parse(raw)[0];
  if (!info) return undefined;

  let repoDigests: string[] = [];
  try {
    const image = JSON.parse(await execFileText("docker", ["image", "inspect", info.Image]))[0];
    repoDigests = image?.RepoDigests ?? [];
  } catch {
    // Image metadata unavailable: the digest check then relies on the image id alone.
  }

  // Only the ports Docker actually published (NetworkSettings.Ports): a binding that is merely configured
  // (HostConfig.PortBindings) proves no ownership of the endpoint.
  const ports: ObservedContainer["publishedPorts"][number][] = [];
  const seen = new Set<string>();
  for (const [containerPort, bindings] of Object.entries<any>(info.NetworkSettings?.Ports ?? {})) {
    for (const b of bindings ?? []) {
      if (!b || !b.HostPort) continue;
      const hostPort = Number(b.HostPort);
      const hostIp = String(b.HostIp ?? "");
      const key = `${containerPort}->${hostIp}:${hostPort}`;
      if (!seen.has(key)) {
        seen.add(key);
        ports.push({ containerPort, hostIp, hostPort });
      }
    }
  }

  return {
    name: String(info.Name ?? "").replace(/^\//, ""),
    id: String(info.Id ?? ""),
    running: !!info.State?.Running,
    imageId: String(info.Image ?? ""),
    repoDigests,
    publishedPorts: ports
  };
}

/**
 * Probes Docker and the node, then evaluates. The RPC query is injected so
 * this package needs no RPC client; @hardkas/node-runner wires a real one.
 * A simulator expectation is checked without Docker (the simulator runs in no container).
 */
export async function probeNodeIdentity(input: {
  readonly expected?: NodeIdentityExpectation | undefined;
  readonly getServerInfo: (url: string) => Promise<{
    networkId: string;
    serverVersion: string;
    isSynced?: boolean;
    rpcApiVersion?: number;
    rpcApiRevision?: number;
    hasUtxoIndex?: boolean;
  }>;
}): Promise<NodeIdentityRecord> {
  const expected = input.expected ?? CANONICAL_NODE_EXPECTATION;
  const probeErrors: string[] = [];
  const url = nodeRpcUrl(expected);

  let container: ObservedContainer | undefined;
  if (nodeKindOf(expected) === "rusty-kaspad" && expected.verification !== "endpoint") {
    try {
      container = await inspectNodeContainer(expected.containerName);
    } catch (e: any) {
      probeErrors.push(`docker unavailable: ${e?.message ?? e}`);
    }
  }

  let server: ObservedServer | undefined;
  try {
    const info = await input.getServerInfo(url);
    server = {
      url,
      networkId: String(info.networkId),
      serverVersion: String(info.serverVersion),
      isSynced: info.isSynced,
      ...(typeof info.rpcApiVersion === "number" ? { rpcApiVersion: info.rpcApiVersion } : {}),
      ...(typeof info.rpcApiRevision === "number" ? { rpcApiRevision: info.rpcApiRevision } : {}),
      ...(typeof info.hasUtxoIndex === "boolean" ? { hasUtxoIndex: info.hasUtxoIndex } : {})
    };
  } catch (e: any) {
    probeErrors.push(`rpc ${url}: ${e?.message ?? e}`);
  }

  return evaluateNodeIdentity(expected, { container, server, probeErrors });
}

/** Throws NODE_IDENTITY_UNVERIFIED unless the record is verified. */
export function assertNodeIdentityVerified(record: NodeIdentityRecord): NodeIdentityRecord {
  if (record.verified) return record;
  const kind = nodeKindOf(record.expected);
  const what =
    kind === "kaspa-simulator"
      ? `the HardKAS kaspa simulator (${record.expected.serverVersion})`
      : record.expected.verification === "endpoint"
        ? `rusty-kaspad ${record.expected.serverVersion} serving ${record.expected.network} (proven by its own report; no container or image is inspected)`
        : `${record.expected.containerName} (rusty-kaspad ${record.expected.serverVersion}, ${record.expected.imageDigest})`;
  const err = new Error(
    `NODE_IDENTITY_UNVERIFIED: the node at ${nodeRpcUrl(record.expected)} is not the expected ${what}:\n  - ` +
      record.problems.join("\n  - ")
  );
  (err as any).code = "NODE_IDENTITY_UNVERIFIED";
  (err as any).identity = record;
  throw err;
}

/**
 * Like {@link assertNodeIdentityVerified}, and the verified node must be of `kind` (a real rusty-kaspad unless stated):
 * what every path that treats the node as evidence of node behaviour uses (Silver records, capabilities, the harness).
 */
export function assertNodeKind(record: NodeIdentityRecord, kind: NodeKind = "rusty-kaspad"): NodeIdentityRecord {
  assertNodeIdentityVerified(record);
  if (record.kind === kind) return record;
  const err = new Error(`NODE_IDENTITY_UNVERIFIED: the node at ${nodeRpcUrl(record.expected)} is a verified ${record.kind}, not a ${kind}`);
  (err as any).code = "NODE_IDENTITY_UNVERIFIED";
  (err as any).identity = record;
  throw err;
}

import { execFile } from "node:child_process";
import { KASPAD_REFERENCE_DIGEST, KASPAD_REFERENCE_IMAGE, KASPAD_REFERENCE_VERSION } from "./node-images.js";

/**
 * The node HardKAS treats as real localnet, and how to prove a running node is it.
 *
 * The container name is only an operational identifier (how HardKAS finds and
 * manages the node). Trust comes from the combination checked by
 * {@link evaluateNodeIdentity}: the container's image digest, the container
 * owning the RPC endpoint, and the network and version the node itself reports.
 * A container that merely carries the canonical name is not accepted.
 */
export interface NodeIdentityExpectation {
  readonly containerName: string;
  /** Pinned image reference the node is started from. */
  readonly image: string;
  /** Digest the running container's image must carry. */
  readonly imageDigest: string;
  /** Network id the node must report via getServerInfo. */
  readonly network: string;
  /** Server version the node must report via getServerInfo. */
  readonly serverVersion: string;
  readonly host: string;
  /** Host port of the wRPC (JSON) endpoint HardKAS talks to. */
  readonly rpcPort: number;
}

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
  containerName: CANONICAL_LOCALNET.containerName,
  image: CANONICAL_LOCALNET.image,
  imageDigest: CANONICAL_LOCALNET.imageDigest,
  network: CANONICAL_LOCALNET.network,
  serverVersion: CANONICAL_LOCALNET.serverVersion,
  host: CANONICAL_LOCALNET.host,
  rpcPort: CANONICAL_LOCALNET.ports.jsonRpc
};

/** wRPC (JSON) URL of a node expectation. */
export function nodeRpcUrl(expected: NodeIdentityExpectation = CANONICAL_NODE_EXPECTATION): string {
  return `ws://${expected.host}:${expected.rpcPort}`;
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
  readonly isSynced?: boolean | undefined;
}

export interface ObservedNode {
  readonly container?: ObservedContainer | undefined;
  readonly server?: ObservedServer | undefined;
  /** Errors from the probes themselves (Docker unreachable, RPC timeout, ...). */
  readonly probeErrors: readonly string[];
}

export const NODE_IDENTITY_SCHEMA = "hardkas.nodeIdentity.v1";

/** Serializable proof of which node a run talked to. */
export interface NodeIdentityRecord {
  readonly schema: typeof NODE_IDENTITY_SCHEMA;
  readonly verified: boolean;
  readonly problems: readonly string[];
  readonly expected: NodeIdentityExpectation;
  readonly observed: ObservedNode;
  readonly checkedAt: string;
}

const LOOPBACK_OR_ANY = new Set(["127.0.0.1", "0.0.0.0", "", "::", "::1", "localhost"]);

/**
 * Compares what is running against what is expected. Pure: every fact comes
 * from `observed`, so it can be tested and re-evaluated from a stored record.
 */
export function evaluateNodeIdentity(
  expected: NodeIdentityExpectation,
  observed: ObservedNode,
  checkedAt: Date = new Date()
): NodeIdentityRecord {
  const problems: string[] = [...observed.probeErrors];
  const c = observed.container;

  if (!c) {
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
  }

  return {
    schema: NODE_IDENTITY_SCHEMA,
    verified: problems.length === 0,
    problems,
    expected,
    observed,
    checkedAt: checkedAt.toISOString()
  };
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

  const ports: ObservedContainer["publishedPorts"][number][] = [];
  for (const [containerPort, bindings] of Object.entries<any>(info.NetworkSettings?.Ports ?? {})) {
    for (const b of bindings ?? []) {
      ports.push({ containerPort, hostIp: String(b.HostIp ?? ""), hostPort: Number(b.HostPort) });
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
 */
export async function probeNodeIdentity(input: {
  readonly expected?: NodeIdentityExpectation | undefined;
  readonly getServerInfo: (url: string) => Promise<{ networkId: string; serverVersion: string; isSynced?: boolean }>;
}): Promise<NodeIdentityRecord> {
  const expected = input.expected ?? CANONICAL_NODE_EXPECTATION;
  const probeErrors: string[] = [];
  const url = nodeRpcUrl(expected);

  let container: ObservedContainer | undefined;
  try {
    container = await inspectNodeContainer(expected.containerName);
  } catch (e: any) {
    probeErrors.push(`docker unavailable: ${e?.message ?? e}`);
  }

  let server: ObservedServer | undefined;
  try {
    const info = await input.getServerInfo(url);
    server = { url, networkId: String(info.networkId), serverVersion: String(info.serverVersion), isSynced: info.isSynced };
  } catch (e: any) {
    probeErrors.push(`rpc ${url}: ${e?.message ?? e}`);
  }

  return evaluateNodeIdentity(expected, { container, server, probeErrors });
}

/** Throws NODE_IDENTITY_UNVERIFIED unless the record is verified. */
export function assertNodeIdentityVerified(record: NodeIdentityRecord): NodeIdentityRecord {
  if (record.verified) return record;
  const err = new Error(
    `NODE_IDENTITY_UNVERIFIED: the node at ${nodeRpcUrl(record.expected)} is not the expected ` +
      `${record.expected.containerName} (rusty-kaspad ${record.expected.serverVersion}, ${record.expected.imageDigest}):\n  - ` +
      record.problems.join("\n  - ")
  );
  (err as any).code = "NODE_IDENTITY_UNVERIFIED";
  (err as any).identity = record;
  throw err;
}

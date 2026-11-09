// INT9-A (I-1, I-3) · the canonical, typed identity of the Kaspa network a run, a record or a check is about.
//
// One representation, kept apart on purpose:
//  - the FAMILY (simulated | simnet | devnet | testnet | mainnet) and the concrete ID (`testnet-10`);
//  - the id the NODE REPORTED (getServerInfo), the ENDPOINT asked and the NODE TYPE that answered
//    (rusty-kaspad | simulator | unverified);
//  - the identity EVIDENCE: a container whose image digest was compared with the pin, or only what the endpoint
//    reported (server version, RPC protocol version/revision) — never a digest nobody compared;
//  - the SYNC state, which is not identity: a well-identified node is not a synced node;
//  - the TRUST level that follows from the evidence.
// Rules this module enforces for its callers:
//  - simulated is never real: a simulator answer is `nodeType: "simulator"`, trust `simulator`, never a node;
//  - a devnet record is never read as simnet (or the other way round): families and ids are compared exactly;
//  - an address prefix never proves a network: every testnet shares `kaspatest`, and a prefix is a label anyone can
//    write. `addressPrefixNetworkHint` only says which family a prefix is FOR, to catch incoherent records.
import { networkTypeOf } from "./mainnet-policy.js";
import {
  nodeKindOf,
  nodeRpcUrl,
  nodeSyncStateOf,
  type NodeIdentityRecord,
  type NodeIdentitySummary,
  type NodeSyncState
} from "./node-identity.js";
import { redactUrlCredentials } from "./security.js";

export const NETWORK_IDENTITY_SCHEMA = "hardkas.networkIdentity.v1";

export type NetworkFamily = "simulated" | "simnet" | "devnet" | "testnet" | "mainnet";
export const NETWORK_FAMILIES: readonly NetworkFamily[] = ["simulated", "simnet", "devnet", "testnet", "mainnet"];

export type NetworkNodeType = "rusty-kaspad" | "simulator" | "unverified";

/** `not-checked`: no node was asked (an offline verification), which says nothing about the network. */
export type NetworkSyncState = NodeSyncState | "not-checked";

/**
 * How much the identity can be trusted, from the evidence alone:
 *  - `node-container`: a rusty-kaspad whose container, image digest and endpoint ownership were checked (the managed
 *    localnet, the harness's own containers);
 *  - `node-endpoint`: a rusty-kaspad proven only by what its endpoint reported (network, version, not the simulator);
 *  - `simulator`: the HardKAS simulator — never a node, never consensus;
 *  - `unverified`: something answered and did not prove the expected identity;
 *  - `offline`: nobody was asked.
 */
export type NetworkTrustLevel = "node-container" | "node-endpoint" | "simulator" | "unverified" | "offline";

export type NetworkIdentityEvidence =
  | {
      readonly kind: "container";
      readonly containerName?: string | undefined;
      readonly expectedImage?: string | undefined;
      /** The pin the image was compared against (only ever set when a container's image was compared). */
      readonly expectedImageDigest?: string | undefined;
      readonly observedImageDigest?: string | undefined;
      readonly serverVersion?: string | undefined;
    }
  | {
      readonly kind: "endpoint";
      readonly serverVersion?: string | undefined;
      readonly rpcApiVersion?: number | undefined;
      readonly rpcApiRevision?: number | undefined;
    }
  | { readonly kind: "simulator"; readonly serverVersion?: string | undefined }
  | { readonly kind: "none"; readonly reason: string };

export interface NetworkIdentity {
  readonly schema: typeof NETWORK_IDENTITY_SCHEMA;
  readonly family: NetworkFamily;
  /** The concrete network id expected (`simnet`, `devnet`, `testnet-10`, `mainnet`, `simulated`). */
  readonly networkId: string;
  /** The network id the node reported, when one was asked. */
  readonly observedNetworkId?: string | undefined;
  /** The endpoint that was asked (credentials redacted). */
  readonly endpoint?: string | undefined;
  readonly nodeType: NetworkNodeType;
  readonly evidence: NetworkIdentityEvidence;
  readonly sync: NetworkSyncState;
  readonly trust: NetworkTrustLevel;
  /** Why the identity is not proven (empty when it is). */
  readonly problems: readonly string[];
  readonly checkedAt?: string | undefined;
}

/**
 * The family of a network id, by its exact spelling: `simulated`; `simnet`/`simnet-<n>`; `devnet`/`devnet-<n>`;
 * `testnet-<n>` (a bare `testnet` names no concrete network and is not accepted); `mainnet`/`mainnet-<n>`. Undefined for
 * anything else (an L2 id such as `igra`, a config alias, a typo): such a name is not a Kaspa L1 network.
 */
export function networkFamilyOf(networkId: unknown): NetworkFamily | undefined {
  if (typeof networkId !== "string") return undefined;
  const n = networkId.trim();
  if (n === "simulated") return "simulated";
  if (n !== n.toLowerCase() || n.startsWith("kaspa")) return undefined;
  if (n === "testnet") return undefined;
  return networkTypeOf(n);
}

/** A concrete Kaspa L1 network id (see {@link networkFamilyOf}). */
export function isKaspaL1NetworkId(networkId: unknown): networkId is string {
  return networkFamilyOf(networkId) !== undefined;
}

/** Throws NETWORK_ID_INVALID unless `networkId` is a concrete Kaspa L1 network id; returns its family. */
export function parseNetworkId(networkId: unknown): { readonly networkId: string; readonly family: NetworkFamily } {
  const family = networkFamilyOf(networkId);
  if (!family) {
    const err = new Error(
      `NETWORK_ID_INVALID: '${String(networkId)}' is not a Kaspa L1 network id (simulated, simnet, devnet, testnet-<n>, mainnet)`
    );
    (err as any).code = "NETWORK_ID_INVALID";
    throw err;
  }
  return { networkId: String(networkId).trim(), family };
}

/**
 * The family an address prefix is FOR (`kaspasim:` simnet, `kaspadev:` devnet, `kaspatest:` any testnet, `kaspa:`
 * mainnet). Only a coherence hint: a prefix never proves which network a record or a node is (every testnet shares
 * `kaspatest`, and nothing stops a record from carrying any prefix). The simulator uses simnet addresses.
 */
export function addressPrefixNetworkHint(address: unknown): Exclude<NetworkFamily, "simulated"> | undefined {
  if (typeof address !== "string") return undefined;
  const prefix = address.slice(0, Math.max(0, address.indexOf(":")));
  switch (prefix) {
    case "kaspasim":
      return "simnet";
    case "kaspadev":
      return "devnet";
    case "kaspatest":
      return "testnet";
    case "kaspa":
      return "mainnet";
    default:
      return undefined;
  }
}

/** Whether an address's prefix is the one `networkId`'s family uses (simulated uses simnet addresses). */
export function addressPrefixMatchesNetwork(address: unknown, networkId: unknown): boolean {
  const family = networkFamilyOf(networkId);
  const hint = addressPrefixNetworkHint(address);
  if (!family || !hint) return false;
  return family === "simulated" ? hint === "simnet" : hint === family;
}

/** The identity of a network nobody was asked about (offline): family and id only, no node, no sync, no trust. */
export function offlineNetworkIdentity(networkId: string, reason = "no node was asked (offline verification)"): NetworkIdentity {
  const { family } = parseNetworkId(networkId);
  return {
    schema: NETWORK_IDENTITY_SCHEMA,
    family,
    networkId,
    nodeType: "unverified",
    evidence: { kind: "none", reason },
    sync: "not-checked",
    trust: "offline",
    problems: []
  };
}

/**
 * The network identity a node identity check establishes for `networkId` (default: the network the check expected).
 * Nothing is inferred: the node type and trust follow from the verdict and the kind of check; the sync state is what
 * the node said; a digest appears only when a container's image was compared.
 */
export function networkIdentityOf(record: NodeIdentityRecord, networkId: string = record.expected.network): NetworkIdentity {
  const { family } = parseNetworkId(networkId);
  const kind = nodeKindOf(record.expected);
  const server = record.observed.server;
  const endpoint = redactUrlCredentials(server?.url ?? nodeRpcUrl(record.expected));
  const byEndpoint = kind === "rusty-kaspad" && record.expected.verification === "endpoint";
  const problems = [...record.problems];
  if (record.expected.network !== networkId) {
    problems.push(`the node was checked as ${record.expected.network}, not ${networkId}`);
  }
  const verified = record.verified && problems.length === record.problems.length;
  const nodeType: NetworkNodeType = !verified ? "unverified" : kind === "kaspa-simulator" ? "simulator" : "rusty-kaspad";
  let evidence: NetworkIdentityEvidence;
  if (kind === "kaspa-simulator") {
    evidence = { kind: "simulator", ...(server?.serverVersion ? { serverVersion: server.serverVersion } : {}) };
  } else if (byEndpoint) {
    evidence = {
      kind: "endpoint",
      ...(server?.serverVersion ? { serverVersion: server.serverVersion } : {}),
      ...(server?.rpcApiVersion !== undefined ? { rpcApiVersion: server.rpcApiVersion } : {}),
      ...(server?.rpcApiRevision !== undefined ? { rpcApiRevision: server.rpcApiRevision } : {})
    };
  } else {
    evidence = {
      kind: "container",
      ...(record.expected.containerName ? { containerName: record.expected.containerName } : {}),
      ...(record.expected.image ? { expectedImage: record.expected.image } : {}),
      ...(record.expected.imageDigest ? { expectedImageDigest: record.expected.imageDigest } : {}),
      ...(record.observedImageDigest ? { observedImageDigest: record.observedImageDigest } : {}),
      ...(server?.serverVersion ? { serverVersion: server.serverVersion } : {})
    };
  }
  const trust: NetworkTrustLevel = !verified
    ? "unverified"
    : nodeType === "simulator"
      ? "simulator"
      : byEndpoint
        ? "node-endpoint"
        : "node-container";
  return {
    schema: NETWORK_IDENTITY_SCHEMA,
    family,
    networkId,
    ...(server?.networkId !== undefined ? { observedNetworkId: server.networkId } : {}),
    endpoint,
    nodeType,
    evidence,
    sync: record.sync ?? nodeSyncStateOf(record.observed),
    trust,
    problems,
    checkedAt: record.checkedAt
  };
}

/**
 * The network identity a stored record's node summary attests (offline: nothing is asked). A summary written before
 * a field existed keeps it absent — a legacy container summary without `verification` is a container check, a summary
 * without `sync` has an `unknown` sync state — and nothing historical is made up.
 */
export function networkIdentityOfSummary(networkId: string, summary: NodeIdentitySummary | undefined): NetworkIdentity {
  const { family } = parseNetworkId(networkId);
  if (!summary) return offlineNetworkIdentity(networkId, "the record names no node");
  const problems: string[] = [];
  if (summary.verified !== true) problems.push("the record's node was not verified");
  if (summary.kind !== undefined && summary.kind !== "rusty-kaspad" && summary.kind !== "kaspa-simulator") {
    problems.push(`the record's node is '${summary.kind}'`);
  }
  if (summary.network !== undefined && summary.network !== networkId) {
    problems.push(`the record's node reported ${summary.network}, the record says ${networkId}`);
  }
  const simulator = summary.kind === "kaspa-simulator";
  const byEndpoint = !simulator && summary.verification === "endpoint";
  const evidence: NetworkIdentityEvidence = simulator
    ? { kind: "simulator", ...(summary.serverVersion ? { serverVersion: summary.serverVersion } : {}) }
    : byEndpoint
      ? { kind: "endpoint", ...(summary.serverVersion ? { serverVersion: summary.serverVersion } : {}) }
      : {
          kind: "container",
          ...(summary.container ? { containerName: summary.container } : {}),
          ...(summary.expectedImageDigest ? { expectedImageDigest: summary.expectedImageDigest } : {}),
          ...(summary.imageDigest ? { observedImageDigest: summary.imageDigest } : {}),
          ...(summary.serverVersion ? { serverVersion: summary.serverVersion } : {})
        };
  const verified = problems.length === 0;
  return {
    schema: NETWORK_IDENTITY_SCHEMA,
    family,
    networkId,
    ...(summary.network !== undefined ? { observedNetworkId: summary.network } : {}),
    ...(summary.endpoint ? { endpoint: summary.endpoint } : {}),
    nodeType: !verified ? "unverified" : simulator ? "simulator" : "rusty-kaspad",
    evidence,
    sync: summary.sync ?? "unknown",
    trust: !verified ? "unverified" : simulator ? "simulator" : byEndpoint ? "node-endpoint" : "node-container",
    problems
  };
}

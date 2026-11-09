import {
  CANONICAL_NODE_EXPECTATION,
  assertNodeIdentityVerified,
  endpointNodeExpectation,
  probeNodeIdentity,
  type NodeIdentityExpectation,
  type NodeIdentityRecord,
  assertMainnetConnectionsDisabled,
  mainnetConnectionDisabledError,
  redactUrlCredentials
} from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

type ServerReport = {
  networkId: string;
  serverVersion: string;
  isSynced?: boolean;
  rpcApiVersion?: number;
  rpcApiRevision?: number;
  hasUtxoIndex?: boolean;
};

async function getServerInfo(url: string): Promise<ServerReport> {
  const client = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 10000 });
  try {
    // INT9-A: the node's own getServerInfo answer (network, version, RPC protocol version/revision, UTXO index, sync)
    const info: any = await client.getServerInfo();
    return {
      networkId: info.networkId,
      serverVersion: info.serverVersion,
      isSynced: info.isSynced,
      ...(typeof info.rpcApiVersion === "number" ? { rpcApiVersion: info.rpcApiVersion } : {}),
      ...(typeof info.rpcApiRevision === "number" ? { rpcApiRevision: info.rpcApiRevision } : {}),
      ...(typeof info.hasUtxoIndex === "boolean" ? { hasUtxoIndex: info.hasUtxoIndex } : {})
    };
  } finally {
    await (client as any).close?.().catch?.(() => {});
  }
}

/**
 * Proves which node HardKAS is talking to: container identity + image digest +
 * endpoint ownership + the network/version the node reports. Defaults to the
 * canonical real localnet. Never throws for a mismatch; see `verified`.
 * INT9-A: the record's `sync` says what the node reported about its sync state, apart from the identity verdict.
 */
export function verifyNodeIdentity(options: { expected?: NodeIdentityExpectation } = {}): Promise<NodeIdentityRecord> {
  return probeNodeIdentity({ expected: options.expected ?? CANONICAL_NODE_EXPECTATION, getServerInfo });
}

/**
 * MAINNET TOTAL LOCKDOWN (RC2 oracle O4): a probe whose node answered mainnet (the transport refused it after that one
 * identity answer) fails with THAT code, MAINNET_CONNECTION_DISABLED, never the generic NODE_IDENTITY_UNVERIFIED with
 * the mainnet refusal buried in its text.
 */
function refuseMainnetAnswer(record: NodeIdentityRecord, url: string): NodeIdentityRecord {
  if (record.problems.some((p) => /MAINNET_CONNECTION_DISABLED/.test(p))) {
    throw mainnetConnectionDisabledError(`the node at ${redactUrlCredentials(url)} says it serves mainnet`, { endpoint: redactUrlCredentials(url) }, "identity-only");
  }
  return record;
}

/** verifyNodeIdentity, failing closed (NODE_IDENTITY_UNVERIFIED) on any mismatch. */
export async function requireNodeIdentity(options: { expected?: NodeIdentityExpectation } = {}): Promise<NodeIdentityRecord> {
  const record = await verifyNodeIdentity(options);
  return assertNodeIdentityVerified(refuseMainnetAnswer(record, record.observed.server?.url ?? "the canonical localnet"));
}

/**
 * L1-CORE-1 B3: a rusty-kaspad HardKAS does not manage, proven by what it reports at `url` (getServerInfo: the network
 * it must serve, this release's reference version, not the simulator). No container is inspected; the record says
 * `verification: "endpoint"`. Fails closed (NODE_IDENTITY_UNVERIFIED).
 * INT9-A (I-3b): being synced is no longer part of this identity; an operation that needs the current chain state
 * requires it separately (`assertNodeSynced`), on this node and on the managed localnet alike.
 */
export async function requireEndpointIdentity(url: string, network: string): Promise<NodeIdentityRecord> {
  return assertNodeIdentityVerified(refuseMainnetAnswer(await verifyEndpointIdentity(url, network), url));
}

/**
 * INT9-C5: the endpoint check of {@link requireEndpointIdentity}, never throwing for a mismatch (see `verified`): what
 * `hardkas silver doctor` and `hardkas capabilities` report for a node HardKAS does not manage.
 */
export async function verifyEndpointIdentity(url: string, network: string): Promise<NodeIdentityRecord> {
  // MAINNET TOTAL LOCKDOWN: a node used as mainnet is never probed (MAINNET_CONNECTION_DISABLED, nothing contacted);
  // a node used as another network that answers mainnet is refused by the transport after its one identity answer
  assertMainnetConnectionsDisabled([network], `the identity of the node at ${redactUrlCredentials(url)}`);
  return probeNodeIdentity({ expected: endpointNodeExpectation(url, network), getServerInfo });
}

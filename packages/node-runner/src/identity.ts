import {
  CANONICAL_NODE_EXPECTATION,
  assertNodeIdentityVerified,
  probeNodeIdentity,
  type NodeIdentityExpectation,
  type NodeIdentityRecord
} from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

async function getServerInfo(url: string): Promise<{ networkId: string; serverVersion: string; isSynced?: boolean }> {
  const client = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 10000 });
  try {
    const info: any = await client.getServerInfo();
    return { networkId: info.networkId, serverVersion: info.serverVersion, isSynced: info.isSynced };
  } finally {
    await (client as any).close?.().catch?.(() => {});
  }
}

/**
 * Proves which node HardKAS is talking to: container identity + image digest +
 * endpoint ownership + the network/version the node reports. Defaults to the
 * canonical real localnet. Never throws for a mismatch; see `verified`.
 */
export function verifyNodeIdentity(options: { expected?: NodeIdentityExpectation } = {}): Promise<NodeIdentityRecord> {
  return probeNodeIdentity({ expected: options.expected ?? CANONICAL_NODE_EXPECTATION, getServerInfo });
}

/** verifyNodeIdentity, failing closed (NODE_IDENTITY_UNVERIFIED) on any mismatch. */
export async function requireNodeIdentity(options: { expected?: NodeIdentityExpectation } = {}): Promise<NodeIdentityRecord> {
  return assertNodeIdentityVerified(await verifyNodeIdentity(options));
}

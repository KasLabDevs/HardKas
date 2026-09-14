import { CANONICAL_LOCALNET, nodeRpcUrl, type NodeIdentityRecord } from "@hardkas/core";
import { verifyNodeIdentity } from "@hardkas/node-runner";

/**
 * The node a Docker-real scenario may observe, stop or restart: the canonical
 * localnet, and only after it proves its identity. Never "the first container
 * in `docker ps`" and never whatever the consumer's CLI happens to report.
 */
export async function resolveCanonicalNode(): Promise<{
  containerName: string;
  /** host:port form used by the consumer scripts. */
  rpcEndpoint: string;
  identity: NodeIdentityRecord;
}> {
  const identity = await verifyNodeIdentity();
  if (!identity.verified) {
    throw new Error(
      `NODE_IDENTITY_UNVERIFIED: refusing to run a Docker-real scenario against an unproven node:\n  - ` +
        identity.problems.join("\n  - ")
    );
  }
  return {
    containerName: CANONICAL_LOCALNET.containerName,
    rpcEndpoint: nodeRpcUrl().replace("ws://", ""),
    identity
  };
}

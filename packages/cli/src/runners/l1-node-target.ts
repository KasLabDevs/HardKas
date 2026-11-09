// L1-CORE-1 B3 · where an L1 command that sends a Toccata (v1) transaction runs — Silver deploy/spend/covenants and the
// escrow rescue — and how its node is proven. They ran on the canonical simnet localnet only (nodeRpcUrl(), container +
// image digest); now, like `tx *`:
//  - the network is the caller's (mainnet refused here too, whatever the caller checked before); a public network
//    (testnet-<n>) only behind the payments' own opt-in: experimental: true and network.allowPublic: true in the
//    workspace config;
//  - the endpoint is `--url` (validated like every endpoint), else the one the workspace declares for that network, by
//    the shared endpoint authority (a public network that declares none is NETWORK_ENDPOINT_REQUIRED: nothing contacted);
//  - `managed`: the endpoint is the canonical localnet's — the node HardKAS manages, proven by container + image digest
//    + endpoint ownership, as before. Any other node is proven by what it reports (getServerInfo: network, this
//    release's version, not the simulator), and its record says `verification: "endpoint"`.
// INT9-A (I-3b): identity and sync are separate. Every one of these commands needs the current chain state, so after
// the identity the node must also say it is synced — the managed localnet included (it was never asked) — or the
// command stops with NODE_NOT_SYNCED before any key is used or anything is sent.
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

export interface L1NodeTarget {
  readonly network: string;
  readonly rpcUrl: string;
  readonly managed: boolean;
}

const norm = (u: string) => u.trim().replace(/\/+$/, "").replace("://localhost:", "://127.0.0.1:");

export async function resolveL1NodeTarget(network: string, url: string | undefined): Promise<L1NodeTarget> {
  const { loadHardkasConfig, resolveNodeEndpoint, isPublicKaspaNetwork } = await import("@hardkas/config");
  const { nodeRpcUrl, isMainnetNetworkId, declaredNetworkIdOf, MAINNET_CONNECTION_DISABLED, mainnetConnectionDisabledMessage } = await import("@hardkas/core");
  // INT9-A: never mainnet, whatever the caller checked (defence in depth: nothing is loaded or contacted). MAINNET TOTAL
  // LOCKDOWN: the command never gets as far as signing — its first step is the node, so the refusal is the connection
  // one (MAINNET_CONNECTION_DISABLED; it was MAINNET_TRANSACTIONS_DISABLED), for the name asked and what it declares
  const mainnetRefusal = () =>
    new HardkasCliError(MAINNET_CONNECTION_DISABLED, mainnetConnectionDisabledMessage(`the node of ${network}; nothing was loaded, signed or sent`), {
      exitCode: HardkasExitCode.POLICY_DENIED
    });
  if (isMainnetNetworkId(network)) throw mainnetRefusal();
  const { config } = await loadHardkasConfig({ workspaceRoot: process.cwd() });
  if (isMainnetNetworkId(declaredNetworkIdOf(config, network))) throw mainnetRefusal();
  if (isPublicKaspaNetwork(network) && !((config as any).network?.allowPublic === true && (config as any).experimental === true)) {
    throw new HardkasCliError(
      "PUBLIC_NETWORK_BLOCKED",
      `${network} needs the same opt-in as payments there: experimental: true and network.allowPublic: true in hardkas.config.ts. Nothing was done.`,
      { exitCode: HardkasExitCode.POLICY_DENIED }
    );
  }
  let rpcUrl: string;
  try {
    // INT9-A: an explicit --url goes through the same authority (and its validation) as a declared one
    rpcUrl = resolveNodeEndpoint({ config, networkId: network, ...(url !== undefined ? { explicitUrl: url } : {}) }).url;
  } catch (e: unknown) {
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    const code = String(err?.code ?? "NETWORK_ENDPOINT_REQUIRED");
    throw new HardkasCliError(code, String(err?.message ?? e), {
      exitCode: code === MAINNET_CONNECTION_DISABLED ? HardkasExitCode.POLICY_DENIED : HardkasExitCode.USAGE_ERROR
    });
  }
  return { network, rpcUrl, managed: network === "simnet" && norm(rpcUrl) === norm(nodeRpcUrl()) };
}

/**
 * The target's node after it proves its identity (container + digest when managed, its own report otherwise) and says
 * it is synced (INT9-A, every node), and a client for it.
 */
export async function proveL1Node(target: L1NodeTarget, operation = "this command") {
  const { requireNodeIdentity, requireEndpointIdentity } = await import("@hardkas/node-runner");
  const { assertNodeSynced } = await import("@hardkas/core");
  const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
  const identity = target.managed ? await requireNodeIdentity() : await requireEndpointIdentity(target.rpcUrl, target.network);
  try {
    assertNodeSynced(identity, operation);
  } catch (e: unknown) {
    throw new HardkasCliError("NODE_NOT_SYNCED", String((e as Error)?.message ?? e).replace(/^NODE_NOT_SYNCED: /, ""), {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
  // every connection of the command's client asks again (network and sync), from the same getServerInfo answer
  return { identity, rpc: new JsonWrpcKaspaClient({ rpcUrl: target.rpcUrl, expectedNetworkId: target.network, requireSynced: true }) };
}

/** INT9-A (review M-3): a record's execution mode says which node evidenced it — `localnet` only for the managed one. */
export function recordModeOf(target: Pick<L1NodeTarget, "managed">): "localnet" | "rpc" {
  return target.managed ? "localnet" : "rpc";
}

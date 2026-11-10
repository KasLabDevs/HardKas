import { HardkasError } from "@hardkas/core";
import { assertBroadcastNodeSynced, unsyncedBroadcastAllowedOn, type BroadcastNodeSync } from "@hardkas/kaspa-rpc";

/*
 * RC1 · D3 · `tx.send` broadcasts only to a node that says it is synced, as the CLI does (INT9-A I-3b). A node that says
 * `isSynced: false`, or says nothing, is refused with NODE_NOT_SYNCED before any read the send depends on and before
 * anything is sent or recorded. Network identity, sync, mempool and confirmation stay four separate verdicts: this one
 * says only that the node claims to follow the current chain.
 *
 * rusty-kaspad v2.1.0 (simnet, probed 9-nov-2026, `rc1-a-probe`): a fresh node with no miner says `isSynced: false`, and
 * it ACCEPTS a submitTransaction in that state — so the refusal is HardKAS's, never the node's. A node keeps saying
 * `false` while its sink's timestamp is old (blocks with old timestamps), and says `true` right after a block with a
 * current one.
 *
 * The one exception is explicit and local: `allowUnsyncedNode: true`, for a controlled simnet or devnet (a node with no
 * peers that has not mined a recent block). It is refused on every other network (testnet, mainnet, a name that says
 * neither), and it is never implied by another option. Mainnet broadcast stays disabled whatever this says. The check
 * itself is @hardkas/kaspa-rpc's `assertBroadcastNodeSynced` (shared with the wallet toolkit).
 */

/** The options of tx.send this check reads. */
export interface SendNodeSyncOptions {
  /**
   * RC1 · D3: send to a node that does not say it is synced. Only for a controlled local network (simnet or devnet);
   * refused (SEND_UNSYNCED_NODE_NOT_ALLOWED) on any other network. Default false: such a node is refused
   * (NODE_NOT_SYNCED) before anything is sent or recorded.
   */
  allowUnsyncedNode?: boolean;
}

/** What the node said, as the check read it (never recorded). */
export type SendNodeSync = BroadcastNodeSync;

/** Whether `allowUnsyncedNode` may apply to this network: simnet or devnet, as the config entry declares it. */
export function unsyncedSendAllowedOn(declaredNetwork: string | undefined): boolean {
  return unsyncedBroadcastAllowedOn(declaredNetwork);
}

/** Validates `allowUnsyncedNode` before anything is read: a boolean, and only on a local network. */
export function assertAllowUnsyncedOption(value: unknown, declaredNetwork: string | undefined, where = "broadcast"): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new HardkasError(
      "SEND_OPTION_INVALID",
      `Refusing to ${where}: 'allowUnsyncedNode' is true or false, not ${JSON.stringify(value)}. Nothing was sent or recorded.`
    );
  }
  if (value && !unsyncedSendAllowedOn(declaredNetwork)) {
    throw new HardkasError(
      "SEND_UNSYNCED_NODE_NOT_ALLOWED",
      `Refusing to ${where}: 'allowUnsyncedNode' applies to a controlled local network (simnet or devnet) only, and this ` +
        `instance sends on ${declaredNetwork ?? "an unnamed network"}. A node that does not say it is synced is never used ` +
        `for a send there. Nothing was sent or recorded.`
    );
  }
  return value;
}

/**
 * Asks the node, now, whether it is synced (getServerInfo.isSynced). Only `true` counts; anything else is NodeSyncError
 * (NODE_NOT_SYNCED), unless `allowUnsynced`. A connection failure or timeout (an RpcError) propagates as it is.
 */
export async function checkSendNodeSynced(
  rpc: unknown,
  args: { endpoint: string | undefined; network: string; allowUnsynced: boolean }
): Promise<SendNodeSync> {
  return assertBroadcastNodeSynced(rpc, { endpoint: args.endpoint, expected: args.network, allowUnsynced: args.allowUnsynced, operation: "tx.send" });
}

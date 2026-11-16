// R3-D · ADDRESS-HISTORY-1 · the SDK side of an address's history: the instance's node, its declared network, its
// workspace's records. The reader itself is @hardkas/query's `readAddressHistory` (a bounded window of the node's
// selected chain; every result says what it covered). Read-only: nothing is planned, signed or sent.
import { HardkasError, declaredNetworkIdOf } from "@hardkas/core";
import {
  locateTransactionByAddress,
  readAddressHistory,
  type AddressHistoryOptions,
  type AddressHistoryResult,
  type AddressHistoryRpc
} from "@hardkas/query";
import { assertSdkMayConnect } from "./mainnet-lockdown.js";

/** The part of a `Hardkas` instance the history uses. */
export interface AddressHistorySdk {
  readonly network: string;
  readonly rpc: unknown;
  readonly config?: { readonly config?: unknown } | undefined;
  readonly execution?: { readonly mode?: string | undefined } | undefined;
  readonly workspace?: { readonly root?: string | undefined } | undefined;
}

export interface SdkAddressHistoryOptions extends Omit<AddressHistoryOptions, "address" | "networkId" | "workspaceRoot"> {
  /** Merge this workspace's own records (submissions, receipts) into the history (default: true). */
  readonly workspaceRecords?: boolean | undefined;
}

function nodeOf(sdk: AddressHistorySdk, context: string): { rpc: AddressHistoryRpc; networkId: string } {
  // MAINNET TOTAL LOCKDOWN: an instance on mainnet (its name or what its entry declares) is refused before any read
  assertSdkMayConnect(sdk, context);
  if (sdk.execution?.mode === "simulator") {
    throw new HardkasError(
      "ADDRESS_HISTORY_REQUIRES_NODE",
      `${context}: this instance runs on the HardKAS simulator, which has no node chain to read. Open it on a node network (simnet, devnet, testnet-<n>). Nothing was read.`,
      { metadata: { network: sdk.network } }
    );
  }
  const rpc = sdk.rpc as Partial<AddressHistoryRpc> | undefined;
  if (!rpc || typeof rpc.call !== "function") {
    throw new HardkasError("ADDRESS_HISTORY_NODE_UNSUPPORTED", `${context}: this instance's node client offers no generic RPC call. Nothing was read.`);
  }
  return { rpc: rpc as AddressHistoryRpc, networkId: declaredNetworkIdOf(sdk.config?.config, sdk.network) ?? sdk.network };
}

/**
 * The history of `address` on this instance's node over a bounded window (see @hardkas/query `readAddressHistory`):
 * every transaction accepted in the window that pays the address or spends an output of it, deduplicated, paged, with
 * its depth; this workspace's own records merged in. Mainnet is refused before anything is read.
 */
export async function readAddressHistoryOnNode(sdk: AddressHistorySdk, address: string, options: SdkAddressHistoryOptions = {}): Promise<AddressHistoryResult> {
  const { rpc, networkId } = nodeOf(sdk, "sdk address history");
  const { workspaceRecords, ...rest } = options;
  const root = workspaceRecords === false ? undefined : sdk.workspace?.root;
  return readAddressHistory(rpc, { ...rest, address, networkId, ...(root ? { workspaceRoot: root } : {}) });
}

/** Where `txId` was accepted, found through the history of an address it pays or spends from (bounded; see `coverage`). */
export async function locateTransactionOnNode(
  sdk: AddressHistorySdk,
  txId: string,
  address: string,
  options: Omit<SdkAddressHistoryOptions, "limit" | "cursor" | "workspaceRecords"> = {}
): ReturnType<typeof locateTransactionByAddress> {
  const { rpc, networkId } = nodeOf(sdk, "sdk transaction lookup by address");
  return locateTransactionByAddress(rpc, { ...options, txId, address, networkId });
}

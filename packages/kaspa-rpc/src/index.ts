import type { NetworkId } from "@hardkas/core";
import { RpcError, RpcNotFoundError } from "./errors.js";
import { OfficialRpcSession, type OfficialRpcFactory } from "./upstream/session.js";

export interface KaspaNodeInfo {
  serverVersion?: string | undefined;
  isSynced?: boolean | undefined;
  isUtxoIndexed?: boolean | undefined;
  p2pId?: string | undefined;
  mempoolSize?: number | undefined;
  virtualDaaScore?: bigint | undefined;
  networkId?: string | undefined;
  raw?: unknown | undefined;
}

export interface KaspaRpcHealth {
  readonly endpoint: string;
  readonly status: RpcHealthState;
  readonly confidence?: RpcConfidence;
  readonly score?: number;
  readonly latencyMs?: number | undefined;
  readonly lastError?: string | null | undefined;
  readonly retries?: number | undefined;
  readonly circuitState?: string | undefined;
  readonly stale?: boolean | undefined;
  readonly info?: KaspaNodeInfo | undefined;
  readonly reachable?: boolean | undefined;
  readonly successRate?: number | undefined;
}

import { RpcHealthState, RpcConfidence } from "./resilience.js";

export interface KaspaAddressBalance {
  address: string;
  balanceSompi: bigint;
  raw?: unknown;
}

export interface KaspaRpcOutpoint {
  transactionId: string;
  index: number;
}

export interface KaspaRpcUtxo {
  outpoint: KaspaRpcOutpoint;
  address: string;
  amountSompi: bigint;
  scriptPublicKey?: string;
  blockDaaScore?: bigint | string;
  isCoinbase?: boolean;
  covenantId?: string; // V1 Toccata capability
  raw?: unknown;
}

export interface KaspaRpcTransactionInput {
  previousOutpoint: KaspaRpcOutpoint;
  signatureScript: string;
  sequence: number;
  sigOpCount: number;
  computeBudget?: number; // V1 Toccata capability
}

export interface KaspaRpcCovenantBinding {
  authorizingInput: number;
  covenantId: string;
}

export interface KaspaRpcTransactionOutput {
  amount: bigint;
  scriptPublicKey: string;
  covenant?: KaspaRpcCovenantBinding; // V1 Toccata capability
}

export interface KaspaRpcTransaction {
  version: number;
  inputs: KaspaRpcTransactionInput[];
  outputs: KaspaRpcTransactionOutput[];
  lockTime: number;
  subnetworkId: string;
  gas: number;
  payload: string;
  mass?: number;
  storageMass?: number; // V1 Toccata capability
}

export interface JsonWrpcKaspaClientOptions {
  rpcUrl: string;
  timeoutMs?: number;
  /** Builds the official client for a URL; defaults to the pinned kaspa-wasm `RpcClient` (tests pass a stand-in). */
  rpcFactory?: OfficialRpcFactory;
}

export interface BlockDagInfo {
  readonly networkId: NetworkId;
  readonly virtualDaaScore?: bigint;
  readonly tipHashes?: readonly string[];
  readonly virtualParentHashes?: readonly string[];
  readonly sink?: string;
}

export interface ServerInfo {
  readonly networkId: NetworkId;
  readonly serverVersion?: string;
  readonly isSynced?: boolean;
  readonly hasUtxoIndex?: boolean;
  readonly virtualDaaScore?: bigint;
}

export interface MempoolEntry {
  readonly txId: string;
  readonly acceptedAt?: string | undefined;
}

export interface KaspaSubmitTransactionResult {
  transactionId?: string;
  accepted?: boolean;
  raw?: unknown;
}

export interface SubmitTransactionOptions {
  allowOrphan?: boolean;
}

/** Data verbosity of `getVirtualChainFromBlockV2`; HardKAS clients accept NONE and LEGACY_RECOVERY. */
export type RpcDataVerbosityLevel = "NONE" | "LOW" | "HIGH" | "FULL" | "LEGACY_RECOVERY";

export interface KaspaRpcClient {
  getInfo(): Promise<KaspaNodeInfo>;
  healthCheck(): Promise<KaspaRpcHealth>;
  getBalanceByAddress(address: string): Promise<KaspaAddressBalance>;
  getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]>;
  getUtxosByAddresses(addresses: string[]): Promise<any>;
  getBlocks(options?: { includeBlocks?: boolean; includeTransactions?: boolean }): Promise<any>;
  submitTransaction(transaction: KaspaRpcTransaction, options?: SubmitTransactionOptions): Promise<KaspaSubmitTransactionResult>;
  getMempoolEntry(txId: string): Promise<MempoolEntry | null>;
  checkMempoolPresence(txId: string): Promise<{ status: 'present' } | { status: 'absent' }>;
  getMempoolEntries(options?: unknown): Promise<any>;
  getMempoolEntriesByAddresses(options: any): Promise<any>;
  getTransaction(txId: string): Promise<unknown | null>;
  getBlockDagInfo(): Promise<BlockDagInfo>;
  getServerInfo(): Promise<ServerInfo>;
  getFeeEstimate(): Promise<any>;
  getFeeEstimateExperimental(): Promise<any>;
  getCurrentNetwork(): Promise<any>;
  getSyncStatus(): Promise<any>;
  getVirtualSelectedParentBlueScore(): Promise<any>;
  getVirtualChainFromBlockV2(options: { startHash: string; dataVerbosityLevel?: RpcDataVerbosityLevel; minConfirmationCount?: string }): Promise<any>;
  getSinkBlueScore(): Promise<any>;
  getHeaders(): Promise<any>;
  call<TResponse = unknown>(method: string, params?: unknown): Promise<TResponse>;
  close(): void | Promise<void>;
}

/**
 * HardKAS's Kaspa RPC client over the node's wRPC JSON endpoint. The transport is
 * the official kaspa-wasm `RpcClient`; this class keeps HardKAS's interface, typed
 * errors and result shapes on top of it.
 */
export class JsonWrpcKaspaClient implements KaspaRpcClient {
  private readonly session: OfficialRpcSession;
  private readonly rpcUrl: string;

  public readonly capabilities = {
    virtualChainFromBlockV2: 'compatibility' as const
  };

  constructor(options: JsonWrpcKaspaClientOptions) {
    this.rpcUrl = options.rpcUrl;
    this.session = new OfficialRpcSession(options.rpcUrl, options.timeoutMs ?? 30000, options.rpcFactory);
  }

  async call<TResponse = unknown>(method: string, params: any = {}): Promise<TResponse> {
    return this.session.request<TResponse>(method, params);
  }

  async getInfo(): Promise<KaspaNodeInfo> {
    const response = await this.session.request("getInfo");
    const info = mapKaspaNodeInfo(response);

    // QF-004: Enrich networkId authoritatively from getServerInfo if missing natively
    if (info.networkId === undefined) {
      try {
        const serverInfo = await this.getServerInfo();
        if (serverInfo?.networkId) {
          info.networkId = serverInfo.networkId as NetworkId;
        }
      } catch (e) {
        throw new RpcError(
          `Failed to enrich authoritative networkId from getServerInfo: ${e instanceof Error ? e.message : String(e)}`,
          "RPC_NODE_INFO_ENRICHMENT_FAILED"
        );
      }
    }

    if (info.virtualDaaScore === undefined) {
      try {
        const dagInfo = await this.getBlockDagInfo();
        if (dagInfo?.virtualDaaScore !== undefined) {
          info.virtualDaaScore = dagInfo.virtualDaaScore;
        }
      } catch (e) {}
    }

    return info;
  }

  async healthCheck(): Promise<KaspaRpcHealth> {
    try {
      const info = await this.getInfo();
      return {
        endpoint: this.rpcUrl,
        status: "healthy",
        info,
        reachable: true
      };
    } catch (error) {
      return {
        endpoint: this.rpcUrl,
        status: "unreachable",
        lastError: error instanceof Error ? error.message : String(error),
        reachable: false
      };
    }
  }

  async getBalanceByAddress(address: string): Promise<KaspaAddressBalance> {
    const response = await this.session.request("getBalancesByAddresses", { addresses: [address] });
    return mapKaspaAddressBalance(response, address);
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    let response: any;
    try {
      response = await this.session.request("getUtxosByAddresses", { addresses: [address] });
    } catch (e) {
      if (e instanceof RpcNotFoundError) return [];
      throw e;
    }

    if (!response || !response.entries) {
      return [];
    }

    return mapKaspaRpcUtxos(response, address);
  }

  async getUtxosByAddresses(addresses: string[]): Promise<any> {
    return this.session.request("getUtxosByAddresses", { addresses });
  }

  async getBlocks(options: { includeBlocks?: boolean; includeTransactions?: boolean } = {}): Promise<any> {
    return this.session.request("getBlocks", { includeBlocks: false, includeTransactions: false, ...options });
  }

  async submitTransaction(transaction: KaspaRpcTransaction, options?: SubmitTransactionOptions): Promise<KaspaSubmitTransactionResult> {
    // The storage mass commitment is checked before anything is sent (see upstream/wire.ts).
    const response = await this.session.request("submitTransaction", {
      transaction,
      allowOrphan: options?.allowOrphan ?? false
    });
    return mapKaspaSubmitTransactionResult(response);
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry | null> {
    try {
      const response = await this.session.request("getMempoolEntry", {
        transactionId: txId,
        includeOrphanPool: true,
        filterTransactionPool: false
      });
      if (!response) return null;
      const resObj = response as Record<string, unknown>;
      return {
        txId,
        acceptedAt: (resObj.acceptedAt || resObj.accepted_at) as string | undefined
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Checks if a transaction is present in the mempool.
   * Unlike getMempoolEntry, this method distinguishes between:
   * - 'present': tx is in the mempool
   * - 'absent': tx is definitively NOT in the mempool
   * - throws: RPC error (timeout, connection, protocol error) — caller must handle
   *
   * This is a safety-critical method used by PendingSpendService reconciliation.
   * A timeout or connection error MUST propagate as an exception, never as 'absent'.
   */
  async checkMempoolPresence(txId: string): Promise<{ status: 'present' } | { status: 'absent' }> {
    try {
      await this.session.request("getMempoolEntry", {
        transactionId: txId,
        includeOrphanPool: true,
        filterTransactionPool: false
      });
      return { status: 'present' };
    } catch (e: any) {
      // Distinguish 'not found' from real errors
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('not found') || msg.includes('no_data') || msg.includes('entry not found')) {
        return { status: 'absent' };
      }
      // Transport/timeout/connection errors must propagate
      throw e;
    }
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    try {
      return await this.session.request("getTransaction", { transactionId: txId });
    } catch (e) {
      // The node serves no transaction lookup without a transaction index.
      if (e instanceof RpcNotFoundError) return null;
      throw e;
    }
  }

  async getBlockDagInfo(): Promise<BlockDagInfo> {
    const dagData: any = await this.session.request("getBlockDagInfo");
    return {
      networkId: (dagData?.networkName || dagData?.network || "unknown") as NetworkId,
      virtualDaaScore: dagData?.virtualDaaScore !== undefined ? BigInt(dagData.virtualDaaScore) : 0n,
      tipHashes: dagData?.tipHashes || dagData?.blockTipHashes || [],
      virtualParentHashes: dagData?.virtualParentHashes || [],
      sink: dagData?.sink || dagData?.sinkHash || ""
    };
  }

  async getServerInfo(): Promise<ServerInfo> {
    try {
      const response: any = await this.session.request("getServerInfo");
      const result: any = {
        networkId: (response?.networkId || "unknown") as NetworkId
      };
      if (response?.serverVersion !== undefined) result.serverVersion = response.serverVersion;
      if (response?.isSynced !== undefined) result.isSynced = response.isSynced;
      if (response?.hasUtxoIndex !== undefined) result.hasUtxoIndex = response.hasUtxoIndex;
      if (response?.virtualDaaScore !== undefined) result.virtualDaaScore = BigInt(response.virtualDaaScore);
      return result as ServerInfo;
    } catch (e) {
      // Fallback to getInfo
      const info: any = await this.getInfo();
      const result: any = {
        networkId: (info.networkId as NetworkId) || "unknown"
      };
      if (info.serverVersion !== undefined) result.serverVersion = info.serverVersion;
      if (info.isSynced !== undefined) result.isSynced = info.isSynced;
      return result as ServerInfo;
    }
  }

  async getMempoolEntries(options?: any): Promise<any> {
    return this.session.request("getMempoolEntries", { includeOrphanPool: false, filterTransactionPool: false, ...(options || {}) });
  }
  async getMempoolEntriesByAddresses(options: any): Promise<any> {
    return this.session.request("getMempoolEntriesByAddresses", options);
  }

  async getFeeEstimate(): Promise<any> {
    return this.session.request("getFeeEstimate", {});
  }

  async getFeeEstimateExperimental(): Promise<any> {
    return this.session.request("getFeeEstimateExperimental", { verbose: false });
  }

  async getCurrentNetwork(): Promise<any> {
    return this.session.request("getCurrentNetwork", {});
  }

  async getSyncStatus(): Promise<any> {
    return this.session.request("getSyncStatus", {});
  }

  async getVirtualSelectedParentBlueScore(): Promise<any> {
    // The node serves the selected parent's blue score as the sink blue score.
    return this.session.request("getVirtualSelectedParentBlueScore", {});
  }

  async getVirtualChainFromBlockV2(options: { startHash: string; dataVerbosityLevel?: RpcDataVerbosityLevel; minConfirmationCount?: string }): Promise<any> {
    if (options.dataVerbosityLevel !== "NONE" && options.dataVerbosityLevel !== "LEGACY_RECOVERY" && options.dataVerbosityLevel !== undefined) {
      throw new RpcError(`dataVerbosityLevel '${options.dataVerbosityLevel}' is not supported by the legacy compatibility transport binding. Supported subsets: 'NONE' | 'LEGACY_RECOVERY'`, "RPC_CAPABILITY_UNSUPPORTED");
    }
    if (options.minConfirmationCount !== undefined && options.minConfirmationCount !== "0") {
      throw new RpcError("minConfirmationCount is not supported by the current transport binding", "RPC_CAPABILITY_UNSUPPORTED");
    }
    return this.session.request("getVirtualChainFromBlockV2", { startHash: options.startHash });
  }

  async getSinkBlueScore(): Promise<any> {
    return this.session.request("getSinkBlueScore", {});
  }

  async getHeaders(): Promise<any> {
    return this.session.request("getHeaders", {});
  }

  async close(): Promise<void> {
    await this.session.close();
  }
}

export function mapKaspaNodeInfo(result: any): KaspaNodeInfo {
  if (!result) return { raw: result };

  const info: any = {
    serverVersion: result.serverVersion || result.server_version,
    isSynced: result.isSynced !== undefined ? result.isSynced : result.is_synced,
    isUtxoIndexed:
      result.isUtxoIndexed !== undefined ? result.isUtxoIndexed : result.is_utxo_indexed,
    p2pId: result.p2pId || result.p2p_id,
    mempoolSize:
      result.mempoolSize !== undefined ? result.mempoolSize : result.mempool_size,
    networkId: result.networkId || result.network_id,
    raw: result
  };

  const score =
    result.virtualDaaScore !== undefined
      ? result.virtualDaaScore
      : result.virtual_daa_score !== undefined
        ? result.virtual_daa_score
        : result.params?.virtualDaaScore;
  if (score !== undefined) {
    info.virtualDaaScore = BigInt(score);
  }

  return info;
}

export function mapKaspaAddressBalance(
  result: any,
  address: string
): KaspaAddressBalance {
  if (!result) return { address, balanceSompi: 0n, raw: result };

  let entry = result;
  if (Array.isArray(result)) {
    entry =
      result.find(
        (e: any) => (e.address || e.addressString || e.address_string) === address
      ) || result[0];
  } else if (result.entries && Array.isArray(result.entries)) {
    entry =
      result.entries.find(
        (e: any) => (e.address || e.addressString || e.address_string) === address
      ) || result.entries[0];
  }

  const balance =
    entry.balance !== undefined
      ? entry.balance
      : entry.balanceSompi !== undefined
        ? entry.balanceSompi
        : entry.amount;
  const balanceSompi = balance !== undefined ? BigInt(balance) : 0n;

  return {
    address,
    balanceSompi,
    raw: result
  };
}

export function mapKaspaRpcUtxos(result: any, address: string): KaspaRpcUtxo[] {
  if (!result) return [];

  let entries: any = null;

  if (Array.isArray(result)) {
    entries = result;
  } else if (result.result && Array.isArray(result.result)) {
    entries = result.result;
  } else if (result.result && (result.result.entries || result.result.utxos)) {
    entries = result.result.entries || result.result.utxos;
  } else {
    entries = result.entries || result.utxos || result;
  }

  if (!Array.isArray(entries)) return [];

  return (entries as unknown[]).map((entryRaw) => {
    const entry = entryRaw as Record<string, any>;
    const utxoEntry = (entry.utxoEntry ||
      entry.utxo_entry ||
      entry.utxo ||
      entry) as Record<string, any>;
    const outpoint = (entry.outpoint || entry) as Record<string, any>;

    return {
      outpoint: {
        transactionId: String(
          outpoint.transactionId ||
            outpoint.transaction_id ||
            outpoint.txId ||
            outpoint.tx_id ||
            outpoint.transaction_hash ||
            ""
        ),
        index: Number(
          outpoint.index !== undefined
            ? outpoint.index
            : outpoint.outputIndex !== undefined
              ? outpoint.outputIndex
              : outpoint.output_index
        )
      },
      address: entry.address || address,
      amountSompi: BigInt(
        utxoEntry.amount || utxoEntry.amountSompi || utxoEntry.amount_sompi || 0
      ),
      scriptPublicKey: String(
        utxoEntry.scriptPublicKey || utxoEntry.script_public_key || ""
      ),
      blockDaaScore: utxoEntry.blockDaaScore || utxoEntry.block_daa_score,
      isCoinbase: Boolean(utxoEntry.isCoinbase || utxoEntry.is_coinbase),
      covenantId: utxoEntry.covenantId || utxoEntry.covenant_id,
      raw: entry
    };
  });
}
export function mapKaspaSubmitTransactionResult(result: any): KaspaSubmitTransactionResult {
  if (!result) return { raw: result };

  const txId = typeof result === "string" ? result : (result.transactionId || result.transaction_id || result.txId || result.tx_id);

  return {
    transactionId: txId,
    accepted: result.accepted !== undefined ? result.accepted : (result.isAccepted || result.success || true),
    raw: result
  };
}

export class MockKaspaRpcClient implements KaspaRpcClient {
  private utxosByAddress = new Map<string, KaspaRpcUtxo[]>();

  constructor(private readonly networkId: NetworkId = "simnet" as NetworkId) {}

  async call<TResponse = unknown>(method: string, params?: unknown): Promise<TResponse> {
    return null as TResponse;
  }

  async getMempoolEntries(options?: any): Promise<any> { return []; }
  async getMempoolEntriesByAddresses(options: any): Promise<any> { return { entries: [] }; }
  async getFeeEstimate(): Promise<any> { return { estimate: 0 }; }
  async getFeeEstimateExperimental(): Promise<any> { return { estimate: 0 }; }
  async getCurrentNetwork(): Promise<any> { return { network: this.networkId }; }
  async getSyncStatus(): Promise<any> { return { isSynced: true }; }
  async getVirtualSelectedParentBlueScore(): Promise<any> { return { blueScore: 0n }; }
  async getVirtualChainFromBlockV2(): Promise<any> { return { removedChainBlockHashes: [], addedChainBlockHashes: [] }; }
  async getSinkBlueScore(): Promise<any> { return { blueScore: 0n }; }
  async getHeaders(): Promise<any> { return { headers: [] }; }

  async getInfo(): Promise<KaspaNodeInfo> {
    return {
      networkId: this.networkId,
      serverVersion: "mock",
      isSynced: true,
      virtualDaaScore: 0n,
      raw: {}
    };
  }

  async healthCheck(): Promise<KaspaRpcHealth> {
    return {
      endpoint: "mock://local",
      status: "healthy",
      info: await this.getInfo(),
      reachable: true
    };
  }

  async getBalanceByAddress(address: string): Promise<KaspaAddressBalance> {
    const utxos = this.utxosByAddress.get(address) || [];
    const balanceSompi = utxos.reduce((acc, u) => acc + u.amountSompi, 0n);
    return { address, balanceSompi };
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    return this.utxosByAddress.get(address) || [];
  }

  async getUtxosByAddresses(addresses: string[]): Promise<any> {
    const allUtxos = addresses.flatMap(a => this.utxosByAddress.get(a) || []);
    return { entries: allUtxos };
  }

  async getBlocks(options?: { includeBlocks?: boolean; includeTransactions?: boolean }): Promise<any> {
    return { blockHashes: [], blocks: [] };
  }

  setUtxos(address: string, utxos: KaspaRpcUtxo[]): void {
    this.utxosByAddress.set(address, utxos);
  }

  async submitTransaction(
    transaction: KaspaRpcTransaction,
    options?: SubmitTransactionOptions
  ): Promise<KaspaSubmitTransactionResult> {
    return {
      transactionId: "mock-txid",
      accepted: true,
      raw: { transaction }
    };
  }

  async getMempoolEntry(_txId: string): Promise<MempoolEntry | null> {
    return null;
  }

  async checkMempoolPresence(_txId: string): Promise<{ status: 'present' } | { status: 'absent' }> {
    return { status: 'absent' };
  }

  async getTransaction(_txId: string): Promise<unknown | null> {
    return null;
  }

  async getBlockDagInfo(): Promise<BlockDagInfo> {
    return { networkId: this.networkId, virtualDaaScore: 0n };
  }

  async getServerInfo(): Promise<ServerInfo> {
    return { networkId: this.networkId, serverVersion: "mock", isSynced: true };
  }

  async close(): Promise<void> {}
}

export * from "./json-rpc-client.js";
export { KaspaWrpcClient } from "./wrpc-client.js";
export * from "./health.js";

export * from "./errors.js";
// The transport: the official kaspa-wasm RpcClient, and the factory seam tests use to stand in for it.
export { officialRpcFactory, toWrpcUrl, type OfficialRpcClientLike, type OfficialRpcFactory } from "./upstream/session.js";
export * from "./provider.js";
export * from "./resilience.js";
export * from "./wrpc-client.js";

import { KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { observePendingSpends, utxoOutpointKey, type PendingSpendEvidence } from "@hardkas/tx-builder";
import { IndexerToolkit } from "./indexer.js";

export type QueryDataSource = "indexer" | "rpc" | "cache" | "unavailable";

export interface QueryResponse<T> {
  data: T;
  source: QueryDataSource;
  /** Wave 2(c) · AUD-19: the mempool observation `spendableUtxos` filtered against, when it did. */
  pendingSpendEvidence?: PendingSpendEvidence;
}

export class QueryToolkit {
  constructor(
    private readonly rpc: KaspaRpcClient,
    private readonly indexer?: IndexerToolkit
  ) {}

  public async balance(address: string): Promise<QueryResponse<bigint>> {
    if (this.indexer) {
      try {
        const data = await this.indexer.balance(address);
        return { data, source: "indexer" };
      } catch (e) {
        // Fallback to RPC if indexer fails or throws
      }
    }

    const data = await this.rpc.getBalanceByAddress(address);
    return { data: data.balanceSompi, source: "rpc" };
  }

  public async utxos(address: string): Promise<QueryResponse<any[]>> {
    if (this.indexer && this.indexer.utxos) {
      try {
        const data = await this.indexer.utxos(address);
        return { data, source: "indexer" };
      } catch (e) {
        // Fallback to RPC
      }
    }

    const data = await this.rpc.getUtxosByAddress(address);
    return { data, source: "rpc" };
  }

  /**
   * Filters DAG UTXOs against currently observed mempool spends and explicit exclusions.
   * It does not provide cross-process or pre-submit reservations.
   *
   * Wave 2(c) · AUD-19: with `excludePending` the mempool observation is mandatory —
   * a client that cannot ask, or a node that cannot answer, fails the query closed
   * (`PENDING_SPEND_EVIDENCE_UNAVAILABLE`) instead of returning an unfiltered set.
   * The observation is returned as `pendingSpendEvidence` (observer-local, never a
   * network guarantee).
   */
  public async spendableUtxos(request: {
    address: string;
    excludePending?: boolean;
    excludeOutpoints?: Set<string>;
    /** Recency anchor recorded in the evidence (the caller's virtual DAA score for this snapshot). */
    observedAtDaaScore?: bigint;
  }): Promise<QueryResponse<any[]>> {
    const { address, excludePending = true, excludeOutpoints } = request;

    // 1. Get base DAG UTXOs
    const utxoRes = await this.utxos(address);
    const baseUtxos = utxoRes.data;

    const excluded = new Set<string>();

    // Add explicitly excluded outpoints
    if (excludeOutpoints) {
      for (const op of excludeOutpoints) {
        excluded.add(op);
      }
    }

    // 2. ONE mempool observation, or a fail-closed refusal.
    let pendingSpendEvidence: PendingSpendEvidence | undefined;
    if (excludePending) {
      const observed = await observePendingSpends(this.rpc as any, address, request.observedAtDaaScore);
      pendingSpendEvidence = observed.evidence;
      for (const op of observed.outpoints) excluded.add(op);
    }

    // 3. Filter UTXOs
    const filtered = excluded.size > 0 ? baseUtxos.filter((u) => !excluded.has(utxoOutpointKey(u) ?? "")) : baseUtxos;
    return {
      data: filtered,
      source: utxoRes.source,
      ...(pendingSpendEvidence ? { pendingSpendEvidence } : {})
    };
  }

  public async history(address: string): Promise<QueryResponse<any[]>> {
    if (this.indexer) {
      try {
        const data = await this.indexer.history(address);
        return { data, source: "indexer" };
      } catch (e) {
        // Bubble error if it fails
        throw e;
      }
    }

    // Kaspa RPC does not natively support address history
    throw new Error(
      "History query requires an IndexerProvider. Native RPC does not support address history."
    );
  }

  public async transaction(txid: string): Promise<QueryResponse<any>> {
    // If indexer had a transaction endpoint, we'd use it here.
    // For now, we fallback to RPC.

    // Will throw if the node doesn't have txindex enabled.
    // We let this bubble up as designed.
    const data = await this.rpc.getTransaction(txid);
    if (data === null) {
      // Not found
      throw new Error(`Transaction ${txid} not found.`);
    }
    return { data, source: "rpc" };
  }

  public async confirmations(txid: string): Promise<QueryResponse<number>> {
    // A high-level helper to calculate confirmations.
    // 1. Get the transaction to find its accepting block DAA score.
    const tx = await this.rpc.getTransaction(txid) as any;
    if (!tx) {
      throw new Error(`Transaction ${txid} not found.`);
    }

    // Unconfirmed TX in mempool has no accepting block score
    if (!tx.acceptingBlockHash || !tx.acceptingBlockBlueScore) {
      return { data: 0, source: "rpc" };
    }

    // 2. Get current virtual blue score
    const virtualScoreResp = await this.rpc.getVirtualSelectedParentBlueScore() as any;
    const virtualScore = BigInt(virtualScoreResp.blueScore);

    // Wave 2(a) · Q4 point 3: confirmations = sinkBlueScore − acceptingBlueScore, the node's own
    // unit (`minConfirmationCount`), without a +1 — one vocabulary across node, SDK and toolkit.
    const txScore = BigInt(tx.acceptingBlockBlueScore);
    const confirmations = virtualScore > txScore ? Number(virtualScore - txScore) : 0;

    return { data: confirmations, source: "rpc" };
  }

  public async mempool(txid?: string): Promise<QueryResponse<any>> {
    if (txid) {
      const data = await this.rpc.getMempoolEntry(txid);
      if (!data) {
        throw new Error(`Transaction ${txid} not found in mempool.`);
      }
      return { data, source: "rpc" };
    }

    const data = await this.rpc.getMempoolEntries({ includeOrphanPool: false, filterTransactionPool: false });
    return { data, source: "rpc" };
  }

  public async block(hash: string): Promise<QueryResponse<any>> {
    // Note: If the underlying client supports getBlock, call it dynamically.
    if ((this.rpc as any).getBlock) {
      const block = await (this.rpc as any).getBlock(hash);
      return { data: block, source: "rpc" };
    }
    throw new Error("Method not mapped: block query needs explicit RPC support for getBlock.");
  }

  public async network(): Promise<QueryResponse<any>> {
    const info = await this.rpc.getInfo();
    const dag = await this.rpc.getBlockDagInfo();
    const net = await this.rpc.getCurrentNetwork() as any;

    return {
      data: {
        serverVersion: info.serverVersion,
        isSynced: info.isSynced,
        networkId: net.currentNetwork || dag.networkId,
        mempoolSize: info.mempoolSize
      },
      source: "rpc"
    };
  }

  public async sync(): Promise<QueryResponse<any>> {
    const data = await this.rpc.getSyncStatus();
    return { data, source: "rpc" };
  }
}

import {
  KaspaRpcClient,
  KaspaNodeInfo,
  KaspaRpcHealth,
  KaspaAddressBalance,
  KaspaRpcUtxo,
  MempoolEntry,
  BlockDagInfo,
  ServerInfo,
  KaspaRpcTransaction,
  KaspaSubmitTransactionResult
} from "./index.js";
import { type NetworkId, nodeRpcUrl } from "@hardkas/core";
import {
  RpcError,
  RpcCircuitOpenError,
  RpcValidationError,
  RpcNotFoundError
} from "./errors.js";
import { calculateConfidence } from "./resilience.js";
import { OfficialRpcSession, type OfficialRpcFactory } from "./upstream/session.js";
import { toOfficialTransaction } from "./upstream/wire.js";

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN"
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export interface RpcClientOptions {
  url: string;
  timeoutMs?: number | undefined;
  retry?: Partial<RetryOptions>;
  circuitBreaker?: Partial<CircuitBreakerOptions>;
  /** Builds the official client for a URL; defaults to the pinned kaspa-wasm `RpcClient` (tests pass a stand-in). */
  rpcFactory?: OfficialRpcFactory;
}

/**
 * A Kaspa RPC client with retries, a circuit breaker and health scoring. Calls go
 * through the official kaspa-wasm RpcClient to the node's wRPC JSON endpoint; an
 * http(s):// URL names that endpoint (it is used as ws(s)://).
 */
export class KaspaJsonRpcClient implements KaspaRpcClient {
  public readonly url: string;
  private readonly timeoutMs: number;
  private readonly retry: RetryOptions;
  private readonly circuitBreaker: CircuitBreakerOptions;
  private readonly session: OfficialRpcSession;

  // State & Metrics
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private lastError: string | null = null;
  private lastLatencyMs: number | null = null;
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private lastDaaScore: bigint | null = null;
  private lastDaaCheckTime: number = 0;
  private retriesCount: number = 0;

  constructor(options: RpcClientOptions) {
    // CANONICAL-RPC-URL: the canonical localnet endpoint (ws://) from @hardkas/core, never a copy.
    this.url = options.url || nodeRpcUrl();
    this.timeoutMs = options.timeoutMs || 10000;
    this.retry = {
      maxRetries: options.retry?.maxRetries ?? 3,
      baseDelayMs: options.retry?.baseDelayMs ?? 100,
      maxDelayMs: options.retry?.maxDelayMs ?? 5000,
    };
    this.circuitBreaker = {
      failureThreshold: options.circuitBreaker?.failureThreshold ?? 5,
      resetTimeoutMs: options.circuitBreaker?.resetTimeoutMs ?? 15000,
    };
    this.session = new OfficialRpcSession(this.url, this.timeoutMs, options.rpcFactory);
  }

  async call<TResponse = unknown>(method: string, params?: any): Promise<TResponse> {
    return this.callRpc<TResponse>(method, params);
  }

  async healthCheck(): Promise<KaspaRpcHealth> {
    this.checkCircuit();
    const start = Date.now();
    try {
      const info = await this.getInfo();
      const latency = Date.now() - start;

      // Stale Detection
      let stale = false;
      const now = Date.now();
      if (this.lastDaaScore !== null && info.virtualDaaScore !== undefined) {
        if (
          info.virtualDaaScore <= this.lastDaaScore &&
          now - this.lastDaaCheckTime > 30000
        ) {
          stale = true;
        }
      }

      if (info.virtualDaaScore !== undefined) {
        this.lastDaaScore = info.virtualDaaScore;
        this.lastDaaCheckTime = now;
      }

      const resilience = calculateConfidence({
        latencyMs: latency,
        successRate: this.getSuccessRate(),
        retries: this.retriesCount,
        stale,
        reachable: true,
        circuitOpen: this.circuitState === CircuitState.OPEN
      });

      // EVENT-LEDGER-2 (EVENT-EMISSION-1): the raw `rpc.health` / `rpc.error` objects this client handed to
      // normalizeAndEmit carried no workflow or correlation and were discarded by it; they are gone, not converted
      // (a transport diagnostic is not workspace evidence). The result below is what the caller gets.
      return {
        reachable: true,
        rpcUrl: this.url,
        status: resilience.state as any,
        info,
        latencyMs: latency,
        lastError: this.lastError,
        successRate: this.getSuccessRate(),
        circuitState: this.circuitState as any,
        score: resilience.score,
        confidence: resilience.confidence,
        retries: this.retriesCount,
        stale
      } as any;
    } catch (e: unknown) {
      const resilience = calculateConfidence({
        latencyMs: null,
        successRate: this.getSuccessRate(),
        retries: this.retriesCount,
        stale: false,
        reachable: false,
        circuitOpen: this.circuitState === CircuitState.OPEN
      });

      return {
        reachable: false,
        rpcUrl: this.url,
        status: "unavailable",
        error: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e),
        lastError: this.lastError || (e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)),
        successRate: this.getSuccessRate(),
        circuitState: this.circuitState as any,
        confidence: resilience.confidence,
        score: resilience.score,
        retries: this.retriesCount
      } as any;
    }
  }

  async getInfo(): Promise<KaspaNodeInfo> {
    const data = (await this.callRpc("getInfoRequest")) as Record<string, unknown>;
    const info: KaspaNodeInfo = {
      serverVersion: data.serverVersion ? String(data.serverVersion) : undefined,
      networkId: data.networkId && data.networkId !== "undefined" ? String(data.networkId) : undefined,
      isSynced: data.isSynced !== undefined ? Boolean(data.isSynced) : undefined
    };
    if (data.virtualDaaScore !== undefined)
      info.virtualDaaScore = BigInt(data.virtualDaaScore as string | number);
    if (data.mempoolSize !== undefined) info.mempoolSize = Number(data.mempoolSize);

    // QF-004: Single authoritative enrichment call to getServerInfoRequest if networkId missing natively
    if (info.networkId === undefined) {
      try {
        const serverData = (await this.callRpc("getServerInfoRequest")) as Record<string, unknown>;
        if (serverData?.networkId && String(serverData.networkId) !== "undefined") {
          info.networkId = String(serverData.networkId);
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
        const dagData = (await this.callRpc("getBlockDagInfoRequest")) as Record<string, unknown>;
        if (dagData?.virtualDaaScore !== undefined) {
          info.virtualDaaScore = BigInt(dagData.virtualDaaScore as string | number);
        }
      } catch (e) {}
    }
    return info;
  }

  async getBlockDagInfo(): Promise<BlockDagInfo> {
    const data = (await this.callRpc("getBlockDagInfoRequest")) as {
      networkId?: string;
      network?: string;
      tipHashes: string[];
      virtualDaaScore?: string | number;
    };
    const dagInfo = {
      networkId: (data.networkId ?? data.network) as NetworkId,
      tipHashes: data.tipHashes,
      ...(data.virtualDaaScore !== undefined
        ? { virtualDaaScore: BigInt(data.virtualDaaScore) }
        : {})
    } satisfies BlockDagInfo;
    return dagInfo;
  }

  async getUtxosByAddresses(addresses: string[]): Promise<any> {
    return await this.callRpc("getUtxosByAddressesRequest", { addresses });
  }

  async getBlocks(options?: { includeBlocks?: boolean; includeTransactions?: boolean }): Promise<any> {
    return await this.callRpc("getBlocksRequest", options || {});
  }

  async getMempoolEntries(options?: any): Promise<any> {
    return await this.callRpc("getMempoolEntriesRequest", options || {});
  }
  async getMempoolEntriesByAddresses(options: any): Promise<any> {
    return await this.callRpc("getMempoolEntriesByAddressesRequest", options);
  }

  async getFeeEstimate(): Promise<any> {
    return await this.callRpc("getFeeEstimateRequest", {});
  }

  async getFeeEstimateExperimental(): Promise<any> {
    return await this.callRpc("getFeeEstimateExperimentalRequest", {});
  }

  async getCurrentNetwork(): Promise<any> {
    return await this.callRpc("getCurrentNetworkRequest", {});
  }

  async getSyncStatus(): Promise<any> {
    return await this.callRpc("getSyncStatusRequest", {});
  }

  async getVirtualSelectedParentBlueScore(): Promise<any> {
    return await this.callRpc("getVirtualSelectedParentBlueScoreRequest", {});
  }

  async getVirtualChainFromBlockV2(options: { startHash: string; dataVerbosityLevel?: import("./index.js").RpcDataVerbosityLevel; minConfirmationCount?: string }): Promise<any> {
    return await this.callRpc("getVirtualChainFromBlockV2Request", options);
  }

  async getSinkBlueScore(): Promise<any> {
    return await this.callRpc("getSinkBlueScoreRequest", {});
  }

  async getHeaders(): Promise<any> {
    return await this.callRpc("getBlockHeadersRequest", {});
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    let data: any;
    try {
      data = (await this.callRpc("getUtxosByAddressesRequest", {
        addresses: [address]
      })) as {
        entries?: Array<{
        address: string;
        outpoint: { transactionId: string; index: number };
        utxoEntry: {
          amount: string | number;
          scriptPublicKey: string;
          blockDaaScore: string | number;
          isCoinbase: boolean;
        };
      }>;
      };
    } catch (e) {
      if (e instanceof RpcNotFoundError) return [];
      throw e;
    }
    const entries = data.entries || [];
    return entries.map((e: any) => {
      let spk = e.utxoEntry.scriptPublicKey;
      if (spk && typeof spk === "object") {
        const versionHex = (spk.version || 0).toString(16).padStart(4, "0");
        const scriptHex = spk.script || spk.scriptPublicKey || "";
        spk = versionHex + scriptHex;
      }
      return {
        address: e.address,
        outpoint: {
          transactionId: e.outpoint.transactionId,
          index: e.outpoint.index
        },
        amountSompi: BigInt(e.utxoEntry.amount),
        scriptPublicKey: spk,
        blockDaaScore: BigInt(e.utxoEntry.blockDaaScore),
        isCoinbase: e.utxoEntry.isCoinbase
      };
    });
  }

  async getBalanceByAddress(address: string): Promise<KaspaAddressBalance> {
    const data = (await this.callRpc("getBalanceByAddressRequest", { address })) as {
      address?: string;
      balance: string | number;
    };
    return {
      address: data.address ?? address,
      balanceSompi: BigInt(data.balance)
    };
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry | null> {
    try {
      const result = (await this.callRpc("getMempoolEntryRequest", {
        transactionId: txId,
        includeOrphanPool: true,
        filterTransactionPool: false
      })) as { mempoolEntry?: { acceptedAt?: number }; entry?: { acceptedAt?: number } } | null;
      const entry = result?.mempoolEntry ?? result?.entry;
      return {
        txId,
        acceptedAt: entry?.acceptedAt !== undefined ? String(entry.acceptedAt) : undefined
      };
    } catch (e) {
      if (e instanceof RpcNotFoundError) return null;
      throw e;
    }
  }

  async checkMempoolPresence(txId: string): Promise<{ status: 'present' } | { status: 'absent' }> {
    try {
      await this.callRpc("getMempoolEntryRequest", {
        transactionId: txId,
        includeOrphanPool: true,
        filterTransactionPool: false
      });
      return { status: 'present' };
    } catch (e: any) {
      if (e instanceof RpcNotFoundError) return { status: 'absent' };
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('not found') || msg.includes('no_data') || msg.includes('entry not found')) {
        return { status: 'absent' };
      }
      throw e;
    }
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    try {
      const result = await this.callRpc("getTransactionRequest", { transactionId: txId });
      return result;
    } catch (e) {
      if (e instanceof RpcNotFoundError) return null;
      throw e;
    }
  }

  async submitTransaction(transaction: KaspaRpcTransaction | any, options?: any): Promise<KaspaSubmitTransactionResult> {
    // Converted (and its storage mass commitment checked) before the retry loop:
    // a malformed transaction is refused once, never retried against the node.
    const txObj = toOfficialTransaction(transaction);
    const result = (await this.callRpc("submitTransactionRequest", {
      transaction: txObj,
      allowOrphan: options?.allowOrphan ?? false
    })) as { transactionId: string };
    return { transactionId: result.transactionId };
  }

  async getServerInfo(): Promise<ServerInfo> {
    const info = await this.getInfo();
    const result: any = {
      networkId: info.networkId as NetworkId
    };
    if (info.serverVersion !== undefined) result.serverVersion = info.serverVersion;
    if (info.isSynced !== undefined) result.isSynced = info.isSynced;
    return result;
  }

  async close(): Promise<void> {
    await this.session.close();
  }

  private async callRpc<T>(method: string, params: unknown = {}): Promise<T> {
    return this.withResilience(() => this.internalCall<T>(method, params));
  }

  private async withResilience<T>(fn: () => Promise<T>): Promise<T> {
    this.checkCircuit();

    if (this.circuitState === CircuitState.OPEN) {
      throw new RpcCircuitOpenError();
    }

    let lastErr: any;
    for (let attempt = 0; attempt <= this.retry.maxRetries; attempt++) {
      const start = Date.now();
      try {
        this.totalRequests++;
        const result = await fn();
        this.onSuccess(Date.now() - start);
        return result;
      } catch (e: unknown) {
        this.onFailure(e);
        lastErr = e;

        const isRetriable = e instanceof RpcError ? e.isRetriable : true;

        // Increment total retries count for health reporting
        if (attempt < this.retry.maxRetries && isRetriable) {
          this.retriesCount++;
        }

        // Don't retry if it's a non-retriable error
        if (e instanceof RpcError && !e.isRetriable) {
          throw e;
        }

        // Don't retry on deterministic protocol errors (e.g. invalid address, insufficient funds)
        if (this.isDeterministicError(e)) {
          const err = e as any;
          throw new RpcValidationError(((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)), ((err as any).code), err.data);
        }

        if (attempt === this.retry.maxRetries) break;

        const delay = Math.min(
          this.retry.baseDelayMs * Math.pow(2, attempt),
          this.retry.maxDelayMs
        );
        const jitter = Math.random() * 0.1 * delay;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
    }
    throw lastErr;
  }

  private async internalCall<T>(method: string, params: unknown): Promise<T> {
    return this.session.request<T>(method, params, this.timeoutMs);
  }

  private checkCircuit() {
    if (this.circuitState === CircuitState.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.circuitBreaker.resetTimeoutMs) {
        this.circuitState = CircuitState.HALF_OPEN;
      }
    }
  }

  private onSuccess(latency: number) {
    this.lastLatencyMs = latency;
    this.successfulRequests++;
    this.failureCount = 0;
    this.circuitState = CircuitState.CLOSED;
  }

  private onFailure(e: any) {
    this.lastError = ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e));

    // Only count as failure for circuit breaking if it's NOT a validation error
    if (e instanceof RpcValidationError || (e instanceof RpcError && !e.isRetriable)) {
      return;
    }

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitState = CircuitState.OPEN;
    }
  }

  private isDeterministicError(e: any): boolean {
    const msg = (((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "").toLowerCase();
    const deterministicMarkers = [
      "invalid address",
      "insufficient funds",
      "schema validation",
      "artifact hash mismatch",
      "simulation error",
      "dust",
      "missing required",
      "outpoint already spent",
      "method not found"
    ];
    return deterministicMarkers.some((marker) => msg.includes(marker));
  }

  private getSuccessRate(): number {
    if (this.totalRequests === 0) return 100;
    return (this.successfulRequests / this.totalRequests) * 100;
  }
}

import { 
  KaspaRpcClient, 
  KaspaNodeInfo, 
  KaspaRpcHealth,
  KaspaAddressBalance,
  KaspaRpcUtxo,
  MempoolEntry,
  BlockDagInfo,
  ServerInfo
} from "./index.js";
import { type NetworkId } from "@hardkas/core";
import { 
  RpcError, 
  RpcTimeoutError, 
  RpcUnavailableError, 
  RpcCircuitOpenError, 
  RpcRateLimitError,
  RpcValidationError
} from "./errors.js";
import { calculateConfidence } from "./resilience.js";
import { coreEvents } from "@hardkas/core";

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
  fetcher?: typeof fetch;
}

export class KaspaJsonRpcClient implements KaspaRpcClient {
  public readonly url: string;
  private readonly timeoutMs: number;
  private readonly retry: RetryOptions;
  private readonly circuitBreaker: CircuitBreakerOptions;
  private readonly fetcher: typeof fetch;

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
    this.url = options.url || "http://127.0.0.1:18210";
    this.timeoutMs = options.timeoutMs || 10000;
    this.retry = {
      maxRetries: options.retry?.maxRetries ?? 3,
      baseDelayMs: options.retry?.baseDelayMs ?? 500,
      maxDelayMs: options.retry?.maxDelayMs ?? 5000
    };
    this.circuitBreaker = {
      failureThreshold: options.circuitBreaker?.failureThreshold ?? 5,
      resetTimeoutMs: options.circuitBreaker?.resetTimeoutMs ?? 30000
    };
    this.fetcher = options.fetcher || globalThis.fetch;
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
        if (info.virtualDaaScore <= this.lastDaaScore && now - this.lastDaaCheckTime > 30000) {
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

      coreEvents.normalizeAndEmit({
        kind: "rpc.health",
        endpoint: this.url,
        state: resilience.state,
        score: resilience.score,
        latencyMs: latency,
        issues: resilience.issues
      });

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
    } catch (e: any) {
      const resilience = calculateConfidence({
        latencyMs: null,
        successRate: this.getSuccessRate(),
        retries: this.retriesCount,
        stale: false,
        reachable: false,
        circuitOpen: this.circuitState === CircuitState.OPEN
      });

      coreEvents.normalizeAndEmit({
        kind: "rpc.health",
        endpoint: this.url,
        state: resilience.state,
        score: resilience.score,
        latencyMs: -1,
        issues: resilience.issues
      });

      return {
        reachable: false,
        rpcUrl: this.url,
        status: "unavailable",
        error: e.message,
        lastError: this.lastError || e.message,
        successRate: this.getSuccessRate(),
        circuitState: this.circuitState as any,
        confidence: resilience.confidence,
        score: resilience.score,
        retries: this.retriesCount
      } as any;
    }
  }

  async getInfo(): Promise<KaspaNodeInfo> {
    const data = await this.callRpc("getInfoRequest") as Record<string, unknown>;
    const info: KaspaNodeInfo = {
      serverVersion: String(data.serverVersion),
      networkId: String(data.networkId),
      isSynced: Boolean(data.isSynced)
    };
    if (data.virtualDaaScore !== undefined) info.virtualDaaScore = BigInt(data.virtualDaaScore as string | number);
    if (data.mempoolSize !== undefined) info.mempoolSize = Number(data.mempoolSize);
    return info;
  }

  async getBlockDagInfo(): Promise<BlockDagInfo> {
    const data = await this.callRpc("getBlockDagInfoRequest") as {
      networkId: string;
      tipHashes: string[];
      virtualDaaScore?: string | number;
    };
    const dagInfo = {
      networkId: data.networkId as NetworkId,
      tipHashes: data.tipHashes,
      ...(data.virtualDaaScore !== undefined ? { virtualDaaScore: BigInt(data.virtualDaaScore) } : {})
    } satisfies BlockDagInfo;
    return dagInfo;
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    const data = await this.callRpc("getUtxosByAddressesRequest", { addresses: [address] }) as {
      entries?: Array<{
        address: string;
        outpoint: { transactionId: string; index: number };
        utxoEntry: { amount: string | number; scriptPublicKey: string; blockDaaScore: string | number; isCoinbase: boolean };
      }>;
    };
    const entries = data.entries || [];
    return entries.map(e => ({
      address: e.address,
      outpoint: {
        transactionId: e.outpoint.transactionId,
        index: e.outpoint.index
      },
      amountSompi: BigInt(e.utxoEntry.amount),
      scriptPublicKey: e.utxoEntry.scriptPublicKey,
      blockDaaScore: BigInt(e.utxoEntry.blockDaaScore),
      isCoinbase: e.utxoEntry.isCoinbase
    }));
  }

  async getBalanceByAddress(address: string): Promise<KaspaAddressBalance> {
    const data = await this.callRpc("getBalanceByAddressRequest", { address }) as { address: string; balance: string | number };
    return {
      address: data.address,
      balanceSompi: BigInt(data.balance)
    };
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry | null> {
    try {
      const result = await this.callRpc("getMempoolEntryRequest", { txId, includeOrphanPool: true }) as { entry: { acceptedAt: number } };
      return {
        txId,
        acceptedAt: String(result.entry.acceptedAt)
      };
    } catch (e) {
      return null;
    }
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    try {
      const result = await this.callRpc("getTransactionRequest", { transactionId: txId });
      return result;
    } catch (e) {
      return null;
    }
  }

  async submitTransaction(rawTx: unknown): Promise<{ transactionId: string }> {
    const result = await this.callRpc("submitTransactionRequest", { transaction: rawTx }) as { transactionId: string };
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
    // No-op for HTTP
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
      } catch (e: any) {
        this.onFailure(e);
        lastErr = e;

        const isRetriable = e instanceof RpcError ? e.isRetriable : true;
        coreEvents.normalizeAndEmit({
          kind: "rpc.error",
          endpoint: this.url,
          error: e.message,
          retriable: isRetriable
        });

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
          throw new RpcValidationError(e.message, e.code, e.data);
        }

        if (attempt === this.retry.maxRetries) break;

        const delay = Math.min(
          this.retry.baseDelayMs * Math.pow(2, attempt),
          this.retry.maxDelayMs
        );
        const jitter = Math.random() * 0.1 * delay;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
    throw lastErr;
  }

  private async internalCall<T>(method: string, params: unknown): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params
        }),
        signal: controller.signal
      });

      clearTimeout(id);

      if (response.status === 429) {
        throw new RpcRateLimitError();
      }

      if (!response.ok) {
        throw new RpcUnavailableError(`HTTP Error ${response.status}`, response.status);
      }

      const body = await response.json();
      if (body.error) {
        throw new RpcError(body.error.message, body.error.code, body.error.data);
      }

      return body.result;
    } catch (e: any) {
      clearTimeout(id);
      if (e.name === "AbortError") throw new RpcTimeoutError();
      throw e;
    }
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
    this.lastError = e.message;
    
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
    const msg = (e.message || "").toLowerCase();
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
    return deterministicMarkers.some(marker => msg.includes(marker));
  }

  private getSuccessRate(): number {
    if (this.totalRequests === 0) return 100;
    return (this.successfulRequests / this.totalRequests) * 100;
  }
}

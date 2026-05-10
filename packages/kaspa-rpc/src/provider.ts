import { KaspaRpcClient, KaspaNodeInfo, KaspaRpcHealth, KaspaAddressBalance, KaspaRpcUtxo, KaspaSubmitTransactionResult, MempoolEntry, BlockDagInfo, ServerInfo } from "./index.js";
import { RpcUnavailableError } from "./errors.js";

export interface LoadBalancerOptions {
  strategy: "round-robin" | "failover";
}

export class LoadBalancedRpcProvider implements KaspaRpcClient {
  private currentIndex = 0;

  constructor(
    private readonly clients: KaspaRpcClient[],
    private readonly options: LoadBalancerOptions = { strategy: "failover" }
  ) {
    if (clients.length === 0) {
      throw new Error("LoadBalancedRpcProvider requires at least one client");
    }
  }

  async getInfo(): Promise<KaspaNodeInfo> {
    return this.withFailover(c => c.getInfo());
  }

  async healthCheck(): Promise<KaspaRpcHealth> {
    const healths = await Promise.all(this.clients.map(c => c.healthCheck()));
    const primaryHealth = healths[this.currentIndex]!;
    
    const allHealthy = healths.every(h => h.status === "healthy");
    const anyHealthy = healths.some(h => h.status === "healthy" || h.status === "degraded");

    return {
      endpoint: `LoadBalancedProvider(${this.clients.length} nodes)`,
      status: allHealthy ? "healthy" : anyHealthy ? "degraded" : "unreachable",
      latencyMs: primaryHealth.latencyMs,
      lastError: primaryHealth.lastError,
      retries: healths.reduce((sum, h) => sum + (h.retries || 0), 0),
      circuitState: primaryHealth.circuitState,
      stale: healths.some(h => h.stale),
      info: primaryHealth.info,
      reachable: anyHealthy
    };
  }

  async getBalanceByAddress(address: string): Promise<KaspaAddressBalance> {
    return this.withFailover(c => c.getBalanceByAddress(address));
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    return this.withFailover(c => c.getUtxosByAddress(address));
  }

  async submitTransaction(rawTransaction: string): Promise<KaspaSubmitTransactionResult> {
    return this.withFailover(c => c.submitTransaction(rawTransaction));
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry | null> {
    return this.withFailover(c => c.getMempoolEntry(txId));
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    return this.withFailover(c => c.getTransaction(txId));
  }

  async getBlockDagInfo(): Promise<BlockDagInfo> {
    return this.withFailover(c => c.getBlockDagInfo());
  }

  async getServerInfo(): Promise<ServerInfo> {
    return this.withFailover(c => c.getServerInfo());
  }

  async close(): Promise<void> {
    await Promise.all(this.clients.map(c => c.close()));
  }

  private async withFailover<T>(fn: (client: KaspaRpcClient) => Promise<T>): Promise<T> {
    let lastError: any;
    
    // Try all clients starting from the current index
    for (let i = 0; i < this.clients.length; i++) {
      const index = (this.currentIndex + i) % this.clients.length;
      const client = this.clients[index]!;

      try {
        const result = await fn(client);
        
        // If successful and strategy is round-robin, move to next for next call
        if (this.options.strategy === "round-robin") {
          this.currentIndex = (index + 1) % this.clients.length;
        } else {
          // If failover, keep using this index as it's healthy
          this.currentIndex = index;
        }
        
        return result;
      } catch (error: any) {
        lastError = error;
        // Continue to next client if this one is unavailable/timeout
      }
    }

    throw lastError || new RpcUnavailableError("All RPC endpoints failed");
  }
}

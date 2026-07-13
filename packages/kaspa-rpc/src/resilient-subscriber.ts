import { KaspaRpcClient, JsonWrpcKaspaClientOptions, JsonWrpcKaspaClient, KaspaNodeInfo, KaspaRpcHealth, KaspaAddressBalance, KaspaRpcUtxo, KaspaSubmitTransactionResult, MempoolEntry, BlockDagInfo, ServerInfo, KaspaSubscription, KaspaRpcTransaction, SubmitTransactionOptions } from "./index.js";
import { logger } from "@hardkas/observability";

export interface ResilientSubscriptionClientOptions extends JsonWrpcKaspaClientOptions {
  heartbeatIntervalMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
}

interface SubscriptionRecord {
  topic: string;
  payload: any;
  cb: (data: any) => void;
  unsubscribeInternal?: () => Promise<void>;
}

export class ResilientSubscriptionClient implements KaspaRpcClient {
  private client: JsonWrpcKaspaClient | null = null;
  private subscriptions = new Set<SubscriptionRecord>();
  private reconnecting = false;
  private closed = false;
  private heartbeatTimer?: NodeJS.Timeout;
  
  private heartbeatIntervalMs: number;
  private reconnectBaseDelayMs: number;
  private reconnectMaxDelayMs: number;

  constructor(private options: ResilientSubscriptionClientOptions) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10000;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1000;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30000;
    
    // Inject onDisconnect hook to trigger fast reconnect
    const originalOptions = { ...options };
    (originalOptions as any).onDisconnect = () => {
      this.scheduleReconnect();
    };
    
    this.client = new JsonWrpcKaspaClient(originalOptions);
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.closed) return;
    this.heartbeatTimer = setInterval(async () => {
      if (this.reconnecting || this.closed) return;
      try {
        if (this.client) {
          await this.client.getInfo();
        }
      } catch (e) {
        logger.warn("ResilientSubscriptionClient heartbeat failed. Triggering reconnect.");
        this.scheduleReconnect();
      }
    }, this.heartbeatIntervalMs);
  }

  private async scheduleReconnect() {
    if (this.reconnecting || this.closed) return;
    this.reconnecting = true;
    
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
    }

    let delay = this.reconnectBaseDelayMs;

    while (!this.closed) {
      try {
        const newClientOptions = { ...this.options };
        (newClientOptions as any).onDisconnect = () => {
          this.scheduleReconnect();
        };
        const newClient = new JsonWrpcKaspaClient(newClientOptions);
        
        // Force connection test
        await newClient.getInfo();
        
        this.client = newClient;
        await this.resubscribeAll();
        
        this.reconnecting = false;
        logger.info("ResilientSubscriptionClient reconnected successfully.");
        return;
      } catch (e: any) {
        logger.debug(`ResilientSubscriptionClient reconnect failed: ${e.message}. Retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, this.reconnectMaxDelayMs);
      }
    }
  }

  private async resubscribeAll() {
    if (!this.client || this.closed) return;
    const promises = Array.from(this.subscriptions).map(async (sub) => {
      try {
        this.client!.on(sub.topic, sub.cb);
      } catch (e) {
        logger.error(`Failed to resubscribe to ${sub.topic}`, { error: e });
      }
    });
    await Promise.all(promises);
  }

  // --- KaspaRpcClient Delegation ---

  async getInfo(): Promise<KaspaNodeInfo> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getInfo();
  }

  async healthCheck(): Promise<KaspaRpcHealth> {
    if (!this.client) return { endpoint: this.options.rpcUrl, status: "unreachable", reachable: false };
    return this.client.healthCheck();
  }

  async getBalanceByAddress(address: string): Promise<KaspaAddressBalance> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getBalanceByAddress(address);
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getUtxosByAddress(address);
  }

  async getUtxosByAddresses(addresses: string[]): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getUtxosByAddresses(addresses);
  }

  async getBlocks(options?: { includeBlocks?: boolean; includeTransactions?: boolean }): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getBlocks(options);
  }

  async submitTransaction(transaction: KaspaRpcTransaction, options?: SubmitTransactionOptions): Promise<KaspaSubmitTransactionResult> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.submitTransaction(transaction, options);
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry | null> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getMempoolEntry(txId);
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getTransaction(txId);
  }

  async getBlockDagInfo(): Promise<BlockDagInfo> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getBlockDagInfo();
  }

  async getServerInfo(): Promise<ServerInfo> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getServerInfo();
  }

  async getMempoolEntries(options?: unknown): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getMempoolEntries(options);
  }

  async getFeeEstimate(): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getFeeEstimate();
  }

  async getFeeEstimateExperimental(): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getFeeEstimateExperimental();
  }

  async getCurrentNetwork(): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getCurrentNetwork();
  }

  async getSyncStatus(): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getSyncStatus();
  }

  async getVirtualSelectedParentBlueScore(): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getVirtualSelectedParentBlueScore();
  }

  async getSinkBlueScore(): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getSinkBlueScore();
  }

  async getHeaders(): Promise<any> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.getHeaders();
  }

  async subscribeToUtxosChanged(addresses: readonly string[], handler: (event: any) => void): Promise<KaspaSubscription> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.subscribeToUtxosChanged(addresses, handler);
  }

  async call<TResponse = unknown>(method: string, params?: unknown): Promise<TResponse> {
    if (!this.client) throw new Error("Client is reconnecting");
    return this.client.call<TResponse>(method, params);
  }

  on(event: string, handler: (data: unknown) => void): void {
    const record: SubscriptionRecord = {
      topic: event,
      payload: {},
      cb: handler
    };
    this.subscriptions.add(record);
    if (this.client) this.client.on(event, handler);
  }

  off(event: string, handler: (data: unknown) => void): void {
    for (const sub of this.subscriptions) {
      if (sub.topic === event && sub.cb === handler) {
        this.subscriptions.delete(sub);
      }
    }
    if (this.client) this.client.off(event, handler);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
    }
    this.subscriptions.clear();
  }
}


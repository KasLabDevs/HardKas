// Kaspa wRPC client: request/response calls by method name against the node's
// JSON wRPC endpoint (rusty-kaspad port 18210 on simnet, 18110 on mainnet).
// The transport is the official kaspa-wasm RpcClient (see upstream/session.ts).

import { logger, metrics } from "@hardkas/observability";
import { OfficialRpcSession, toWrpcUrl, type OfficialRpcFactory } from "./upstream/session.js";
import { toWire } from "./upstream/wire.js";

metrics.register({
  name: "rpc_requests_total",
  help: "Total RPC requests made",
  type: "counter"
});
metrics.register({
  name: "rpc_errors_total",
  help: "Total RPC requests failed",
  type: "counter"
});
metrics.register({
  name: "rpc_retries_total",
  help: "Total RPC requests retried",
  type: "counter"
});

export interface WrpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface WrpcResponse {
  id?: number;
  /** Set on notifications: the event name. */
  method?: string;
  result?: unknown;
  params?: unknown;
  error?: { message: string; code?: number };
}

export interface KaspaWrpcClientOptions {
  /** Builds the official client for a URL; defaults to the pinned kaspa-wasm `RpcClient` (tests pass a stand-in). */
  rpcFactory?: OfficialRpcFactory;
}

export class KaspaWrpcClient {
  private url: string;
  private session: OfficialRpcSession | null = null;

  /** Receives every node notification as `{ method: <event>, params: <payload> }`. */
  public onNotification?: (msg: WrpcResponse) => void;
  public debug = false;

  constructor(url: string, private readonly options: KaspaWrpcClientOptions = {}) {
    this.url = toWrpcUrl(url);
  }

  getUrl(): string {
    return this.url;
  }

  async connect(timeoutMs = 5000): Promise<void> {
    this.disconnect();
    const session = new OfficialRpcSession(this.url, timeoutMs, this.options.rpcFactory);
    const client = await session.connected();
    this.session = session;
    // The one-argument form of the official addEventListener receives every event.
    (client as unknown as { addEventListener(callback: (event: any) => void): void }).addEventListener((event: any) => {
      if (this.onNotification) this.onNotification({ method: event?.type, params: toWire(event?.data) });
    });
  }

  async request(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 5000
  ): Promise<unknown> {
    if (!this.session) {
      throw new Error("WebSocket not connected. Call connect() first.");
    }
    metrics.inc("rpc_requests_total", { method });
    logger.trace("wRPC request", { method, params });
    try {
      return await this.session.request(method, params ?? {}, timeoutMs);
    } catch (err) {
      metrics.inc("rpc_errors_total", { method });
      logger.error("wRPC error response", { method, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async getServerInfo(): Promise<unknown> {
    return this.request("getServerInfo");
  }
  async getBlockDagInfo(): Promise<unknown> {
    return this.request("getBlockDagInfo");
  }
  async getVirtualSelectedParentBlueScore(): Promise<unknown> {
    return this.request("getVirtualSelectedParentBlueScore");
  }
  async getVirtualChainFromBlockV2(options: { startHash: string; dataVerbosityLevel?: import("./index.js").RpcDataVerbosityLevel; minConfirmationCount?: string }): Promise<any> {
    return this.request("getVirtualChainFromBlockV2", { startHash: options.startHash });
  }
  async getUtxosByAddresses(addresses: string[]): Promise<unknown> {
    return this.request("getUtxosByAddresses", { addresses });
  }

  async submitTransaction(txPayload: any, allowOrphan = false): Promise<unknown> {
    // The storage mass commitment is checked before anything is sent (see upstream/wire.ts).
    const result = (await this.request("submitTransaction", { transaction: txPayload, allowOrphan })) as any;
    // Normalize return to match SDK expectations (accepted + transactionId)
    return {
      accepted: true,
      transactionId: result?.transactionId || result?.transactionID || "",
      ...result
    };
  }

  async ping(): Promise<boolean> {
    try {
      await this.getServerInfo();
      return true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    const session = this.session;
    this.session = null;
    if (session) void session.close();
  }
}

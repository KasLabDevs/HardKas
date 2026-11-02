// Kaspa wRPC client: request/response calls by method name against the node's
// JSON wRPC endpoint (rusty-kaspad port 18210 on simnet, 18110 on mainnet).
// The transport is the official kaspa-wasm RpcClient (see upstream/session.ts).

import { logger, metrics } from "@hardkas/observability";
import { OfficialRpcSession, rpcClientClosedError, toWrpcUrl, type OfficialRpcFactory } from "./upstream/session.js";
import { toWire } from "./upstream/wire.js";
import { RpcNotFoundError, RpcRequestNotSentError, acceptedTxIdOf, classifySubmitFailure } from "./errors.js";
import { submitTxIdOf } from "./expected-txid.js";
import { mapKaspaRpcUtxos, type KaspaRpcUtxo, type SubmitTransactionOptions } from "./index.js";

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
  /**
   * NODE-NETWORK-IDENTITY-1: see JsonWrpcKaspaClientOptions.expectedNetworkId (checked by connect() and before every
   * request on a resumed connection; notifications are not covered, see onNotification).
   */
  expectedNetworkId?: string | undefined;
}

export class KaspaWrpcClient {
  /** ENDPOINT-AUTHORITY-1: the endpoint this client talks to (what a record names as its RPC endpoint). */
  public readonly url: string;
  private session: OfficialRpcSession | null = null;
  /** The session whose connect() has not completed yet: disconnect() closes it too (RL-I4). */
  private opening: OfficialRpcSession | null = null;

  /**
   * Receives every node notification as `{ method: <event>, params: <payload> }`, as the official client delivers it.
   * NOT covered by NODE-NETWORK-IDENTITY-1: requests are verified on every connection, notifications are not — after
   * the official client resumed on a new connection by itself, events are forwarded before any request re-verified the
   * node (SECURITY-INTEGRATION-1). No HardKAS path subscribes or decides anything from notifications.
   */
  public onNotification?: (msg: WrpcResponse) => void;
  public debug = false;

  constructor(url: string, private readonly options: KaspaWrpcClientOptions = {}) {
    this.url = toWrpcUrl(url);
  }

  getUrl(): string {
    return this.url;
  }

  async connect(timeoutMs = 5000): Promise<void> {
    // The previous connection is detached and the new session registered before anything is awaited, so a
    // disconnect() from this point on closes the new session too (RL-I4).
    const released = this.disconnect();
    const session = new OfficialRpcSession(this.url, timeoutMs, this.options.rpcFactory, this.options.expectedNetworkId);
    this.opening = session;
    await released;
    if (this.opening !== session) throw rpcClientClosedError(this.url);
    const client = await session.connected().finally(() => {
      if (this.opening === session) this.opening = null;
    });
    // disconnect() (or a newer connect()) ran while this connection was being established: it closed this session.
    if (session.current() !== client) throw rpcClientClosedError(this.url);
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

  /**
   * TX-SEND-SUBMITPOINT-1: the generic call every HardKAS RPC client exposes (`KaspaRpcClient.call`), so code holding this
   * client (the SDK, when `tx send` hands it this one) reads the chain through it as through any other. Same request.
   */
  async call<TResponse = unknown>(method: string, params: Record<string, unknown> = {}): Promise<TResponse> {
    return (await this.request(method, params)) as TResponse;
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

  /**
   * V1-ENGINE (F1.6): the UTXOs of one address as every HardKAS client gives them (`mapKaspaRpcUtxos`, the covenant id the
   * node lists kept), so the SDK's v1 send reads its inputs through this client as through any other (`tx send` hands it
   * this one for a ws:// endpoint). An address the node does not know lists nothing.
   */
  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    let response: any;
    try {
      response = await this.request("getUtxosByAddresses", { addresses: [address] });
    } catch (e) {
      if (e instanceof RpcNotFoundError) return [];
      throw e;
    }
    return response?.entries ? mapKaspaRpcUtxos(response, address) : [];
  }

  /** V1-ENGINE (F1.6): the mempool's entries for these addresses (the pending spends a v1 send checks), as the node answers. */
  async getMempoolEntriesByAddresses(options: { addresses: string[]; includeOrphanPool?: boolean; filterTransactionPool?: boolean }): Promise<unknown> {
    return this.request("getMempoolEntriesByAddresses", options);
  }

  /**
   * EXPECTED-TXID-1: the second argument is SubmitTransactionOptions (as every HardKAS client takes it; `sdk.tx.send`
   * passes `{ expectedTxId }`) or, as before, the boolean allowOrphan. An options object is never read as allowOrphan.
   */
  async submitTransaction(txPayload: any, allowOrphanOrOptions: boolean | SubmitTransactionOptions = false): Promise<unknown> {
    const options: SubmitTransactionOptions =
      typeof allowOrphanOrOptions === "object" && allowOrphanOrOptions !== null ? allowOrphanOrOptions : { allowOrphan: allowOrphanOrOptions === true };
    const allowOrphan = options.allowOrphan === true;
    // TX-SEND-BLOCKED-OUTCOME-1: without a connection nothing can have been sent
    if (!this.session) {
      throw new RpcRequestNotSentError(`submitTransaction was not sent (before the transport): this client is not connected to ${this.url}`);
    }
    // The storage mass commitment is checked before anything is sent (see upstream/wire.ts).
    // EXPECTED-TXID-1: options.expectedTxId, checked against the transaction before anything is sent
    const expected = submitTxIdOf(txPayload, options);
    let result: any;
    try {
      result = (await this.request("submitTransaction", { transaction: txPayload, allowOrphan })) as any;
    } catch (e) {
      throw classifySubmitFailure(e, expected);
    }
    // RPC-SUBMIT-SAFETY-1: accepted only when the answer names the transaction (never an empty id)
    const transactionId = result?.accepted === false ? result?.transactionId || result?.transactionID || "" : acceptedTxIdOf(result, expected);
    // Normalize return to match SDK expectations (accepted + transactionId)
    return {
      accepted: true,
      ...result,
      transactionId
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

  /** Releases the connection, including one connect() is still opening; resolves once it is released. Never throws. */
  async disconnect(): Promise<void> {
    const sessions = [this.session, this.opening].filter((s): s is OfficialRpcSession => s !== null);
    this.session = null;
    this.opening = null;
    await Promise.all(sessions.map((s) => s.close()));
  }
}

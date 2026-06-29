import type { NetworkId } from "@hardkas/core";
import { WebSocket } from "ws";

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
  raw?: unknown;
}

export interface JsonWrpcKaspaClientOptions {
  rpcUrl: string;
  timeoutMs?: number;
}

export interface BlockDagInfo {
  readonly networkId: NetworkId;
  readonly virtualDaaScore?: bigint;
  readonly tipHashes?: readonly string[];
}

export interface ServerInfo {
  readonly networkId: NetworkId;
  readonly serverVersion?: string;
  readonly isSynced?: boolean;
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

export interface KaspaRpcClient {
  getInfo(): Promise<KaspaNodeInfo>;
  healthCheck(): Promise<KaspaRpcHealth>;
  getBalanceByAddress(address: string): Promise<KaspaAddressBalance>;
  getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]>;
  getUtxosByAddresses(addresses: string[]): Promise<any>;
  getBlocks(options?: { includeBlocks?: boolean; includeTransactions?: boolean }): Promise<any>;
  submitTransaction(rawTransaction: unknown): Promise<KaspaSubmitTransactionResult>;
  getMempoolEntry(txId: string): Promise<MempoolEntry | null>;
  getTransaction(txId: string): Promise<unknown | null>;
  getBlockDagInfo(): Promise<BlockDagInfo>;
  getServerInfo(): Promise<ServerInfo>;
  close(): void | Promise<void>;
}

export class JsonWrpcKaspaClient implements KaspaRpcClient {
  private socket: WebSocket | null = null;
  private readonly rpcUrl: string;
  private readonly timeoutMs: number;
  private requestId = 1;

  constructor(options: JsonWrpcKaspaClientOptions) {
    this.rpcUrl = options.rpcUrl;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  private rpcFlavor: "legacy" | "wrpc" | null = null;
  private preflightPromise: Promise<void> | null = null;

  private async detectFlavor(): Promise<void> {
    if (this.rpcFlavor) return;
    if (this.preflightPromise) return this.preflightPromise;

    this.preflightPromise = (async () => {
      try {
        const ws = await this.connect();
        // Send getServerInfo first because wrpc accepts it, and legacy returns Method Not Found.
        // If we sent getServerInfoRequest first, wrpc would close the connection.
        const res = await this.requestRaw("getServerInfo", {});
        this.rpcFlavor = "wrpc";
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e);
        if (errMsg.includes("Method not found")) {
          this.rpcFlavor = "legacy";
        } else {
          // If connection closed or timed out, default to wrpc and let it fail naturally later
          this.rpcFlavor = "wrpc";
        }
      }
    })();
    return this.preflightPromise;
  }

  private async callMethod(
    wrpcName: string,
    legacyName: string,
    params: any = {}
  ): Promise<unknown> {
    await this.detectFlavor();
    const method = this.rpcFlavor === "legacy" ? legacyName : wrpcName;
    return this.requestRaw(method, params);
  }

  async getInfo(): Promise<KaspaNodeInfo> {
    const response = await this.callMethod("getInfo", "getInfoRequest");
    const info = mapKaspaNodeInfo(response);

    if (info.virtualDaaScore === undefined) {
      try {
        const dagResponse = await this.callMethod(
          "getBlockDagInfo",
          "getBlockDagInfoRequest"
        );
        const dagData = (dagResponse as any)?.params || dagResponse;
        if (dagData && typeof dagData === "object" && "virtualDaaScore" in dagData) {
          info.virtualDaaScore = BigInt((dagData as any).virtualDaaScore);
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
    await this.detectFlavor();
    // For wrpc, we must use getBalancesByAddresses with { addresses: [address] }
    // For legacy, getBalanceByAddressRequest with { address } works
    let response;
    if (this.rpcFlavor === "legacy") {
      response = await this.callMethod(
        "getBalanceByAddress",
        "getBalanceByAddressRequest",
        { address }
      );
    } else {
      response = await this.callMethod(
        "getBalancesByAddresses",
        "getBalancesByAddressesRequest",
        { addresses: [address] }
      );
    }
    return mapKaspaAddressBalance(response, address);
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    const response = await this.callMethod(
      "getUtxosByAddresses",
      "getUtxosByAddressesRequest",
      { addresses: [address] }
    ) as any;

    if (!response || !response.entries) {
      return [];
    }

    return mapKaspaRpcUtxos(response, address);
  }

  async getUtxosByAddresses(addresses: string[]): Promise<any> {
    return await this.callMethod(
      "getUtxosByAddresses",
      "getUtxosByAddressesRequest",
      { addresses }
    );
  }

  async getBlocks(options: { includeBlocks?: boolean; includeTransactions?: boolean } = {}): Promise<any> {
    return await this.callMethod(
      "getBlocks",
      "getBlocksRequest",
      options
    );
  }

  async submitTransaction(rawTransaction: unknown): Promise<KaspaSubmitTransactionResult> {
    let txObj = rawTransaction;
    try {
      while (typeof txObj === "string" && txObj.startsWith("{")) {
        const parsed = JSON.parse(txObj);
        if (parsed && typeof parsed === "object") {
          if ("tx" in parsed) txObj = parsed.tx;
          else if ("inner" in parsed) txObj = parsed.inner;
          else txObj = parsed;
        } else {
          txObj = parsed;
        }
      }

      // One final check for POJO nested inner/tx in case it wasn't a string at a nested level
      while (
        txObj &&
        typeof txObj === "object" &&
        !Array.isArray(txObj) &&
        ("tx" in txObj || "inner" in txObj)
      ) {
        if ("tx" in txObj) txObj = (txObj as any).tx;
        else if ("inner" in txObj) txObj = (txObj as any).inner;
      }

      // Fix types for wRPC (it expects numbers for amounts/values)
      const txAny = txObj as any;
      if (txAny && typeof txAny === "object") {
        if (txAny.mass === undefined) txAny.mass = 0;
        if (txAny.outputs && Array.isArray(txAny.outputs)) {
          txAny.outputs.forEach((output: any) => {
            if (output.amount !== undefined && output.value === undefined) {
              output.value = output.amount;
              delete output.amount;
            }
            if (typeof output.amount === "string") output.amount = Number(output.amount);
            if (typeof output.value === "string") output.value = Number(output.value);

            if (output.scriptPublicKey && typeof output.scriptPublicKey === "object") {
              if (
                output.scriptPublicKey.scriptPublicKey !== undefined &&
                output.scriptPublicKey.script === undefined
              ) {
                output.scriptPublicKey.script = output.scriptPublicKey.scriptPublicKey;
                delete output.scriptPublicKey.scriptPublicKey;
              }
            }
          });
        }
        if (txAny.inputs && Array.isArray(txAny.inputs)) {
          txAny.inputs.forEach((input: any) => {
            if (typeof input.sequence === "string")
              input.sequence = Number(input.sequence);
            if (typeof input.sigOpCount === "string")
              input.sigOpCount = Number(input.sigOpCount);
          });
        }
      }
    } catch (e) {
      // Ignored
    }

    // Both flavors accept the transaction wrapped in an object
    const response = await this.callMethod(
      "submitTransaction",
      "submitTransactionRequest",
      { transaction: txObj, allowOrphan: false }
    );
    return mapKaspaSubmitTransactionResult(response);
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry | null> {
    try {
      const response = await this.callMethod(
        "getMempoolEntry",
        "getMempoolEntryRequest",
        { transactionId: txId, includeOrphanPool: true, filterTransactionPool: false }
      );
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

  async getTransaction(txId: string): Promise<unknown | null> {
    try {
      return await this.callMethod("getTransaction", "getTransactionRequest", {
        transactionId: txId
      });
    } catch (e) {
      return null;
    }
  }

  async getBlockDagInfo(): Promise<BlockDagInfo> {
    const info = await this.getInfo();
    const result: any = {
      networkId: (info.networkId as NetworkId) || "unknown",
      tipHashes: []
    };
    if (info.virtualDaaScore !== undefined) {
      result.virtualDaaScore = BigInt(info.virtualDaaScore);
    }
    return result;
  }

  async getServerInfo(): Promise<ServerInfo> {
    const info = await this.getInfo();
    const result: any = {
      networkId: (info.networkId as NetworkId) || "unknown"
    };
    if (info.serverVersion !== undefined) result.serverVersion = info.serverVersion;
    if (info.isSynced !== undefined) result.isSynced = info.isSynced;
    return result;
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private async requestRaw(method: string, params: unknown = {}): Promise<unknown> {
    const ws = await this.connect();
    const id = this.requestId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    });

    console.log(`[wRPC Debug] Sending payload: ${payload}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        console.log(`[wRPC Debug] Timeout for method: ${method}`);
        reject(new Error(`RPC request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const onMessage = (data: any) => {
        try {
          const raw = data.toString();
          console.log(`[wRPC Debug] Received for ${method}: ${raw}`);
          const response = JSON.parse(raw);
          if (String(response.id) === String(id)) {
            cleanup();
            if (response.error) {
              const err = response.error;
              const msg =
                ((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)) || (typeof err === "string" ? err : JSON.stringify(err));
              reject(new Error(msg));
            } else {
              resolve(response.result !== undefined ? response.result : response.params);
            }
          }
        } catch (e) {}
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        ws.removeListener("message", onMessage);
        ws.removeListener("error", onError);
      };

      ws.on("message", onMessage);
      ws.on("error", onError);
      ws.send(payload);
    });
  }

  private async connect(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return this.socket;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.rpcUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(
          new Error(
            `Cannot connect to Kaspa RPC at ${this.rpcUrl}. Connection timed out.`
          )
        );
      }, this.timeoutMs);

      ws.on("open", () => {
        clearTimeout(timeout);
        this.socket = ws;
        resolve(ws);
      });

      ws.on("error", (err: any) => {
        clearTimeout(timeout);
        let message = `Cannot connect to Kaspa RPC at ${this.rpcUrl}. Is kaspad running with --rpclisten-json?`;
        if (((err as any).code) === "ECONNREFUSED") {
          message = `Connection refused at ${this.rpcUrl}. Ensure kaspad is running and --rpclisten-json is enabled.`;
        }
        reject(new Error(message));
      });
    });
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
      raw: entry
    };
  });
}

export function mapKaspaSubmitTransactionResult(
  result: any
): KaspaSubmitTransactionResult {
  if (!result) return { raw: result };

  return {
    transactionId:
      result.transactionId || result.transaction_id || result.txId || result.tx_id,
    accepted:
      result.accepted !== undefined
        ? result.accepted
        : result.isAccepted !== undefined
          ? result.isAccepted
          : result.success !== undefined
            ? result.success
            : !!(
                result.transactionId ||
                result.transaction_id ||
                result.txId ||
                result.tx_id
              ),
    raw: result
  };
}

export class MockKaspaRpcClient implements KaspaRpcClient {
  private utxosByAddress = new Map<string, KaspaRpcUtxo[]>();

  constructor(private readonly networkId: NetworkId = "simnet" as NetworkId) {}

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
    rawTransaction: unknown
  ): Promise<KaspaSubmitTransactionResult> {
    return {
      transactionId: "mock-txid",
      accepted: true,
      raw: { rawTransaction }
    };
  }

  async getMempoolEntry(_txId: string): Promise<MempoolEntry | null> {
    return null;
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
export * from "./health.js";
export * from "./errors.js";
export * from "./provider.js";
export * from "./resilience.js";
export * from "./wrpc-client.js";

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
  submitTransaction(rawTransaction: string): Promise<KaspaSubmitTransactionResult>;
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

  async getInfo(): Promise<KaspaNodeInfo> {
    const response = await this.safeRequest(["GetInfo", "getInfo", "get_info", "getInfoRequest"]);
    const info = mapKaspaNodeInfo(response);
    
    // Try to supplement with DAG info if virtualDaaScore is missing
    if (info.virtualDaaScore === undefined) {
      try {
        const dagResponse = await this.safeRequest(["GetBlockDagInfo", "getBlockDagInfo", "get_block_dag_info"]);
        const dagData = (dagResponse as any)?.params || (dagResponse as any);
        if (dagData?.virtualDaaScore !== undefined) {
          info.virtualDaaScore = BigInt(dagData.virtualDaaScore);
        }
      } catch (e) {
        // Ignore errors supplementing info
      }
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
    const response = await this.safeRequest(
      ["GetBalancesByAddresses", "getBalancesByAddresses", "get_balances_by_addresses", "GetBalanceByAddress", "getBalanceByAddress", "get_balance_by_address"],
      { addresses: [address], address }
    );
    return mapKaspaAddressBalance(response, address);
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    const response = await this.safeRequest(
      ["GetUtxosByAddresses", "getUtxosByAddresses", "get_utxos_by_addresses", "GetUtxosByAddress", "getUtxosByAddress", "get_utxos_by_address"],
      { addresses: [address], address }
    );
    return mapKaspaRpcUtxos(response, address);
  }

  async submitTransaction(rawTransaction: string): Promise<KaspaSubmitTransactionResult> {
    const response = await this.safeRequest(
      ["SubmitTransaction", "submitTransaction", "submit_transaction"],
      { transaction: rawTransaction, transactionHex: rawTransaction, rawTransaction }
    );
    return mapKaspaSubmitTransactionResult(response);
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry | null> {
    try {
      const response = await this.safeRequest(
        ["getMempoolEntryRequest", "getMempoolEntry"],
        { txId, transactionId: txId }
      );
      if (!response) return null;
      return {
        txId,
        acceptedAt: (response as any).acceptedAt || (response as any).accepted_at
      };
    } catch (e) {
      return null;
    }
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    try {
      const response = await this.safeRequest(
        ["getTransactionRequest", "getTransaction"],
        { txId, transactionId: txId }
      );
      return response;
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

  private async safeRequest(methods: string[], params: unknown = {}): Promise<unknown> {
    let lastError: any = null;
    for (const method of methods) {
      try {
        let actualParams: any = params;
        const lowerMethod = method.toLowerCase();
        // Strict mapping based on method name
        if (lowerMethod.includes("addresses") || lowerMethod.endsWith("s")) {
           if ((params as any).address && !(params as any).addresses) {
             actualParams = { addresses: [(params as any).address] };
           } else if ((params as any).addresses) {
             actualParams = { addresses: (params as any).addresses };
           }
        } else if ((params as any).addresses && !(params as any).address) {
           actualParams = { address: (params as any).addresses[0] };
        } else if ((params as any).address) {
           actualParams = { address: (params as any).address };
        }

        // Try object params first
        try {
          return await this.request(method, actualParams);
        } catch (e: any) {
          if (e.message?.includes("deserialization")) {
            // Try array-based params as fallback for deserialization errors
            const arrayParams = Object.values(actualParams);
            return await this.request(method, arrayParams);
          }
          throw e;
        }
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    throw lastError ?? new Error(`Methods failed: ${methods.join(", ")}`);
  }

  private async request(method: string, params: unknown = {}): Promise<unknown> {
    const ws = await this.connect();
    const id = this.requestId++;
    const payload = JSON.stringify({
      id,
      method,
      params
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`RPC request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const onMessage = (data: any) => {
        try {
          const raw = data.toString();
          const response = JSON.parse(raw);
          if (String(response.id) === String(id)) {
            cleanup();
            if (response.error) {
              const err = response.error;
              const msg = err.message || (typeof err === "string" ? err : JSON.stringify(err));
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
        reject(new Error(`Cannot connect to Kaspa RPC at ${this.rpcUrl}. Connection timed out.`));
      }, this.timeoutMs);

      ws.on("open", () => {
        clearTimeout(timeout);
        this.socket = ws;
        resolve(ws);
      });

      ws.on("error", (err: any) => {
        clearTimeout(timeout);
        let message = `Cannot connect to Kaspa RPC at ${this.rpcUrl}. Is kaspad running with --rpclisten-json?`;
        if (err.code === "ECONNREFUSED") {
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
    isUtxoIndexed: result.isUtxoIndexed !== undefined ? result.isUtxoIndexed : result.is_utxo_indexed,
    p2pId: result.p2pId || result.p2p_id,
    mempoolSize: result.mempoolSize !== undefined ? result.mempoolSize : result.mempool_size,
    networkId: result.networkId || result.network_id,
    raw: result
  };

  const score = result.virtualDaaScore !== undefined ? result.virtualDaaScore : (result.virtual_daa_score !== undefined ? result.virtual_daa_score : (result.params?.virtualDaaScore));
  if (score !== undefined) {
    info.virtualDaaScore = BigInt(score);
  }

  return info;
}

export function mapKaspaAddressBalance(result: any, address: string): KaspaAddressBalance {
  if (!result) return { address, balanceSompi: 0n, raw: result };
  
  let entry = result;
  if (Array.isArray(result)) {
    entry = result.find((e: any) => (e.address || e.addressString || e.address_string) === address) || result[0];
  } else if (result.entries && Array.isArray(result.entries)) {
    entry = result.entries.find((e: any) => (e.address || e.addressString || e.address_string) === address) || result.entries[0];
  }

  const balance = entry.balance !== undefined ? entry.balance : (entry.balanceSompi !== undefined ? entry.balanceSompi : entry.amount);
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

  return (entries as any[]).map((entry: any) => {
    const utxoEntry = entry.utxoEntry || entry.utxo_entry || entry.utxo || entry;
    const outpoint = entry.outpoint || entry;

    return {
      outpoint: {
        transactionId: outpoint.transactionId || outpoint.transaction_id || outpoint.txId || outpoint.tx_id || outpoint.transaction_hash || "",
        index: Number(outpoint.index !== undefined ? outpoint.index : (outpoint.outputIndex !== undefined ? outpoint.outputIndex : outpoint.output_index))
      },
      address: entry.address || address,
      amountSompi: BigInt(utxoEntry.amount || utxoEntry.amountSompi || utxoEntry.amount_sompi || 0),
      scriptPublicKey: utxoEntry.scriptPublicKey || utxoEntry.script_public_key,
      blockDaaScore: utxoEntry.blockDaaScore || utxoEntry.block_daa_score,
      isCoinbase: utxoEntry.isCoinbase || utxoEntry.is_coinbase,
      raw: entry
    };
  });
}

export function mapKaspaSubmitTransactionResult(result: any): KaspaSubmitTransactionResult {
  if (!result) return { raw: result };

  return {
    transactionId: result.transactionId || result.transaction_id || result.txId || result.tx_id,
    accepted: result.accepted !== undefined ? result.accepted : (result.isAccepted || result.success),
    raw: result
  };
}

export class MockKaspaRpcClient implements KaspaRpcClient {
  private utxosByAddress = new Map<string, KaspaRpcUtxo[]>();

  constructor(private readonly networkId: NetworkId = "simnet" as NetworkId) {}

  async getInfo(): Promise<KaspaNodeInfo> {
    return { networkId: this.networkId, serverVersion: "mock", isSynced: true, virtualDaaScore: 0n, raw: {} };
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

  setUtxos(address: string, utxos: KaspaRpcUtxo[]): void {
    this.utxosByAddress.set(address, utxos);
  }

  async submitTransaction(rawTransaction: string): Promise<KaspaSubmitTransactionResult> {
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

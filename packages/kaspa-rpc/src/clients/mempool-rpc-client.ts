import { RpcTransport, RpcOptions } from "../transport/transport.js";
import type { 
  MempoolRpcClient,
  GetMempoolEntryRequest,
  GetMempoolEntryResponse,
  GetMempoolEntriesRequest,
  GetMempoolEntriesResponse,
  GetMempoolEntriesByAddressesRequest,
  GetMempoolEntriesByAddressesResponse,
  SubmitTransactionRequest,
  SubmitTransactionResponse,
  SubmitTransactionReplacementRequest,
  SubmitTransactionReplacementResponse
} from "../contracts/mempool.js";

/**
 * Normaliza los errores de la RPC.
 * El scope pide distinguir entre:
 * A) Error local (falló antes de red)
 * B) Error wire/rpc
 * C) Rechazo del mempool/consenso
 * Usaremos una clase base `MempoolError`.
 */
export class MempoolError extends Error {
  public layer: "sdk-validation" | "serialization" | "transport" | "rpc" | "mempool-policy" | "consensus";
  public code?: number;
  public originalData?: any;

  constructor(
    message: string,
    layer: "sdk-validation" | "serialization" | "transport" | "rpc" | "mempool-policy" | "consensus",
    code?: number,
    originalData?: any
  ) {
    super(message);
    this.name = "MempoolError";
    this.layer = layer;
    this.code = code;
    this.originalData = originalData;
  }
}

export class MempoolRpcClientImpl implements MempoolRpcClient {
  constructor(private transport: RpcTransport) {}

  private mapError(e: any): Error {
    if (e.name === "AbortError" || e.name === "RpcTimeoutError") {
      return new MempoolError(e.message, "transport", undefined, e);
    }
    
    // Si viene de RPC, intentamos categorizar. (Las categorias exactas dependen del nodo)
    if (e.message) {
      const msg = e.message.toLowerCase();
      if (msg.includes("orphan") || msg.includes("fee") || msg.includes("double spend") || msg.includes("invalid signature") || msg.includes("already exists")) {
        // En Kaspa los rechazos a la Tx a veces no tienen code sino mensaje.
        return new MempoolError(e.message, "mempool-policy", e.code, e);
      }
      if (msg.includes("not found")) {
        return new MempoolError(e.message, "rpc", e.code, e);
      }
    }
    
    return new MempoolError(e.message || "Unknown error", "rpc", e.code, e);
  }

  async getMempoolEntry(request: GetMempoolEntryRequest, options?: RpcOptions): Promise<GetMempoolEntryResponse> {
    try {
      const res = await this.transport.call("getMempoolEntryRequest", request, options);
      return res as GetMempoolEntryResponse;
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  async getMempoolEntries(request?: GetMempoolEntriesRequest, options?: RpcOptions): Promise<GetMempoolEntriesResponse> {
    try {
      const res = await this.transport.call("getMempoolEntriesRequest", request || {}, options);
      return res as GetMempoolEntriesResponse;
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  async getMempoolEntriesByAddresses(request: GetMempoolEntriesByAddressesRequest, options?: RpcOptions): Promise<GetMempoolEntriesByAddressesResponse> {
    try {
      const res = await this.transport.call("getMempoolEntriesByAddressesRequest", request, options);
      return res as GetMempoolEntriesByAddressesResponse;
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  async submitTransaction(request: SubmitTransactionRequest, options?: RpcOptions): Promise<SubmitTransactionResponse> {
    try {
      if (!request.transaction) {
         throw new MempoolError("Missing transaction payload", "sdk-validation");
      }
      const res = await this.transport.call("submitTransactionRequest", request, options);
      return res as SubmitTransactionResponse;
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  async submitTransactionReplacement(request: SubmitTransactionReplacementRequest, options?: RpcOptions): Promise<SubmitTransactionReplacementResponse> {
    try {
      if (!request.transaction) {
         throw new MempoolError("Missing transaction payload", "sdk-validation");
      }
      const res = await this.transport.call("submitTransactionReplacementRequest", request, options);
      return res as SubmitTransactionReplacementResponse;
    } catch (e: any) {
      throw this.mapError(e);
    }
  }
}

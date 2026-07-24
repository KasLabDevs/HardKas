import type { RpcOptions } from "../transport/transport.js";

export interface MempoolEntry {
  fee: bigint | string | number;
  transaction: any; // We'll type this later
  isOrphan?: boolean;
}

export interface GetMempoolEntryRequest {
  transactionId: string;
  includeOrphanPool?: boolean;
  filterTransactionPool?: boolean;
}

export interface GetMempoolEntryResponse {
  entry: MempoolEntry;
}

export interface GetMempoolEntriesRequest {
  includeOrphanPool?: boolean;
  filterTransactionPool?: boolean;
}

export interface GetMempoolEntriesResponse {
  entries: MempoolEntry[];
}

export interface GetMempoolEntriesByAddressesRequest {
  addresses: string[];
  includeOrphanPool?: boolean;
  filterTransactionPool?: boolean;
}

export interface GetMempoolEntriesByAddressesResponse {
  entries: MempoolEntry[];
}

export interface SubmitTransactionRequest {
  transaction: any; // we'll type this later
  allowOrphan?: boolean;
}

export interface SubmitTransactionResponse {
  transactionId: string;
}

export interface SubmitTransactionReplacementRequest {
  transaction: any;
  allowOrphan?: boolean;
}

export interface SubmitTransactionReplacementResponse {
  transactionId: string;
  replacedTransactionId?: string;
}

/**
 * Contrato 1:1 de Mempool de la API RPC de Kaspa.
 */
export interface MempoolRpcClient {
  getMempoolEntry(request: GetMempoolEntryRequest, options?: RpcOptions): Promise<GetMempoolEntryResponse>;
  getMempoolEntries(request?: GetMempoolEntriesRequest, options?: RpcOptions): Promise<GetMempoolEntriesResponse>;
  getMempoolEntriesByAddresses(request: GetMempoolEntriesByAddressesRequest, options?: RpcOptions): Promise<GetMempoolEntriesByAddressesResponse>;
  submitTransaction(request: SubmitTransactionRequest, options?: RpcOptions): Promise<SubmitTransactionResponse>;
  submitTransactionReplacement(request: SubmitTransactionReplacementRequest, options?: RpcOptions): Promise<SubmitTransactionReplacementResponse>;
}

import type { RpcOptions } from "../transport/transport.js";

// Basic common types
export interface RpcBlockHeader {
  version: number;
  hashMerkleRoot: string;
  acceptedIdMerkleRoot: string;
  utxoCommitment: string;
  timestamp: bigint | string | number; // usually string or number in JSON, let's normalize to bigint or string depending on implementation. Let's use string for robust parsing.
  bits: number;
  nonce: string; // uint64 can exceed safe integers
  daaScore: string;
  blueWork: string;
  blueScore: string;
  pruningPoint: string;
  parents: { parentHashes: string[] }[];
}

export interface RpcBlock {
  header: RpcBlockHeader;
  transactions: any[]; // we'll type this later when we implement tx parsing
  verboseData: RpcBlockVerboseData;
}

export interface RpcBlockVerboseData {
  hash: string;
  difficulty: number;
  selectedParentHash: string;
  transactionIds: string[];
  isHeaderOnly: boolean;
  blueScore: string;
  childrenHashes: string[];
  mergeSetBluesHashes: string[];
  mergeSetRedsHashes: string[];
  isChainBlock: boolean;
}

// -----------------------------------------------------------------
// Requests and Responses
// -----------------------------------------------------------------

export interface GetBlockRequest {
  hash: string;
  includeTransactions?: boolean;
}

export interface GetBlockResponse {
  block: RpcBlock;
}

export interface GetBlocksRequest {
  lowHash: string;
  includeBlocks?: boolean;
  includeTransactions?: boolean;
}

export interface GetBlocksResponse {
  blockHashes: string[];
  blocks?: RpcBlock[];
}

export interface GetHeadersRequest {
  startHash: string;
  limit?: number;
  isAscending?: boolean;
}

export interface GetHeadersResponse {
  headers: string[];
}

export interface GetBlockCountResponse {
  headerCount: string;
  blockCount: string;
}

export interface GetSelectedTipHashResponse {
  selectedTipHash: string;
}

export interface GetVirtualChainFromBlockRequest {
  startHash: string;
  includeAcceptedTransactionIds: boolean;
}

export interface GetVirtualChainFromBlockResponse {
  removedChainBlockHashes: string[];
  addedChainBlockHashes: string[];
  acceptedTransactionIds?: any[];
}

export interface GetCoinSupplyResponse {
  maxSompi: string;
  circulatingSompi: string;
}

export interface GetSyncStatusResponse {
  isSynced: boolean;
}

export interface GetCurrentNetworkResponse {
  currentNetwork: string;
}

/**
 * Contrato 1:1 de Lectura (Read) de la API RPC de Kaspa.
 */
export interface ReadRpcClient {
  getBlock(request: GetBlockRequest, options?: RpcOptions): Promise<GetBlockResponse>;
  getBlocks(request: GetBlocksRequest, options?: RpcOptions): Promise<GetBlocksResponse>;
  getHeaders(request: GetHeadersRequest, options?: RpcOptions): Promise<GetHeadersResponse>;
  getBlockCount(options?: RpcOptions): Promise<GetBlockCountResponse>;
  getSelectedTipHash(options?: RpcOptions): Promise<GetSelectedTipHashResponse>;
  getVirtualChainFromBlock(request: GetVirtualChainFromBlockRequest, options?: RpcOptions): Promise<GetVirtualChainFromBlockResponse>;
  getCoinSupply(options?: RpcOptions): Promise<GetCoinSupplyResponse>;
  getSyncStatus(options?: RpcOptions): Promise<GetSyncStatusResponse>;
  getCurrentNetwork(options?: RpcOptions): Promise<GetCurrentNetworkResponse>;
}

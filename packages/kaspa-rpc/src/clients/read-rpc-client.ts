import type { 
  ReadRpcClient, 
  GetBlockRequest, 
  GetBlockResponse,
  GetBlocksRequest,
  GetBlocksResponse,
  GetHeadersRequest,
  GetHeadersResponse,
  GetBlockCountResponse,
  GetSelectedTipHashResponse,
  GetVirtualChainFromBlockRequest,
  GetVirtualChainFromBlockResponse,
  GetCoinSupplyResponse,
  GetSyncStatusResponse,
  GetCurrentNetworkResponse
} from "../contracts/read.js";
import type { RpcTransport, RpcOptions } from "../transport/transport.js";

/**
 * Cliente para consultas de lectura 1:1.
 * Delega el transporte a la capa subyacente.
 */
export class ReadRpcClientImpl implements ReadRpcClient {
  constructor(private readonly transport: RpcTransport) {}

  async getBlock(request: GetBlockRequest, options?: RpcOptions): Promise<GetBlockResponse> {
    return this.transport.send<GetBlockRequest, GetBlockResponse>("getBlockRequest", request, options);
  }

  async getBlocks(request: GetBlocksRequest, options?: RpcOptions): Promise<GetBlocksResponse> {
    return this.transport.send<GetBlocksRequest, GetBlocksResponse>("getBlocksRequest", request, options);
  }

  async getHeaders(request: GetHeadersRequest, options?: RpcOptions): Promise<GetHeadersResponse> {
    return this.transport.send<GetHeadersRequest, GetHeadersResponse>("getHeadersRequest", request, options);
  }

  async getBlockCount(options?: RpcOptions): Promise<GetBlockCountResponse> {
    return this.transport.send<{}, GetBlockCountResponse>("getBlockCountRequest", {}, options);
  }

  async getSelectedTipHash(options?: RpcOptions): Promise<GetSelectedTipHashResponse> {
    return this.transport.send<{}, GetSelectedTipHashResponse>("getSelectedTipHashRequest", {}, options);
  }

  async getVirtualChainFromBlock(request: GetVirtualChainFromBlockRequest, options?: RpcOptions): Promise<GetVirtualChainFromBlockResponse> {
    return this.transport.send<GetVirtualChainFromBlockRequest, GetVirtualChainFromBlockResponse>("getVirtualChainFromBlockRequest", request, options);
  }

  async getCoinSupply(options?: RpcOptions): Promise<GetCoinSupplyResponse> {
    return this.transport.send<{}, GetCoinSupplyResponse>("getCoinSupplyRequest", {}, options);
  }

  async getSyncStatus(options?: RpcOptions): Promise<GetSyncStatusResponse> {
    return this.transport.send<{}, GetSyncStatusResponse>("getSyncStatusRequest", {}, options);
  }

  async getCurrentNetwork(options?: RpcOptions): Promise<GetCurrentNetworkResponse> {
    return this.transport.send<{}, GetCurrentNetworkResponse>("getCurrentNetworkRequest", {}, options);
  }
}

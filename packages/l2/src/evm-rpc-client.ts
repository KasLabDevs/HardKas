export interface EvmJsonRpcClientOptions {
  readonly url: string;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

export interface EvmCallRequest {
  readonly from?: string;
  readonly to?: string;
  readonly gas?: string;
  readonly gasPrice?: string;
  readonly value?: string;
  readonly data?: string;
}

export class EvmJsonRpcClient {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: EvmJsonRpcClientOptions) {
    this.url = options.url;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetcher = options.fetcher ?? globalThis.fetch;

    if (!this.fetcher) {
      throw new Error("No fetch implementation found. Ensure global fetch is available or provide a fetcher.");
    }
  }

  async callRpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = Math.floor(Math.random() * 1000000);
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const json = await response.json() as any;

      if (json.error) {
        throw new Error(`JSON-RPC error: ${json.error.message} (code: ${json.error.code})`);
      }

      return json.result as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getChainId(): Promise<number> {
    const hex = await this.callRpc<string>("eth_chainId");
    return parseInt(hex, 16);
  }

  async getBlockNumber(): Promise<bigint> {
    const hex = await this.callRpc<string>("eth_blockNumber");
    return BigInt(hex);
  }

  async getGasPriceWei(): Promise<bigint> {
    const hex = await this.callRpc<string>("eth_gasPrice");
    return BigInt(hex);
  }

  async getBalanceWei(address: string, blockTag: "latest" | "pending" = "latest"): Promise<bigint> {
    this.validateAddress(address);
    const hex = await this.callRpc<string>("eth_getBalance", [address, blockTag]);
    return BigInt(hex);
  }

  async getTransactionCount(address: string, blockTag: "latest" | "pending" = "latest"): Promise<bigint> {
    this.validateAddress(address);
    const hex = await this.callRpc<string>("eth_getTransactionCount", [address, blockTag]);
    return BigInt(hex);
  }

  async call(request: EvmCallRequest, blockTag: "latest" | "pending" = "latest"): Promise<string> {
    this.validateCallRequest(request);
    return await this.callRpc<string>("eth_call", [request, blockTag]);
  }

  async estimateGas(request: EvmCallRequest, blockTag: "latest" | "pending" = "latest"): Promise<bigint> {
    this.validateCallRequest(request);
    const hex = await this.callRpc<string>("eth_estimateGas", [request, blockTag]);
    return BigInt(hex);
  }

  async sendRawTransaction(rawTransaction: string): Promise<string> {
    this.validateHexData(rawTransaction, "rawTransaction");
    return await this.callRpc<string>("eth_sendRawTransaction", [rawTransaction]);
  }

  async getTransactionReceipt(txHash: string): Promise<any | null> {
    this.validateTxHash(txHash, "txHash");
    return await this.callRpc<any | null>("eth_getTransactionReceipt", [txHash]);
  }

  private validateTxHash(txHash: string, fieldName: string): void {
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error(`Invalid EVM ${fieldName}: must be a 0x-prefixed 64-character hex string.`);
    }
  }

  private validateCallRequest(request: EvmCallRequest): void {
    if (request.to) this.validateAddress(request.to, "to");
    if (request.from) this.validateAddress(request.from, "from");
    if (request.data) this.validateHexData(request.data, "data");
    if (request.value) this.validateHexQuantity(request.value, "value");
    if (request.gas) this.validateHexQuantity(request.gas, "gas");
    if (request.gasPrice) this.validateHexQuantity(request.gasPrice, "gasPrice");
  }

  private validateAddress(address: string, fieldName: string = "address"): void {
    if (!address || typeof address !== "string") {
      throw new Error(`Invalid ${fieldName}: must be a non-empty string.`);
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(`Invalid EVM ${fieldName}: must be a 0x-prefixed 40-character hex string.`);
    }
  }

  private validateHexData(data: string, fieldName: string): void {
    if (!/^0x([a-fA-F0-9]{2})*$/.test(data)) {
      throw new Error(`Invalid hex ${fieldName}: must be a 0x-prefixed even-length hex string.`);
    }
  }

  private validateHexQuantity(qty: string, fieldName: string): void {
    if (!/^0x[0-9a-fA-F]+$/.test(qty)) {
      throw new Error(`Invalid hex ${fieldName}: must be a 0x-prefixed hex quantity.`);
    }
  }
}

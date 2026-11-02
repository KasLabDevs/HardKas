import type { HardkasExecutionTarget } from "@hardkas/core";
import { type L2NetworkProfile } from "./profiles.js";
import { getL2Profile } from "./registry.js";
import { EvmSignerChainMismatchError, L2SafetyError } from "./errors.js";
import { assertValidChainId, parseChainIdHex, parseHexQuantity } from "./hex.js";
import { assertRawTransactionAllowed, type L2WriteOptions } from "./raw-tx-guard.js";

export { EvmSignerChainMismatchError };

export interface EvmJsonRpcClientOptions {
  readonly url?: string | undefined;
  readonly profile?: L2NetworkProfile | string | undefined;
  /** Chain ID this client is bound to. Write operations require a bound chain ID. */
  readonly expectedChainId?: number | undefined;
  /** Per-request timeout. */
  readonly timeoutMs?: number | undefined;
  readonly fetcher?: typeof fetch | undefined;
  readonly target?: HardkasExecutionTarget | undefined;
}

export interface EvmCallRequest {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly gas?: string | undefined;
  readonly gasPrice?: string | undefined;
  readonly value?: string | undefined;
  readonly data?: string | undefined;
}

export interface EvmLogFilter {
  readonly fromBlock?: string | number | bigint | undefined;
  readonly toBlock?: string | number | bigint | undefined;
  readonly address?: string | readonly string[] | undefined;
  readonly topics?: (string | string[] | null)[] | undefined;
  readonly blockHash?: string | undefined;
}

export interface EvmLogEntry {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly blockNumber?: string | undefined;
  readonly transactionHash?: string | undefined;
  readonly transactionIndex?: string | undefined;
  readonly blockHash?: string | undefined;
  readonly logIndex?: string | undefined;
  readonly removed?: boolean | undefined;
}

export class EvmJsonRpcError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(`JSON-RPC error: ${message} (code: ${code})`);
    this.name = "EvmJsonRpcError";
    this.code = code;
    this.data = data;
  }
}

export class EvmRpcTimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, originalError?: unknown) {
    super(
      `JSON-RPC request timed out after ${timeoutMs}ms${
        originalError ? `: ${String(originalError)}` : ""
      }`
    );
    this.name = "EvmRpcTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class EvmRpcInvalidResponseError extends L2SafetyError {
  constructor(message: string) {
    super("L2_RPC_RESPONSE_INVALID", `Invalid JSON-RPC response: ${message}`);
    this.name = "EvmRpcInvalidResponseError";
  }
}

let nextRequestId = 1;

/**
 * What the public generic `callRpc` may forward (default deny). Anything that can sign or
 * broadcast (eth_sendRawTransaction, eth_sendTransaction, eth_sign*, bundles, ...) is refused:
 * broadcasting goes only through the guarded `sendRawTransaction`.
 */
const READ_ONLY_ETH_METHOD =
  /^eth_(get[A-Z]\w*|call|estimateGas|chainId|blockNumber|gasPrice|feeHistory|maxPriorityFeePerGas|blobBaseFee|syncing|protocolVersion|createAccessList|simulateV1|accounts|coinbase|mining|hashrate|newFilter|newBlockFilter|newPendingTransactionFilter|uninstallFilter)$/;
const READ_ONLY_NAMESPACE_METHOD = /^(net|web3|txpool)_[A-Za-z]\w*$/;
/** Dev-node control (mine, snapshot, revert...), only on a client bound to a local chain. */
const LOCAL_DEV_NODE_METHOD = /^(anvil|evm|hardhat)_[A-Za-z]\w*$/;

export class EvmJsonRpcClient {
  public readonly url: string;
  public readonly timeoutMs: number;
  public readonly target?: HardkasExecutionTarget | undefined;
  public readonly profile?: L2NetworkProfile | undefined;
  public readonly expectedChainId?: number | undefined;
  readonly #fetcher: typeof fetch;

  constructor(options: EvmJsonRpcClientOptions) {
    let resolvedProfile: L2NetworkProfile | undefined;
    if (options.profile) {
      if (typeof options.profile === "string") {
        const found = getL2Profile(options.profile);
        if (!found) {
          throw new Error(`Unknown L2 network profile: "${options.profile}".`);
        }
        resolvedProfile = found;
      } else {
        resolvedProfile = options.profile;
      }
    }

    this.profile = resolvedProfile;
    const resolvedUrl = options.url ?? resolvedProfile?.rpcUrl;
    if (!resolvedUrl) {
      throw new Error(
        "EvmJsonRpcClient requires a valid RPC 'url' or a known 'profile' with an rpcUrl."
      );
    }
    this.url = resolvedUrl;

    const expected = options.expectedChainId ?? resolvedProfile?.chainId;
    if (expected !== undefined) assertValidChainId(expected, "expectedChainId");
    if (
      options.expectedChainId !== undefined &&
      resolvedProfile?.chainId !== undefined &&
      options.expectedChainId !== resolvedProfile.chainId
    ) {
      throw new EvmSignerChainMismatchError(resolvedProfile.chainId, options.expectedChainId);
    }
    this.expectedChainId = expected;

    this.timeoutMs =
      options.timeoutMs ?? resolvedProfile?.rpcTimeouts?.requestTimeoutMs ?? 10000;
    this.#fetcher = options.fetcher ?? globalThis.fetch;
    this.target = options.target;

    if (!this.#fetcher) {
      throw new Error(
        "No fetch implementation found. Ensure global fetch is available or provide a fetcher."
      );
    }
  }

  /** Receipt wait defaults from the bound profile (falls back to 10s / 50ms). */
  get receiptWaitDefaults(): { timeoutMs: number; intervalMs: number } {
    return {
      timeoutMs: this.profile?.rpcTimeouts?.receiptTimeoutMs ?? 10000,
      intervalMs: this.profile?.rpcTimeouts?.pollIntervalMs ?? 50
    };
  }

  /**
   * Generic JSON-RPC call for read methods (and dev-node control on a local chain).
   * Methods that can sign or broadcast are refused with L2_RPC_METHOD_FORBIDDEN before any request.
   */
  async callRpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const isLocal = this.profile?.environment === "local" || this.expectedChainId === 31337;
    const allowed =
      typeof method === "string" &&
      (READ_ONLY_ETH_METHOD.test(method) ||
        READ_ONLY_NAMESPACE_METHOD.test(method) ||
        (isLocal && LOCAL_DEV_NODE_METHOD.test(method)));
    if (!allowed) {
      throw new L2SafetyError(
        "L2_RPC_METHOD_FORBIDDEN",
        `callRpc does not forward ${JSON.stringify(method)}: only read methods (and dev-node control on a local chain). ` +
          "Broadcast with sendRawTransaction / sendRawTransactionResilient, which enforce the write guard.",
        { method }
      );
    }
    return await this.#rpc<T>(method, params);
  }

  async #rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = nextRequestId++;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    });

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    let response: Response;
    let text: string;
    try {
      response = await this.#fetcher(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal
      });
      text = await response.text();
    } catch (err: any) {
      if (
        timedOut ||
        err?.name === "AbortError" ||
        err?.name === "TimeoutError" ||
        err?.cause?.name === "AbortError" ||
        err?.cause?.name === "TimeoutError"
      ) {
        throw new EvmRpcTimeoutError(this.timeoutMs, err);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch (parseErr) {
      throw new EvmRpcInvalidResponseError(
        `Failed to parse JSON response (${String(parseErr)})`
      );
    }

    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      throw new EvmRpcInvalidResponseError("Payload is not a JSON-RPC response object");
    }
    if (json.jsonrpc !== "2.0") {
      throw new EvmRpcInvalidResponseError(
        `Unsupported jsonrpc version ${JSON.stringify(json.jsonrpc)}`
      );
    }
    if (json.id !== id) {
      throw new EvmRpcInvalidResponseError(
        `Response id ${JSON.stringify(json.id)} does not match request id ${id}`
      );
    }

    if (json.error !== undefined && json.error !== null) {
      const e = json.error;
      if (typeof e !== "object" || typeof e.code !== "number" || typeof e.message !== "string") {
        throw new EvmRpcInvalidResponseError(`Malformed error object ${JSON.stringify(e)}`);
      }
      throw new EvmJsonRpcError(e.message, e.code, e.data);
    }

    if (!("result" in json)) {
      throw new EvmRpcInvalidResponseError("Response payload missing 'result' field");
    }

    return json.result as T;
  }

  /** Chain ID reported by the RPC (strictly parsed). This is provider data, not a proof. */
  async getChainId(): Promise<number> {
    const hex = await this.#rpc<unknown>("eth_chainId");
    return parseChainIdHex(hex);
  }

  /**
   * Returns the RPC chain ID after checking it against the bound chain ID.
   * Throws L2_CHAIN_ID_REQUIRED if the client is not bound to a chain.
   */
  async assertExpectedChainId(): Promise<number> {
    if (this.expectedChainId === undefined) {
      throw new L2SafetyError(
        "L2_CHAIN_ID_REQUIRED",
        "This client is not bound to a chain ID. Pass `profile` or `expectedChainId`."
      );
    }
    const actualChainId = await this.getChainId();
    if (actualChainId !== this.expectedChainId) {
      throw new EvmSignerChainMismatchError(this.expectedChainId, actualChainId);
    }
    return actualChainId;
  }

  async getCode(
    address: string,
    blockTag: "latest" | "pending" = "latest"
  ): Promise<string> {
    this.validateAddress(address, "address");
    const code = await this.#rpc<unknown>("eth_getCode", [address, blockTag]);
    if (typeof code !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(code)) {
      throw new EvmRpcInvalidResponseError(`eth_getCode returned ${JSON.stringify(code)}`);
    }
    return code;
  }

  async getBlockNumber(): Promise<bigint> {
    return parseHexQuantity(await this.#rpc<unknown>("eth_blockNumber"), "eth_blockNumber");
  }

  /** Block hash at a height, as this node sees it (null if the node does not know the block). */
  async getBlockHashByNumber(blockNumber: bigint): Promise<string | null> {
    const block = await this.#rpc<any>("eth_getBlockByNumber", [
      `0x${blockNumber.toString(16)}`,
      false
    ]);
    if (block === null) return null;
    if (typeof block !== "object" || typeof block.hash !== "string") {
      throw new EvmRpcInvalidResponseError("eth_getBlockByNumber returned no block hash");
    }
    return block.hash;
  }

  async getGasPriceWei(): Promise<bigint> {
    return parseHexQuantity(await this.#rpc<unknown>("eth_gasPrice"), "eth_gasPrice");
  }

  async getBalanceWei(
    address: string,
    blockTag: "latest" | "pending" = "latest"
  ): Promise<bigint> {
    this.validateAddress(address);
    return parseHexQuantity(
      await this.#rpc<unknown>("eth_getBalance", [address, blockTag]),
      "eth_getBalance"
    );
  }

  async getTransactionCount(
    address: string,
    blockTag: "latest" | "pending" = "latest"
  ): Promise<bigint> {
    this.validateAddress(address);
    return parseHexQuantity(
      await this.#rpc<unknown>("eth_getTransactionCount", [address, blockTag]),
      "eth_getTransactionCount"
    );
  }

  async call(
    request: EvmCallRequest,
    blockTag: "latest" | "pending" = "latest"
  ): Promise<string> {
    this.validateCallRequest(request);
    const result = await this.#rpc<unknown>("eth_call", [request, blockTag]);
    if (typeof result !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(result)) {
      throw new EvmRpcInvalidResponseError(`eth_call returned ${JSON.stringify(result)}`);
    }
    return result;
  }

  async estimateGas(
    request: EvmCallRequest,
    blockTag: "latest" | "pending" = "latest"
  ): Promise<bigint> {
    this.validateCallRequest(request);
    return parseHexQuantity(
      await this.#rpc<unknown>("eth_estimateGas", [request, blockTag]),
      "eth_estimateGas"
    );
  }

  /**
   * Low-level broadcast. The write guard runs first (bound chain, signed chain ID, supported type,
   * mainnet authorization, fee ceilings); nothing reaches the node otherwise. There is no
   * unguarded variant.
   * Returns whatever the node answered; callers MUST compare it with keccak256(rawTransaction).
   * Prefer sendRawTransactionResilient, which does that.
   */
  async sendRawTransaction(
    rawTransaction: string,
    options: L2WriteOptions & { readonly operation?: string | undefined }
  ): Promise<unknown> {
    // The guard also validates the hex (typed L2_INVALID_TX_PARAMS, so it is never mistaken
    // for a transport failure).
    assertRawTransactionAllowed(
      rawTransaction,
      options === null || typeof options !== "object"
        ? options
        : { ...options, operation: options.operation ?? "sendRawTransaction" },
      this
    );
    return await this.#rpc<unknown>("eth_sendRawTransaction", [rawTransaction]);
  }

  async getTransactionReceipt(txHash: string): Promise<any | null> {
    this.validateTxHash(txHash, "txHash");
    const receipt = await this.#rpc<unknown>("eth_getTransactionReceipt", [txHash]);
    if (receipt !== null && (typeof receipt !== "object" || Array.isArray(receipt))) {
      throw new EvmRpcInvalidResponseError(
        `eth_getTransactionReceipt returned ${JSON.stringify(receipt)}`
      );
    }
    return receipt;
  }

  async waitForTransactionReceipt(
    txHash: string,
    options: { timeoutMs?: number | undefined; intervalMs?: number | undefined } = {}
  ): Promise<any> {
    this.validateTxHash(txHash, "txHash");
    const timeoutMs = options.timeoutMs ?? this.receiptWaitDefaults.timeoutMs;
    const intervalMs = options.intervalMs ?? this.receiptWaitDefaults.intervalMs;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const receipt = await this.getTransactionReceipt(txHash);
      if (receipt !== null) {
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new EvmRpcTimeoutError(
      timeoutMs,
      new Error(`Transaction receipt for ${txHash} not found within ${timeoutMs}ms`)
    );
  }

  async getLogs(filter: EvmLogFilter = {}): Promise<EvmLogEntry[]> {
    const params: any = {};
    if (filter.fromBlock !== undefined) {
      params.fromBlock =
        typeof filter.fromBlock === "bigint" || typeof filter.fromBlock === "number"
          ? `0x${filter.fromBlock.toString(16)}`
          : filter.fromBlock;
    }
    if (filter.toBlock !== undefined) {
      params.toBlock =
        typeof filter.toBlock === "bigint" || typeof filter.toBlock === "number"
          ? `0x${filter.toBlock.toString(16)}`
          : filter.toBlock;
    }
    if (filter.address !== undefined) {
      params.address = filter.address;
    }
    if (filter.topics !== undefined) {
      params.topics = filter.topics;
    }
    if (filter.blockHash !== undefined) {
      params.blockHash = filter.blockHash;
    }

    const logs = await this.#rpc<unknown>("eth_getLogs", [params]);
    if (!Array.isArray(logs)) {
      throw new EvmRpcInvalidResponseError("eth_getLogs did not return an array");
    }
    return logs as EvmLogEntry[];
  }

  async getLogsChunked(
    filter: EvmLogFilter & { readonly chunkSize?: number | undefined } = {}
  ): Promise<EvmLogEntry[]> {
    const chunkSize = BigInt(filter.chunkSize ?? 2000);
    if (chunkSize <= 0n) throw new Error("chunkSize must be > 0");
    if (filter.blockHash) {
      return await this.getLogs(filter);
    }

    let fromBlock = 0n;
    if (filter.fromBlock !== undefined) {
      if (typeof filter.fromBlock === "bigint") fromBlock = filter.fromBlock;
      else if (typeof filter.fromBlock === "number") fromBlock = BigInt(filter.fromBlock);
      else if (typeof filter.fromBlock === "string" && filter.fromBlock.startsWith("0x")) {
        fromBlock = BigInt(filter.fromBlock);
      }
    }

    let toBlock: bigint;
    if (
      filter.toBlock !== undefined &&
      filter.toBlock !== "latest" &&
      filter.toBlock !== "pending"
    ) {
      if (typeof filter.toBlock === "bigint") toBlock = filter.toBlock;
      else if (typeof filter.toBlock === "number") toBlock = BigInt(filter.toBlock);
      else if (typeof filter.toBlock === "string" && filter.toBlock.startsWith("0x")) {
        toBlock = BigInt(filter.toBlock);
      } else {
        toBlock = await this.getBlockNumber();
      }
    } else {
      toBlock = await this.getBlockNumber();
    }

    if (fromBlock >= toBlock || toBlock - fromBlock <= chunkSize) {
      return await this.getLogs({
        ...filter,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`
      });
    }

    const allLogs: EvmLogEntry[] = [];
    const seen = new Set<string>();
    let currentStart = fromBlock;

    while (currentStart <= toBlock) {
      const currentEnd =
        currentStart + chunkSize - 1n > toBlock ? toBlock : currentStart + chunkSize - 1n;
      const chunkLogs = await this.getLogs({
        ...filter,
        fromBlock: `0x${currentStart.toString(16)}`,
        toBlock: `0x${currentEnd.toString(16)}`
      });

      for (const log of chunkLogs) {
        if ((log as any).removed) continue;
        const key = `${log.blockHash ?? ""}-${log.transactionHash ?? ""}-${log.logIndex ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          allLogs.push(log);
        }
      }
      currentStart = currentEnd + 1n;
    }

    return allLogs;
  }

  private validateTxHash(txHash: string, fieldName: string): void {
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error(
        `Invalid EVM ${fieldName}: must be a 0x-prefixed 64-character hex string.`
      );
    }
  }

  private validateCallRequest(request: EvmCallRequest): void {
    if (request.to !== undefined) this.validateAddress(request.to, "to");
    if (request.from !== undefined) this.validateAddress(request.from, "from");
    if (request.data !== undefined) this.validateHexData(request.data, "data");
    if (request.value !== undefined) this.validateHexQuantity(request.value, "value");
    if (request.gas !== undefined) this.validateHexQuantity(request.gas, "gas");
    if (request.gasPrice !== undefined) this.validateHexQuantity(request.gasPrice, "gasPrice");
  }

  private validateAddress(address: string, fieldName: string = "address"): void {
    if (!address || typeof address !== "string") {
      throw new Error(`Invalid ${fieldName}: must be a non-empty string (required).`);
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(
        `Invalid EVM ${fieldName}: must be a 0x-prefixed 40-character hex string.`
      );
    }
  }

  private validateHexData(data: string, fieldName: string): void {
    if (!/^0x([a-fA-F0-9]{2})*$/.test(data)) {
      throw new Error(
        `Invalid hex ${fieldName}: must be a 0x-prefixed even-length hex string.`
      );
    }
  }

  private validateHexQuantity(qty: string, fieldName: string): void {
    if (!/^0x[0-9a-fA-F]+$/.test(qty)) {
      throw new Error(`Invalid hex ${fieldName}: must be a 0x-prefixed hex quantity.`);
    }
  }
}

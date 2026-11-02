import { HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";

/**
 * L2-EXT stage 6 · JSON-RPC to the local node only. The URL must be http://127.0.0.1:<port> (refused otherwise, even if
 * a caller built it), and only the methods a local development flow needs are sent: no anvil_* state surgery, no raw
 * transactions, no signing of arbitrary data.
 */
export const LOCAL_RPC_METHODS = [
  "eth_chainId",
  "eth_accounts",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBalance",
  "eth_getCode",
  "eth_gasPrice",
  "eth_call",
  "eth_estimateGas",
  "eth_sendTransaction",
  "eth_getTransactionReceipt"
] as const;
export type LocalRpcMethod = (typeof LOCAL_RPC_METHODS)[number];

/** A JSON-RPC error answered by the node (e.g. a revert: `data` carries the revert payload). */
export class LocalRpcError extends HardkasCliError {
  constructor(
    readonly rpcCode: number,
    readonly rpcMessage: string,
    readonly data: unknown
  ) {
    super("L2_RPC_ERROR", `the local node answered an error ${rpcCode}: ${rpcMessage}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
}

export class LocalRpc {
  private id = 0;
  constructor(
    readonly url: string,
    private readonly timeoutMs = 15_000
  ) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new HardkasCliError("L2_ENDPOINT_NOT_LOCAL", `not a URL: ${url}`, { exitCode: HardkasExitCode.USAGE_ERROR });
    }
    if (u.protocol !== "http:" || u.hostname !== "127.0.0.1" || !u.port || u.pathname !== "/" || u.username || u.password) {
      throw new HardkasCliError("L2_ENDPOINT_NOT_LOCAL", `${url} is not the local node (http://127.0.0.1:<port>); nothing was sent`, {
        exitCode: HardkasExitCode.USAGE_ERROR
      });
    }
  }

  async request<T = unknown>(method: LocalRpcMethod, params: unknown[]): Promise<T> {
    if (!(LOCAL_RPC_METHODS as readonly string[]).includes(method)) {
      throw new HardkasCliError("L2_RPC_METHOD_FORBIDDEN", `${method} is not sent to the local node`, { exitCode: HardkasExitCode.USAGE_ERROR });
    }
    let res: Response;
    const id = ++this.id;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error"
      });
    } catch (e: any) {
      throw new HardkasCliError("L2_RPC_FAILED", `${method} to ${this.url} failed: ${e?.cause?.message ?? e?.message ?? String(e)}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    }
    if (!res.ok) throw new HardkasCliError("L2_RPC_FAILED", `${method} to ${this.url}: HTTP ${res.status}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new HardkasCliError("L2_RPC_FAILED", `${method} to ${this.url}: the answer is not JSON-RPC`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    }
    // F-06 (independent audit): the answer must be JSON-RPC 2.0 and answer THIS request
    if (!body || typeof body !== "object" || body.jsonrpc !== "2.0" || body.id !== id) {
      throw new HardkasCliError("L2_RPC_FAILED", `${method} to ${this.url}: the answer is not a JSON-RPC 2.0 response to request ${id} (jsonrpc ${JSON.stringify(body?.jsonrpc)}, id ${JSON.stringify(body?.id)})`, {
        exitCode: HardkasExitCode.RUNTIME_FAILURE
      });
    }
    if (body?.error) throw new LocalRpcError(Number(body.error.code), String(body.error.message ?? ""), body.error.data);
    if (!body || !("result" in body)) throw new HardkasCliError("L2_RPC_FAILED", `${method} to ${this.url}: no result in the answer`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    return body.result as T;
  }
}

import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { normalizeRpcError, RpcConnectionError, RpcError, RpcNotFoundError, RpcTimeoutError } from "../errors.js";
import { toOfficialTransaction, toWire, u64FieldsToBigint } from "./wire.js";
import { useWsWebSocketForSdk } from "./node-websocket-compat.js";

/*
 * The official kaspa-wasm RpcClient is HardKAS's only Kaspa RPC transport. This
 * session is the thin layer over it: a lazy fail-fast connection, method names,
 * timeouts, typed errors and format conversion (./wire.ts). Everything above it
 * (the HardKAS clients, retries, failover, mocks) keeps its own interface.
 */

/** The part of the official `RpcClient` HardKAS drives. Tests substitute a stand-in through `OfficialRpcFactory`. */
export interface OfficialRpcClientLike {
  readonly isConnected?: boolean;
  connect(options?: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  addEventListener(event: string, callback: (event: any) => void): void;
  removeEventListener(event: string, callback?: (event: any) => void): void;
  [method: string]: any;
}

export type OfficialRpcFactory = (url: string) => OfficialRpcClientLike;

/** The pinned official SDK's RpcClient, JSON encoding (the node's `--rpclisten-json` endpoint). */
export const officialRpcFactory: OfficialRpcFactory = (url) => {
  const k = loadManagedKaspaWasmSync();
  // Node/Windows compatibility, not transport: see node-websocket-compat.ts.
  useWsWebSocketForSdk();
  return new k.RpcClient({ url, encoding: k.Encoding.SerdeJson });
};

/** wRPC endpoints are WebSocket URLs: http(s):// maps to ws(s)://, a bare host:port gets ws://. */
export function toWrpcUrl(url: string): string {
  if (url.startsWith("http://")) return "ws://" + url.slice("http://".length);
  if (url.startsWith("https://")) return "wss://" + url.slice("https://".length);
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url;
  return `ws://${url}`;
}

// HardKAS names that the node serves under another name.
const METHOD_ALIASES: Record<string, string> = {
  getVirtualSelectedParentBlueScore: "getSinkBlueScore",
  getBlockHeaders: "getHeaders"
};

/** "getBlockDagInfoRequest" and "getBlockDagInfo" both name the official `getBlockDagInfo`. */
export function officialMethodName(method: string): string {
  const bare = method.endsWith("Request") ? method.slice(0, -"Request".length) : method;
  return METHOD_ALIASES[bare] ?? bare;
}

// HardKAS request shapes the official client takes in another form.
const REQUEST_TRANSLATORS: Record<string, (params: any) => unknown> = {
  submitTransaction: (p) => ({
    transaction: toOfficialTransaction(p?.transaction),
    allowOrphan: Boolean(p?.allowOrphan ?? p?.allow_orphan ?? false)
  }),
  submitBlock: (p) => ({ block: u64FieldsToBigint(p?.block), allowNonDAABlocks: Boolean(p?.allowNonDAABlocks ?? false) })
};

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The node's own text from an official remote error ("RPC Server (remote error) -> code:0 message:`…` data:None"). */
export function nodeMessage(raw: string): string {
  const m = /message:`([\s\S]*?)`/.exec(raw);
  return m ? m[1]! : raw;
}

const NOT_CONNECTED = /WebSocket is not connected|Unable to connect|not connected/i;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Releases an official client; never throws (its binding may throw synchronously as well as reject). */
async function release(client: OfficialRpcClientLike): Promise<void> {
  try {
    await client.disconnect();
  } catch {
    // nothing left to release
  }
}

/** A connection closed while it was being opened: not retryable, its owner closed it on purpose. */
export function rpcClientClosedError(url: string): RpcError {
  return new RpcError(`The Kaspa RPC connection to ${url} was closed while it was being opened.`, "RPC_CLIENT_CLOSED", undefined, false);
}

export class OfficialRpcSession {
  readonly url: string;
  private client: OfficialRpcClientLike | null = null;
  private connecting: Promise<OfficialRpcClientLike> | null = null;
  // RESOURCE-LIFECYCLE-1 (RL-I4): every close() starts a new epoch. A connection whose opening began in an earlier
  // epoch never becomes the session's client: open() releases it as soon as it is established.
  private epoch = 0;
  private closing: Promise<void> | null = null;

  constructor(
    url: string,
    private readonly timeoutMs: number = 30000,
    private readonly factory: OfficialRpcFactory = officialRpcFactory
  ) {
    this.url = toWrpcUrl(url);
  }

  /** The client of the current connection, if there is one. */
  current(): OfficialRpcClientLike | null {
    return this.client;
  }

  /** The connected official client; connects on first use and again after the node went away. */
  async connected(): Promise<OfficialRpcClientLike> {
    if (this.client && this.client.isConnected !== false) return this.client;
    if (!this.connecting) {
      const connecting: Promise<OfficialRpcClientLike> = this.open().finally(() => {
        if (this.connecting === connecting) this.connecting = null;
      });
      this.connecting = connecting;
    }
    return this.connecting;
  }

  private async open(): Promise<OfficialRpcClientLike> {
    const epoch = this.epoch;
    const stale = this.client;
    this.client = null;
    if (stale) await release(stale);
    const client = this.factory(this.url);
    try {
      await withTimeout(
        client.connect({ blockAsyncConnect: true, strategy: "fallback", timeoutDuration: this.timeoutMs }),
        this.timeoutMs + 1000,
        () => new RpcConnectionError(`Cannot connect to Kaspa RPC at ${this.url}. Connection timed out.`)
      );
    } catch (e) {
      await release(client);
      if (e instanceof RpcConnectionError) throw e;
      throw new RpcConnectionError(`Cannot connect to Kaspa RPC at ${this.url}. Is kaspad running with --rpclisten-json? (${messageOf(e)})`);
    }
    if (epoch !== this.epoch) {
      // close() ran while this connection was being opened: it is released here and never handed out.
      await release(client);
      throw rpcClientClosedError(this.url);
    }
    this.client = client;
    return client;
  }

  /** One RPC call by HardKAS method name; the result is plain JSON data in the node's wire shape. */
  async request<T = unknown>(method: string, params?: unknown, timeoutMs: number = this.timeoutMs): Promise<T> {
    const name = officialMethodName(method);
    const translate = REQUEST_TRANSLATORS[name];
    const request = translate ? translate(params) : (params ?? {});
    const client = await this.connected();
    const fn = client[name];
    if (typeof fn !== "function") {
      throw new RpcNotFoundError(`Kaspa RPC method not found: ${method}`, -32601);
    }
    try {
      const result = await withTimeout(
        Promise.resolve(fn.call(client, request)),
        timeoutMs,
        () => new RpcTimeoutError(`RPC request ${name} timed out after ${timeoutMs}ms`)
      );
      return toWire(result) as T;
    } catch (e) {
      if (e instanceof RpcError) throw e;
      const raw = messageOf(e);
      if (NOT_CONNECTED.test(raw)) {
        // Drop the dead client (the next call opens a new one) and release what it still holds.
        if (this.client === client) this.client = null;
        await release(client);
        throw new RpcConnectionError(`Connection to Kaspa RPC at ${this.url} was lost: ${raw}`);
      }
      const err = new Error(nodeMessage(raw));
      throw normalizeRpcError(err, { method: name, params });
    }
  }

  /**
   * Releases the connection, including one still being opened (RL-I4). That one is not interrupted mid-handshake (the
   * `ws` WebSocket under the official client raises an unhandled 'error' when closed before it is established): it is
   * established or times out, open() releases it, and only then does close() return. Idempotent, also when calls
   * overlap; never throws. A later request opens a new connection, which a later close() releases.
   */
  async close(): Promise<void> {
    this.epoch++;
    const client = this.client;
    const connecting = this.connecting;
    const previous = this.closing;
    this.client = null;
    this.connecting = null;
    const closing = (async () => {
      if (client) await release(client);
      if (connecting) await connecting.catch(() => {});
      if (previous) await previous;
    })();
    this.closing = closing;
    try {
      await closing;
    } finally {
      if (this.closing === closing) this.closing = null;
    }
  }
}

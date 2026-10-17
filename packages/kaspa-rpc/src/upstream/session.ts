import { loadManagedKaspaWasmSync, redactUrlCredentials, redactUrlCredentialsInText } from "@hardkas/core";
import {
  isNodeNetworkIdentityError,
  markRequestNotSent,
  NodeNetworkIdentityError,
  normalizeRpcError,
  RpcRequestNotSentError,
  RpcConnectionError,
  RpcError,
  RpcNotFoundError,
  RpcTimeoutError
} from "../errors.js";
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

/**
 * A message naming the endpoint, without its credentials: userinfo and secret-named query parameters (the
 * EVIDENCE-TRUST-1 boundary). The official client's own text repeats the URL as given, so the whole text is redacted
 * (SECURITY-INTEGRATION-1).
 */
const redacted = (text: string): string => redactUrlCredentialsInText(text);

/** A network id as the node and HardKAS spell it, compared exactly: case-insensitive, `kaspa-` prefix ignored. */
function canonicalNetworkId(id: string): string {
  return id.trim().toLowerCase().replace(/^kaspa-/, "");
}

/** A connection closed while it was being opened: not retryable, its owner closed it on purpose. */
export function rpcClientClosedError(url: string): RpcError {
  return new RpcError(`The Kaspa RPC connection to ${redactUrlCredentials(url)} was closed while it was being opened.`, "RPC_CLIENT_CLOSED", undefined, false);
}

export class OfficialRpcSession {
  readonly url: string;
  private client: OfficialRpcClientLike | null = null;
  private connecting: Promise<OfficialRpcClientLike> | null = null;
  // RESOURCE-LIFECYCLE-1 (RL-I4): every close() starts a new epoch. A connection whose opening began in an earlier
  // epoch never becomes the session's client: open() releases it as soon as it is established.
  private epoch = 0;
  private closing: Promise<void> | null = null;
  // NODE-NETWORK-IDENTITY-1 (SECURITY-INTEGRATION-1): the client whose CURRENT connection said it serves the expected
  // network. The official client reconnects by itself when the node behind its URL comes back; a "disconnect" clears
  // this, so the connection it resumes on is verified again before anything is asked of it.
  private verifiedClient: OfficialRpcClientLike | null = null;
  private verifying: Promise<OfficialRpcClientLike> | null = null;
  private readonly disconnects = new WeakMap<OfficialRpcClientLike, number>();

  /**
   * @param expectedNetworkId NODE-NETWORK-IDENTITY-1: the network the caller uses this node as. When given, every
   * connection this session opens (the first one and each one after the node went away) asks the node which network
   * it serves before it is handed out, and is released and refused when the node answers another network
   * (NODE_NETWORK_MISMATCH) or none (NODE_NETWORK_UNKNOWN). A verdict is never carried from one connection to the
   * next, and a session serves one URL only.
   */
  constructor(
    url: string,
    private readonly timeoutMs: number = 30000,
    private readonly factory: OfficialRpcFactory = officialRpcFactory,
    private readonly expectedNetworkId?: string | undefined
  ) {
    this.url = toWrpcUrl(url);
  }

  /** The client of the current connection, if there is one. */
  current(): OfficialRpcClientLike | null {
    return this.client;
  }

  /** The connected official client; connects on first use and again after the node went away. */
  async connected(): Promise<OfficialRpcClientLike> {
    if (this.client && this.client.isConnected !== false) {
      if (this.expectedNetworkId === undefined || this.verifiedClient === this.client) return this.client;
      // the official client resumed on a new connection by itself (the node went away and something answers again
      // behind the URL): that connection is verified like any other before it is used
      if (!this.verifying) {
        const verifying: Promise<OfficialRpcClientLike> = this.reverify(this.client).finally(() => {
          if (this.verifying === verifying) this.verifying = null;
        });
        this.verifying = verifying;
      }
      return this.verifying;
    }
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
        () => new RpcConnectionError(redacted(`Cannot connect to Kaspa RPC at ${this.url}. Connection timed out.`))
      );
    } catch (e) {
      await release(client);
      if (e instanceof RpcConnectionError) throw e;
      throw new RpcConnectionError(redacted(`Cannot connect to Kaspa RPC at ${this.url}. Is kaspad running with --rpclisten-json? (${messageOf(e)})`));
    }
    if (this.expectedNetworkId !== undefined) {
      try {
        // registered before the question: a drop while it is asked is not lost
        this.disconnects.set(client, 0);
        client.addEventListener("disconnect", () => {
          this.disconnects.set(client, (this.disconnects.get(client) ?? 0) + 1);
          if (this.verifiedClient === client) this.verifiedClient = null;
        });
        await this.verifyNetwork(client, this.expectedNetworkId);
      } catch (e) {
        await release(client);
        throw e;
      }
    }
    if (epoch !== this.epoch) {
      // close() ran while this connection was being opened: it is released here and never handed out.
      await release(client);
      throw rpcClientClosedError(this.url);
    }
    if (this.expectedNetworkId !== undefined && (this.disconnects.get(client) ?? 0) !== 0) {
      // the connection dropped while its network was being asked: whatever it resumed on did not answer the question
      await release(client);
      throw this.lostWhileVerifying();
    }
    this.client = client;
    if (this.expectedNetworkId !== undefined) this.verifiedClient = client;
    return client;
  }

  private lostWhileVerifying(): RpcConnectionError {
    return new RpcConnectionError(
      redacted(`Connection to Kaspa RPC at ${this.url} was lost while its network was being verified; nothing was asked of it.`)
    );
  }

  /**
   * The current client resumed on a new connection: verified again, released and refused like a first connection. Every
   * caller that arrived meanwhile waits for this one verification; none is handed the client before it, and a connection
   * that drops again while it is asked is a connection failure (never handed out unverified).
   */
  private async reverify(client: OfficialRpcClientLike): Promise<OfficialRpcClientLike> {
    const epoch = this.epoch;
    const dropsBefore = this.disconnects.get(client) ?? 0;
    const discard = async () => {
      if (this.client === client) this.client = null;
      if (this.verifiedClient === client) this.verifiedClient = null;
      await release(client);
    };
    try {
      await this.verifyNetwork(client, this.expectedNetworkId!);
    } catch (e) {
      await discard();
      throw e;
    }
    if (epoch !== this.epoch) throw rpcClientClosedError(this.url);
    if ((this.disconnects.get(client) ?? 0) !== dropsBefore || this.client !== client) {
      await discard();
      throw this.lostWhileVerifying();
    }
    this.verifiedClient = client;
    return client;
  }

  /**
   * NODE-NETWORK-IDENTITY-1: the node's own answer to getServerInfo decides. A connection lost or timed out while
   * asking stays a connection failure; a node that answers without a network, or refuses the question, is UNKNOWN;
   * a node that names another network is a MISMATCH.
   */
  private async verifyNetwork(client: OfficialRpcClientLike, expected: string): Promise<void> {
    const endpoint = redactUrlCredentials(this.url);
    let info: any;
    try {
      const fn = client["getServerInfo"];
      if (typeof fn !== "function") throw new Error("the client offers no getServerInfo");
      info = toWire(
        await withTimeout(
          Promise.resolve(fn.call(client, {})),
          this.timeoutMs,
          () => new RpcTimeoutError(`RPC request getServerInfo timed out after ${this.timeoutMs}ms while verifying the network of ${endpoint}`)
        )
      );
    } catch (e) {
      if (e instanceof RpcError) throw e;
      const raw = messageOf(e);
      if (NOT_CONNECTED.test(raw)) {
        throw new RpcConnectionError(redacted(`Connection to Kaspa RPC at ${endpoint} was lost while its network was being verified: ${raw}`));
      }
      throw new NodeNetworkIdentityError(
        "NODE_NETWORK_UNKNOWN",
        redacted(
          `The node at ${endpoint} did not say which network it serves (getServerInfo failed: ${nodeMessage(raw)}); ` +
            `HardKAS expected ${expected} and uses nothing from it.`
        ),
        { expected, endpoint }
      );
    }
    const observed = info?.networkId;
    if (typeof observed !== "string" || observed.trim() === "" || observed === "undefined") {
      throw new NodeNetworkIdentityError(
        "NODE_NETWORK_UNKNOWN",
        `The node at ${endpoint} did not say which network it serves (getServerInfo has no networkId); ` +
          `HardKAS expected ${expected} and uses nothing from it.`,
        { expected, endpoint }
      );
    }
    if (canonicalNetworkId(observed) !== canonicalNetworkId(expected)) {
      throw new NodeNetworkIdentityError(
        "NODE_NETWORK_MISMATCH",
        `The node at ${endpoint} serves ${observed}, not ${expected}: HardKAS refuses to read from it or send to it as ${expected}.`,
        { expected, observed, endpoint }
      );
    }
  }

  /** One RPC call by HardKAS method name; the result is plain JSON data in the node's wire shape. */
  async request<T = unknown>(method: string, params?: unknown, timeoutMs: number = this.timeoutMs): Promise<T> {
    const name = officialMethodName(method);
    // TX-SEND-BLOCKED-OUTCOME-1: for a submission, everything up to handing the request to the transport is local — a
    // failure there means the transaction certainly never left this process, which is not the same as a lost answer.
    const isSubmit = name === "submitTransaction";
    const notSent = (stage: string, e: unknown) =>
      new RpcRequestNotSentError(redacted(`submitTransaction was not sent (${stage}): ${messageOf(e)}`), e);
    const translate = REQUEST_TRANSLATORS[name];
    let request: unknown;
    let client: OfficialRpcClientLike;
    try {
      request = translate ? translate(params) : (params ?? {});
      client = await this.connected();
    } catch (e) {
      // the request could not be prepared or no connection could be opened: it keeps its own type and code (and the
      // node's identity refusal stays NODE-NETWORK-IDENTITY-1's), MARKED as raised before the transport
      if (!isSubmit || isNodeNetworkIdentityError(e)) throw e;
      throw markRequestNotSent(e);
    }
    const fn = client[name];
    if (typeof fn !== "function") {
      const missing = new RpcNotFoundError(`Kaspa RPC method not found: ${method}`, -32601);
      throw isSubmit ? markRequestNotSent(missing) : missing;
    }
    try {
      const result = await withTimeout(
        Promise.resolve(fn.call(client, request)),
        timeoutMs,
        () => new RpcTimeoutError(`RPC request ${name} timed out after ${timeoutMs}ms`)
      );
      return toWire(result) as T;
    } catch (e) {
      // an interceptor in front of the transport refused the submission (code RPC_REQUEST_NOT_SENT): nothing left
      if (isSubmit && (e as { code?: unknown } | null)?.code === "RPC_REQUEST_NOT_SENT" && !(e instanceof RpcRequestNotSentError)) {
        throw notSent("refused before the transport", e);
      }
      if (e instanceof RpcError) throw e;
      const raw = messageOf(e);
      if (NOT_CONNECTED.test(raw)) {
        // Drop the dead client (the next call opens a new one) and release what it still holds.
        if (this.client === client) this.client = null;
        await release(client);
        throw new RpcConnectionError(redacted(`Connection to Kaspa RPC at ${this.url} was lost: ${raw}`));
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
    this.verifiedClient = null;
    this.verifying = null;
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

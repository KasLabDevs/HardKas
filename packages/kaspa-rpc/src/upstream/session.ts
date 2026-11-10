import {
  loadManagedKaspaWasmSync,
  redactUrlCredentials,
  redactUrlCredentialsInText,
  assertValidNodeEndpoint,
  isMainnetNetworkId,
  mainnetConnectionDisabledMessage,
  MAINNET_CONNECTIONS_ENABLED
} from "@hardkas/core";
import {
  isNodeNetworkIdentityError,
  markRequestNotSent,
  NodeNetworkIdentityError,
  NodeSyncError,
  normalizeRpcError,
  RpcRequestNotSentError,
  RpcConnectionError,
  RpcError,
  RpcNotFoundError,
  RpcTimeoutError
} from "../errors.js";
import { toOfficialTransaction, toWire, u64FieldsToBigint } from "./wire.js";
import { useWsWebSocketForSdk } from "./node-websocket-compat.js";
import { canonicalNetworkId, decideBroadcastIdentity, namedNetwork } from "../broadcast-identity.js";

/** MAINNET-PERIMETER-1: the official methods that put a transaction on the network. */
const BROADCAST_METHODS: ReadonlySet<string> = new Set(["submitTransaction", "submitTransactionReplacement"]);

/** RPC-SUBMIT-SAFETY-1: whether a HardKAS method name (any spelling: `submitTransactionRequest`…) is a broadcast. */
export function isBroadcastMethod(method: string): boolean {
  return BROADCAST_METHODS.has(officialMethodName(method));
}

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

/**
 * wRPC endpoints are WebSocket URLs: http(s):// maps to ws(s)://, a bare host:port gets ws://. ENDPOINT-VALIDATION-1:
 * a malformed endpoint is refused here (NETWORK_ENDPOINT_INVALID), so no client is ever created for it and nothing
 * connects — it used to become `ws://<text>`.
 */
export function toWrpcUrl(url: string): string {
  assertValidNodeEndpoint(url, "Kaspa RPC endpoint");
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

// A network id as the node and HardKAS spell it, compared exactly: the one rule in ../broadcast-identity.ts
// (case-insensitive, `kaspa-` prefix ignored, HardKAS's `simulated` alias = simnet).

/** A connection closed while it was being opened: not retryable, its owner closed it on purpose. */
export function rpcClientClosedError(url: string): RpcError {
  return new RpcError(`The Kaspa RPC connection to ${redactUrlCredentials(url)} was closed while it was being opened.`, "RPC_CLIENT_CLOSED", undefined, false);
}

/*
 * MAINNET TOTAL LOCKDOWN (@hardkas/core mainnet-policy) · the transport's share of the common layer. Every HardKAS
 * client of a Kaspa node (JsonWrpcKaspaClient, KaspaWrpcClient, KaspaJsonRpcClient, the health checks, the SDK's own,
 * one a caller builds directly) goes through this session, so:
 *  1. a session whose caller uses the node AS a mainnet network refuses before an official client is even created —
 *     zero connections (MAINNET_CONNECTION_DISABLED);
 *  2. every connection the session opens (the first and each one the official client resumes on by itself) asks the
 *     node ONE question before anything else — getServerInfo — also when the caller expects no network; a node that
 *     answers mainnet is released and refused (MAINNET_CONNECTION_DISABLED), whatever the caller expected, and nothing
 *     else is asked of it. That single identity exchange is the unavoidable limit when an endpoint is declared as
 *     another network (or given raw): only the node can say what it serves;
 *  3. an identity answer seen later on the same connection (a caller's own getServerInfo / getBlockDagInfo /
 *     getCurrentNetwork, the identity reads before a broadcast) that names mainnet drops the connection the same way.
 * A raw session (no expected network) whose node does not say which network it serves keeps working as before: that
 * node cannot be shown to be mainnet, and a node that hides or lies about its network is the same documented limit.
 */
function mainnetConnectionError(endpoint: string, detail: { expected?: string | undefined; observed?: string | undefined }): NodeNetworkIdentityError {
  const contacted = detail.observed !== undefined ? "identity-only" : "nothing";
  const context =
    detail.observed !== undefined
      ? `the node at ${endpoint} says it serves ${detail.observed}${detail.expected !== undefined ? `, used as ${detail.expected}` : ""}`
      : `${endpoint}, used as ${detail.expected}`;
  return new NodeNetworkIdentityError("MAINNET_CONNECTION_DISABLED", mainnetConnectionDisabledMessage(context, contacted), {
    expected: detail.expected ?? "a non-mainnet network",
    ...(detail.observed !== undefined ? { observed: detail.observed } : {}),
    endpoint
  });
}

/** The network an identity-bearing answer names (getServerInfo / getBlockDagInfo / getCurrentNetwork), if any. */
function identityNamedBy(method: string, answer: any): string | undefined {
  const pick = (...values: unknown[]) => values.find((v): v is string => typeof v === "string" && v.trim() !== "");
  if (method === "getServerInfo") return pick(answer?.networkId);
  if (method === "getBlockDagInfo") return pick(answer?.network, answer?.networkName, answer?.networkId);
  if (method === "getCurrentNetwork") return pick(answer?.network, answer?.networkId);
  return undefined;
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
  // MAINNET TOTAL LOCKDOWN: once the node behind this session's URL said it serves mainnet, the session never connects
  // again (a later request, a retry or a poll would otherwise open a new connection only to be refused once more)
  private mainnetObserved: string | undefined;

  /**
   * @param expectedNetworkId NODE-NETWORK-IDENTITY-1: the network the caller uses this node as. When given, every
   * connection this session opens (the first one and each one after the node went away) asks the node which network
   * it serves before it is handed out, and is released and refused when the node answers another network
   * (NODE_NETWORK_MISMATCH) or none (NODE_NETWORK_UNKNOWN). A verdict is never carried from one connection to the
   * next, and a session serves one URL only. MAINNET TOTAL LOCKDOWN: a mainnet-type `expectedNetworkId` is refused
   * before any connection, and without one the node is still asked its network once per connection (see above).
   */
  constructor(
    url: string,
    private readonly timeoutMs: number = 30000,
    private readonly factory: OfficialRpcFactory = officialRpcFactory,
    private readonly expectedNetworkId?: string | undefined,
    // INT9-A (I-3b): with an expected network, also refuse a node that does not say it is synced (NODE_NOT_SYNCED), from
    // the same getServerInfo answer: for the operations that need the current chain state (plan, send, wait)
    private readonly requireSynced: boolean = false
  ) {
    this.url = toWrpcUrl(url);
  }

  /** The client of the current connection, if there is one. */
  current(): OfficialRpcClientLike | null {
    return this.client;
  }

  /** The connected official client; connects on first use and again after the node went away. */
  async connected(): Promise<OfficialRpcClientLike> {
    // MAINNET TOTAL LOCKDOWN (1): used as a mainnet network → refused before any official client exists (0 connections)
    if (!MAINNET_CONNECTIONS_ENABLED && isMainnetNetworkId(this.expectedNetworkId)) {
      throw mainnetConnectionError(redactUrlCredentials(this.url), { expected: this.expectedNetworkId });
    }
    if (this.mainnetObserved !== undefined) {
      throw mainnetConnectionError(redactUrlCredentials(this.url), { expected: this.expectedNetworkId, observed: this.mainnetObserved });
    }
    if (this.client && this.client.isConnected !== false) {
      if (this.verifiedClient === this.client) return this.client;
      // the official client resumed on a new connection by itself (the node went away and something answers again
      // behind the URL): that connection is verified like any other before it is used (MAINNET TOTAL LOCKDOWN (2):
      // also when the caller expects no network — the node's identity is asked again)
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
    // NODE-NETWORK-IDENTITY-1 / MAINNET TOTAL LOCKDOWN (2): every connection is identified before it is handed out —
    // against the expected network when there is one, and never mainnet in any case
    try {
      // registered before the question: a drop while it is asked is not lost
      this.disconnects.set(client, 0);
      if (typeof client.addEventListener === "function") {
        client.addEventListener("disconnect", () => {
          this.disconnects.set(client, (this.disconnects.get(client) ?? 0) + 1);
          if (this.verifiedClient === client) this.verifiedClient = null;
        });
      }
      await this.verifyNetwork(client, this.expectedNetworkId);
    } catch (e) {
      await release(client);
      throw e;
    }
    if (epoch !== this.epoch) {
      // close() ran while this connection was being opened: it is released here and never handed out.
      await release(client);
      throw rpcClientClosedError(this.url);
    }
    if ((this.disconnects.get(client) ?? 0) !== 0) {
      // the connection dropped while its network was being asked: whatever it resumed on did not answer the question
      await release(client);
      throw this.lostWhileVerifying();
    }
    this.client = client;
    this.verifiedClient = client;
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
      await this.verifyNetwork(client, this.expectedNetworkId);
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
   * MAINNET TOTAL LOCKDOWN (2): asked on every connection, `expected` or not; a node that names a network of the
   * mainnet type is refused first (MAINNET_CONNECTION_DISABLED), whatever was expected. Without an expected network, a
   * node that does not identify itself is not refused (nothing shows it is mainnet; see the note above).
   */
  private async verifyNetwork(client: OfficialRpcClientLike, expected: string | undefined): Promise<void> {
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
      if (expected === undefined) return;
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
    if (!MAINNET_CONNECTIONS_ENABLED && isMainnetNetworkId(observed)) {
      this.mainnetObserved = observed;
      throw mainnetConnectionError(endpoint, { expected, observed });
    }
    if (typeof observed !== "string" || observed.trim() === "" || observed === "undefined") {
      if (expected === undefined) return;
      throw new NodeNetworkIdentityError(
        "NODE_NETWORK_UNKNOWN",
        `The node at ${endpoint} did not say which network it serves (getServerInfo has no networkId); ` +
          `HardKAS expected ${expected} and uses nothing from it.`,
        { expected, endpoint }
      );
    }
    if (expected === undefined) return;
    if (canonicalNetworkId(observed) !== canonicalNetworkId(expected)) {
      throw new NodeNetworkIdentityError(
        "NODE_NETWORK_MISMATCH",
        `The node at ${endpoint} serves ${observed}, not ${expected}: HardKAS refuses to read from it or send to it as ${expected}.`,
        { expected, observed, endpoint }
      );
    }
    // INT9-A (I-3b): the network is right; being synced is a separate verdict, asked only by callers that need it
    if (this.requireSynced && info?.isSynced !== true) {
      const said = info?.isSynced === false ? "says it is not synced" : "did not say whether it is synced";
      throw new NodeSyncError(
        `NODE_NOT_SYNCED: the node at ${endpoint} serves ${observed} but ${said}: an operation that needs the current chain state ` +
          `uses nothing from it (a well-identified node is not a synced node). Let it sync (a local node with no peers needs ` +
          `recent blocks), then retry; nothing was sent.`,
        { endpoint, expected, isSynced: typeof info?.isSynced === "boolean" ? info.isSynced : undefined }
      );
    }
  }

  /**
   * MAINNET-PERIMETER-1 (B1/B2): the node's two identity answers, read now on `client`, decided by
   * `decideBroadcastIdentity` against the expected network (when this session has one). A read that fails says nothing
   * (NODE_NETWORK_UNKNOWN); a connection lost meanwhile stays a connection failure. Nothing is sent before this passes.
   */
  private async verifyBroadcastIdentity(client: OfficialRpcClientLike): Promise<void> {
    const endpoint = redactUrlCredentials(this.url);
    const ask = async (method: "getServerInfo" | "getBlockDagInfo"): Promise<any> => {
      const fn = client[method];
      if (typeof fn !== "function") return undefined;
      try {
        return toWire(
          await withTimeout(
            Promise.resolve(fn.call(client, {})),
            this.timeoutMs,
            () => new RpcTimeoutError(`RPC request ${method} timed out after ${this.timeoutMs}ms while identifying ${endpoint} before a broadcast`)
          )
        );
      } catch (e) {
        const raw = messageOf(e);
        if (NOT_CONNECTED.test(raw)) {
          throw new RpcConnectionError(redacted(`Connection to Kaspa RPC at ${endpoint} was lost while it was identified before a broadcast; nothing was sent: ${raw}`));
        }
        return undefined;
      }
    };
    const server = await ask("getServerInfo");
    const dag = await ask("getBlockDagInfo");
    decideBroadcastIdentity({
      server: namedNetwork(server?.networkId),
      dag: namedNetwork(dag?.network ?? dag?.networkName ?? dag?.networkId),
      expected: this.expectedNetworkId,
      endpoint
    });
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
    // MAINNET-PERIMETER-1: every client of this transport (the SDK's, an injected one, an exported one used directly)
    // asks the node who it is on THIS connection right before a broadcast; see broadcast-identity.ts. An identity
    // refusal keeps its type (NODE-NETWORK-IDENTITY-1); a connection lost during those reads is MARKED as raised before
    // the transport (TX-SEND-BLOCKED-OUTCOME-1): the broadcast itself never started.
    if (BROADCAST_METHODS.has(name)) {
      try {
        await this.verifyBroadcastIdentity(client);
      } catch (e) {
        // MAINNET TOTAL LOCKDOWN (3): a node that now says mainnet is not asked anything else on this connection
        if ((e as { code?: unknown } | null)?.code === "MAINNET_BROADCAST_DISABLED") {
          const said = (e as { identity?: { observed?: unknown } }).identity?.observed;
          if (typeof said === "string" && isMainnetNetworkId(said)) this.mainnetObserved = said;
          await this.drop(client);
        }
        if (isNodeNetworkIdentityError(e)) throw e;
        throw markRequestNotSent(e);
      }
    }
    let wire: unknown;
    try {
      const result = await withTimeout(
        Promise.resolve(fn.call(client, request)),
        timeoutMs,
        () => new RpcTimeoutError(`RPC request ${name} timed out after ${timeoutMs}ms`)
      );
      wire = toWire(result);
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
    // MAINNET TOTAL LOCKDOWN (3): an identity answer that names mainnet on a connection identified as something else
    // (the node changed what it says): the connection is dropped and the answer never reaches the caller
    const named = identityNamedBy(name, wire);
    if (!MAINNET_CONNECTIONS_ENABLED && isMainnetNetworkId(named)) {
      this.mainnetObserved = named;
      await this.drop(client);
      throw mainnetConnectionError(redactUrlCredentials(this.url), { expected: this.expectedNetworkId, observed: named });
    }
    return wire as T;
  }

  /** Forgets and releases a client that must not be asked anything else (a later request opens a new connection). */
  private async drop(client: OfficialRpcClientLike): Promise<void> {
    if (this.client === client) this.client = null;
    if (this.verifiedClient === client) this.verifiedClient = null;
    await release(client);
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

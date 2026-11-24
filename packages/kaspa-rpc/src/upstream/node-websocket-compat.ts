import { createRequire } from "node:module";

/*
 * Node/Windows compatibility shim for the official kaspa-wasm SDK. It is not an
 * RPC transport: the SDK's RpcClient still opens and drives the connection; this
 * only chooses which W3C `WebSocket` implementation the SDK finds on `globalThis`.
 *
 * Why: kaspa-wasm opens its connection through the global W3C `WebSocket`. With
 * Node's built-in one, Node aborts at `process.exit` on Windows once a process has
 * opened and closed a few connections:
 *   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
 * Measured 2026-09-28 with the bare SDK (kaspa-wasm 2.1.0, Node 24.15, no HardKAS
 * code): 4 or more sequential connect/disconnect cycles, then `process.exit(0)`,
 * abort every time (exit code -1073740791); with `ws` as the global, 0 of 16 runs.
 * HardKAS's CLI ends every command with `process.exit`, so a command that opens a
 * few connections (health polling, for one) would fail after succeeding.
 *
 * What: as kaspa-wasm's own Node instructions do, the SDK gets a W3C WebSocket from
 * the `ws` package. The global is replaced only if it is still the one this module
 * saw when it loaded, so an implementation the host installed later is kept.
 * Each socket also gets an explicit message-size limit (SDK_WEBSOCKET_MAX_PAYLOAD_BYTES
 * below), and an answer refused for its size is recorded so the session can type it.
 *
 * Retire it when the upstream combination is fixed: delete this module, its call in
 * `session.ts` (officialRpcFactory), and the `ws` dependency of @hardkas/kaspa-rpc.
 * Re-check with the bare SDK first (N sequential RpcClient connect/disconnect, then
 * process.exit, on Windows).
 */

// The global WebSocket as it was when this module loaded.
const hostWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
let applied = false;

/**
 * RPC-RESPONSE-TOO-LARGE-1: the largest message (bytes) a socket made here accepts from a node — 100 MiB, `ws`'s own
 * default, set explicitly so the limit is deliberate and checkable. kaspa-wasm asks for 1 GiB (the 6th argument of the
 * `websocket` package's constructor, its clientConfig), but `ws` reads three arguments, so that request never applied.
 * Not raised: near this size one getUtxosByAddresses answer (~277,000 UTXOs of one address, ~378 bytes each) already
 * costs about a minute of blocked CPU and over 1 GB of memory in the official client (LFU probe, 21-oct-2026), and
 * V8's string limit (~512 MiB) would be the next wall. A larger answer is refused at its header and the connection
 * dropped (close 1009); the session reports it as RPC_RESPONSE_TOO_LARGE (errors.ts, RpcResponseTooLargeError).
 */
export const SDK_WEBSOCKET_MAX_PAYLOAD_BYTES = 100 * 1024 * 1024;

// RPC-RESPONSE-TOO-LARGE-1: answers refused for their size, counted per process and remembered per URL (the latest
// count), so a session can tell that the disconnect which failed its request followed such a refusal on its endpoint.
let oversizedReplies = 0;
const lastOversizedReplyByUrl = new Map<string, number>();

function urlKey(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/** RPC-RESPONSE-TOO-LARGE-1: a mark to take right before a request (see oversizedReplySince). */
export function oversizedReplyMark(): number {
  return oversizedReplies;
}

/** RPC-RESPONSE-TOO-LARGE-1: whether a socket to `url` refused an answer for its size after `mark` was taken. */
export function oversizedReplySince(mark: number, url: string): boolean {
  const last = lastOversizedReplyByUrl.get(urlKey(url));
  return last !== undefined && last > mark;
}

/**
 * KASPA-WASM-WS-ERROR-1 (found by MULTINODE-READ-1 on a real simnet node that stopped answering): `ws` emits 'error' as
 * an EventEmitter event, and kaspa-wasm closes a socket still connecting (a node that does not complete the handshake
 * within the connect timeout) without a listener for it, so ws's "WebSocket was closed before the connection was
 * established" was unhandled and ended the process. Every socket gets a no-op 'error' listener: kaspa-wasm's own
 * handler still receives the error when it has one, and the attempt fails as the session types it (timeout, connection).
 *
 * RPC-RESPONSE-TOO-LARGE-1: every socket gets SDK_WEBSOCKET_MAX_PAYLOAD_BYTES as its `maxPayload` (kaspa-wasm calls
 * `new WebSocket(url, undefined, undefined, undefined, undefined, clientConfig)`; `ws` takes (url, protocols, options)),
 * and an answer it refuses for its size (ws's WS_ERR_UNSUPPORTED_MESSAGE_LENGTH, which closes with 1009; the socket's
 * own close event then says 1006) is recorded for its URL before kaspa-wasm rejects the pending request with its
 * generic "WebSocket disconnected".
 */
function guardedWebSocket(WsWebSocket: new (...args: any[]) => { on(event: string, listener: (...args: any[]) => void): unknown }) {
  return class GuardedWebSocket extends WsWebSocket {
    constructor(...args: any[]) {
      const [address, second, third] = args;
      // ws's own reading of its arguments: an object in the protocols' place is its options
      const optionsFirst = second !== null && typeof second === "object" && !Array.isArray(second);
      const protocols = optionsFirst ? undefined : second;
      const given = optionsFirst ? second : third;
      const options = given !== null && typeof given === "object" ? given : {};
      super(address, protocols, { ...options, maxPayload: SDK_WEBSOCKET_MAX_PAYLOAD_BYTES });
      const key = urlKey(String(address));
      this.on("error", (e: { code?: unknown } | null | undefined) => {
        if (e?.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") lastOversizedReplyByUrl.set(key, ++oversizedReplies);
      });
    }
  };
}

/** Gives the SDK `ws`'s WebSocket, once per process, unless the global was replaced after load. */
export function useWsWebSocketForSdk(): void {
  if (applied) return;
  applied = true;
  const g = globalThis as { WebSocket?: unknown };
  if (g.WebSocket !== hostWebSocket) return;
  g.WebSocket = guardedWebSocket(createRequire(import.meta.url)("ws").WebSocket);
}

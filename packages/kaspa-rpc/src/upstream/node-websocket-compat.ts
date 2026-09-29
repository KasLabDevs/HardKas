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
 *
 * Retire it when the upstream combination is fixed: delete this module, its call in
 * `session.ts` (officialRpcFactory), and the `ws` dependency of @hardkas/kaspa-rpc.
 * Re-check with the bare SDK first (N sequential RpcClient connect/disconnect, then
 * process.exit, on Windows).
 */

// The global WebSocket as it was when this module loaded.
const hostWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
let applied = false;

/** Gives the SDK `ws`'s WebSocket, once per process, unless the global was replaced after load. */
export function useWsWebSocketForSdk(): void {
  if (applied) return;
  applied = true;
  const g = globalThis as { WebSocket?: unknown };
  if (g.WebSocket !== hostWebSocket) return;
  g.WebSocket = createRequire(import.meta.url)("ws").WebSocket;
}

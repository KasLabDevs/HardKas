import { describe, it, expect, afterAll } from "vitest";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { JsonWrpcKaspaClient } from "../src/index.js";

// -----------------------------------------------------------------------------
// KASPA-WASM-WS-ERROR-1 (found by MULTINODE-READ-1 on a real simnet node paused by its operator): a node that accepts
// the TCP connection and never completes the WebSocket handshake made the official client close a socket still
// connecting; `ws` emitted "WebSocket was closed before the connection was established" with no listener, and the
// process died (an uncaught 'error' event) instead of reporting the node as unreachable. Now the call fails, typed, and
// the process goes on. Real kaspa-wasm client; a loopback TCP server that never answers.
// -----------------------------------------------------------------------------

const held: net.Socket[] = [];
const server = net.createServer((socket) => {
  held.push(socket); // accepted, never answered: no HTTP upgrade, no close
});
afterAll(async () => {
  for (const s of held) s.destroy();
  await new Promise<void>((r) => server.close(() => r()));
});

describe("KASPA-WASM-WS-ERROR-1 · a node that never completes the handshake", () => {
  it("WS-1 the request fails with a typed error and the process survives; a second client fails the same way", async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const attempt of [1, 2]) {
      const client = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 1500 });
      let error: any;
      try {
        await client.getServerInfo();
      } catch (e) {
        error = e;
      } finally {
        await client.close().catch(() => {});
      }
      expect(error, `attempt ${attempt}: the call did not fail`).toBeDefined();
      expect(String(error?.name ?? ""), `attempt ${attempt}: ${String(error?.message)}`).toMatch(/^Rpc/);
    }
    // give a late 'error' event from the closed sockets the time to surface (it would fail the run as unhandled)
    await new Promise((r) => setTimeout(r, 1500));
  }, 30_000);
});

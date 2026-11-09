import { describe, it, expect, afterAll } from "vitest";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { checkKaspaRpcHealth, waitForKaspaRpcReady } from "../src/health";

// -----------------------------------------------------------------------------
// MAINNET TOTAL LOCKDOWN · RC2 oracle O7. `checkKaspaRpcHealth` had no network parameter: a caller that knew the URL was
// mainnet could not avoid the identity exchange (one connection, getServerInfo). With `expectedNetworkId` a mainnet
// network (any spelling) is refused before any connection, and `waitForKaspaRpcReady` returns that refusal at once
// instead of polling to `maxWaitMs` (waiting cannot change a refusal). The "node" is a loopback socket that counts
// connections; nothing else is contacted.
// -----------------------------------------------------------------------------

const servers: net.Server[] = [];
afterAll(async () => {
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
});

async function counter(): Promise<{ url: (scheme: string) => string; connections: () => number }> {
  let n = 0;
  const server = net.createServer((socket) => {
    n += 1;
    socket.destroy();
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  return { url: (scheme) => `${scheme}://127.0.0.1:${port}`, connections: () => n };
}

describe("MAINNET TOTAL LOCKDOWN · O7 · the health check takes the network it uses the node as", () => {
  for (const scheme of ["ws", "http"]) {
    it(`${scheme}: expectedNetworkId mainnet in any spelling — not ready, MAINNET_CONNECTION_DISABLED, zero connections`, async () => {
      const c = await counter();
      for (const spelling of ["mainnet", "kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET"]) {
        const r = await checkKaspaRpcHealth({ url: c.url(scheme), expectedNetworkId: spelling, timeoutMs: 1000 });
        expect(r.ready, JSON.stringify(r)).toBe(false);
        expect(`${r.error ?? ""} ${r.lastError ?? ""}`, JSON.stringify(r)).toMatch(/MAINNET_CONNECTION_DISABLED/);
      }
      expect(c.connections()).toBe(0);
    });

    it(`${scheme}: waitForKaspaRpcReady returns the refusal at once (never polls to maxWaitMs), zero connections`, async () => {
      const c = await counter();
      const started = Date.now();
      const r = await waitForKaspaRpcReady({ url: c.url(scheme), expectedNetworkId: "mainnet", intervalMs: 250, maxWaitMs: 30_000, timeoutMs: 1000 });
      expect(Date.now() - started, JSON.stringify(r)).toBeLessThan(5_000);
      expect(r.ready, JSON.stringify(r)).toBe(false);
      expect(`${r.error ?? ""} ${r.lastError ?? ""}`, JSON.stringify(r)).toMatch(/MAINNET_CONNECTION_DISABLED/);
      expect(c.connections()).toBe(0);
    });
  }

  it("control: without a mainnet network the check does connect (the counter sees it)", async () => {
    const c = await counter();
    const r = await checkKaspaRpcHealth({ url: c.url("ws"), expectedNetworkId: "simnet", timeoutMs: 1000 });
    expect(r.ready).toBe(false);
    expect(c.connections()).toBeGreaterThan(0);
  });
});

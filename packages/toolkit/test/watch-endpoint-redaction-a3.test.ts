import { describe, it, expect, vi, afterEach } from "vitest";

// A3 (rc2 audit) · `WalletToolkit.watch()` on a node that does not answer within 30 s threw
// `WALLET_WATCH_NODE_UNREACHABLE … at ${rpcUrl}` with the full endpoint (user:password@, ?api_key=…). Now the endpoint is
// redacted. kaspa-wasm's RpcClient is a stand-in whose connect never completes; the 30 s bound runs on fake timers.

vi.mock("@hardkas/core", async () => {
  const actual: any = await vi.importActual("@hardkas/core");
  class NeverConnects {
    connect() {
      return new Promise(() => {});
    }
    async disconnect() {}
  }
  return { ...actual, loadManagedKaspaWasmSync: () => ({ RpcClient: NeverConnects, Encoding: { SerdeJson: 1 } }) };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("A3 · the wallet watch never puts endpoint credentials in its errors", () => {
  it("WALLET_WATCH_NODE_UNREACHABLE names the host, never user:pass or the api_key", async () => {
    vi.useFakeTimers();
    const { UtxoWatchEngine } = await import("../src/watch.js");
    const engine = new UtxoWatchEngine("wss://alice:s3cr3t-pass@node.example:443/?api_key=K3Y-VALUE", async () => "kaspatest:qtest");
    const started = engine.start().then(
      () => "",
      (e: any) => `${e?.code} ${String(e?.message ?? e)}`
    );
    await vi.advanceTimersByTimeAsync(30_001);
    const message = await started;
    expect(message).toMatch(/^WALLET_WATCH_NODE_UNREACHABLE /);
    expect(message).toMatch(/node\.example/);
    expect(message).not.toMatch(/alice|s3cr3t-pass|K3Y-VALUE/);
  });
});

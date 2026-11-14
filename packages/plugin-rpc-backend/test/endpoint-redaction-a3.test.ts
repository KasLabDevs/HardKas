import { describe, it, expect, vi } from "vitest";

// A3 (rc2 audit) · a balance/UTXO read on a node without a UTXO index threw `RPC Node at ${options.url} …` with the full
// endpoint, so `user:password@` and `?api_key=…` reached application logs. Now the endpoint (and the node's own message)
// is redacted as everywhere else. The HTTP client is a stand-in that fails like a node without a UTXO index.

const SECRET_URL = "http://alice:s3cr3t-pass@127.0.0.1:1/rpc?api_key=K3Y-VALUE&net=simnet";
vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class StandInHttpClient {
    constructor(private readonly o: { url: string }) {}
    async getBalanceByAddress(): Promise<never> {
      throw new Error(`node at ${this.o.url} does not have UTXO index`);
    }
    async getUtxosByAddress(): Promise<never> {
      throw new Error(`node at ${this.o.url} does not have UTXO index`);
    }
    async healthCheck() {
      return {};
    }
    async close() {}
  }
  return { ...actual, KaspaJsonRpcClient: StandInHttpClient };
});

async function messageOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
  return "";
}

describe("A3 · plugin-rpc-backend never puts endpoint credentials in its errors", () => {
  it("balance() and utxos() on a node without a UTXO index: the message names the host, never user:pass or the api_key", async () => {
    const { kaspaRpcBackendPlugin } = await import("../src/index.js");
    const backend = kaspaRpcBackendPlugin({ url: SECRET_URL, resilience: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, jitter: false } });
    for (const read of [() => backend.balance!("kaspasim:qtest"), () => backend.utxos!("kaspasim:qtest")]) {
      const message = await messageOf(read());
      expect(message).toMatch(/does not have UTXO index/);
      expect(message).toMatch(/127\.0\.0\.1:1/);
      expect(message).not.toMatch(/alice|s3cr3t-pass|K3Y-VALUE/);
    }
  });
});

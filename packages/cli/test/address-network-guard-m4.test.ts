import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { runRpcUtxos } from "../src/runners/rpc-utxos-runner.js";

// AUDIT 2026-11-21 · M4 · the address is judged BEFORE any connection: a loopback listener counts connections.
describe("M4 · rpc utxos refuses a wrong-network address before contacting the node", () => {
  const listen = () =>
    new Promise<{ port: number; hits: () => number; close: () => void }>((resolve) => {
      let n = 0;
      const s = createServer((sock) => { n++; sock.destroy(); });
      s.listen(0, "127.0.0.1", () => resolve({ port: (s.address() as any).port, hits: () => n, close: () => s.close() }));
    });

  it("AN-1 a kaspatest: address with expected simnet → ADDRESS_NETWORK_MISMATCH, zero connections", async () => {
    const node = await listen();
    try {
      await expect(runRpcUtxos({ address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", url: `ws://127.0.0.1:${node.port}`, expectedNetworkId: "simnet" })).rejects.toMatchObject({ code: "ADDRESS_NETWORK_MISMATCH" });
      expect(node.hits()).toBe(0);
    } finally { node.close(); }
  });

  it("AN-2 a mainnet address with no expected network → refused as mainnet, zero connections", async () => {
    const node = await listen();
    try {
      await expect(runRpcUtxos({ address: "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", url: `ws://127.0.0.1:${node.port}` })).rejects.toThrow(/mainnet/i);
      expect(node.hits()).toBe(0);
    } finally { node.close(); }
  });
});

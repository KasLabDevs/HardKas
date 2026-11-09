import { describe, it, expect } from "vitest";
import { JsonWrpcKaspaClient } from "../src/index.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

// INT9-A (found by the malicious-endpoint matrix) · an endpoint whose getServerInfo answer the official client cannot
// decode (here: a field rusty-kaspad always sends is missing) made JsonWrpcKaspaClient.getServerInfo fall back to
// getInfo, whose networkId enrichment called getServerInfo again: an endless getServerInfo/getInfo loop. Every identity
// probe (Silver, artifact verify, localnet) then hung forever while hammering the endpoint. The fallback must be one
// bounded read that ends with an answer or an error.

function brokenServerInfoNode() {
  const fake = fakeOfficialRpc({
    getServerInfo: () => {
      throw new Error("RPC Server (remote error) -> RPC serde deserialization error: missing field `isSynced`");
    },
    getInfo: () => ({ p2pId: "x", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true }),
    getBlockDagInfo: () => ({ virtualDaaScore: 7n, tipHashes: [] })
  });
  return { fake, methods: () => fake.calls.map((c) => c.method) };
}

describe("INT9-A · getServerInfo's fallback is bounded", () => {
  it("a getServerInfo that cannot be decoded ends after a bounded number of reads (no getServerInfo/getInfo loop)", async () => {
    const { fake, methods } = brokenServerInfoNode();
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:26399", rpcFactory: fake.factory, timeoutMs: 2000 });
    const outcome = await Promise.race([
      client.getServerInfo().then(
        (v) => ({ kind: "answer", v }),
        (e) => ({ kind: "error", e })
      ),
      new Promise((r) => setTimeout(() => r({ kind: "hung" }), 3000))
    ]);
    expect((outcome as any).kind).not.toBe("hung");
    // MAINNET TOTAL LOCKDOWN: the session now asks every connection its identity once (getServerInfo) before anything
    // else, also without an expected network; an answer it cannot decode identifies nothing (not refused, nothing shows
    // mainnet). So: the identity read + the caller's own read — still bounded, still no loop (it was exactly 1)
    expect(methods().filter((m) => m === "getServerInfo").length).toBe(2);
    expect(methods().length).toBeLessThanOrEqual(4);
    // whatever it returns, it never names a network the node did not name
    if ((outcome as any).kind === "answer") expect((outcome as any).v.networkId).toBe("unknown");
    await client.close();
  });
});

import { describe, it, expect } from "vitest";
import { toWrpcUrl } from "../src/upstream/session.js";
import { JsonWrpcKaspaClient } from "../src/index.js";
import { KaspaWrpcClient } from "../src/wrpc-client.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

// ENDPOINT-VALIDATION-1: the RPC clients themselves refuse a malformed endpoint (defence in depth below the config
// authority): no official client is created for it, no connection is attempted, and the refusal is typed
// (NETWORK_ENDPOINT_INVALID). Valid forms are normalized as before (http(s) → ws(s), a bare host:port gets ws://).

const outcome = async (fn: () => unknown) => {
  try {
    return { ok: true, value: await fn() } as any;
  } catch (e: any) {
    return { ok: false, code: e?.code, message: String(e?.message ?? e) } as any;
  }
};

describe("ENDPOINT-VALIDATION-1 · the RPC clients refuse a malformed endpoint before connecting", () => {
  for (const url of ["not-a-url", "http//127.0.0.1:18210", "ws://", "ws://127.0.0.1:99999", "ftp://127.0.0.1:1", " ws://127.0.0.1:1"]) {
    it(`toWrpcUrl(${JSON.stringify(url)}) → NETWORK_ENDPOINT_INVALID`, async () => {
      expect((await outcome(() => toWrpcUrl(url))).code).toBe("NETWORK_ENDPOINT_INVALID");
    });

    it(`JsonWrpcKaspaClient on ${JSON.stringify(url)}: refused, the official client is never created`, async () => {
      const rpc = fakeOfficialRpc({ getServerInfo: () => ({ networkId: "testnet-10" }) });
      const r = await outcome(async () => new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: rpc.factory } as any).getServerInfo());
      expect(r.ok).toBe(false);
      expect(r.code).toBe("NETWORK_ENDPOINT_INVALID");
      expect(rpc.urls).toEqual([]);
      expect(rpc.connects).toBe(0);
    });

    it(`KaspaWrpcClient on ${JSON.stringify(url)}: refused at construction`, async () => {
      expect((await outcome(() => new KaspaWrpcClient(url))).code).toBe("NETWORK_ENDPOINT_INVALID");
    });
  }

  it("control: valid forms are normalized as before", () => {
    expect(toWrpcUrl("http://127.0.0.1:16110")).toBe("ws://127.0.0.1:16110");
    expect(toWrpcUrl("https://node.example:443/x")).toBe("wss://node.example:443/x");
    expect(toWrpcUrl("127.0.0.1:18210")).toBe("ws://127.0.0.1:18210");
    expect(toWrpcUrl("wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json")).toBe("wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json");
  });

  it("control: a valid endpoint still reaches the (stand-in) node", async () => {
    const rpc = fakeOfficialRpc({ getServerInfo: () => ({ networkId: "testnet-10", serverVersion: "2.1.0", isSynced: true }) });
    const r = await outcome(async () => new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:17110", rpcFactory: rpc.factory } as any).getServerInfo());
    expect(r.ok).toBe(true);
    expect(rpc.urls).toEqual(["ws://127.0.0.1:17110"]);
  });
});

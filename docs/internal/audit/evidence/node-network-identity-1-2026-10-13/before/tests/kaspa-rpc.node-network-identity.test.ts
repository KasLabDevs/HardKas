import { describe, it, expect } from "vitest";
import { OfficialRpcSession } from "../src/upstream/session.js";
import { JsonWrpcKaspaClient, KaspaJsonRpcClient, KaspaWrpcClient, RpcConnectionError } from "../src/index.js";
import { fakeOfficialRpc, nodeError } from "./helpers/fake-official-rpc.js";

// -----------------------------------------------------------------------------
// NODE-NETWORK-IDENTITY-1 (2026-10-13). A session that is told which network it serves asks the node which network
// it is (getServerInfo) on EVERY connection it opens, before any request of the caller reaches the node, and refuses
// a node that answers another network (NODE_NETWORK_MISMATCH) or no network (NODE_NETWORK_UNKNOWN). A connection
// that cannot be opened stays a connection failure. Without an expectation nothing changes (no extra call).
// Reproduced live before the fix (L1-REALITY-1 E2 V1/V1m, E2b): balances, plans and a send went to a node that said
// simnet or mainnet while HardKAS labelled everything testnet-10.
// -----------------------------------------------------------------------------

const UTXOS = { entries: [] };

/** A node whose network can change between connections (a restart behind the same URL). */
function nodeClaiming(initial: unknown) {
  const state = { networkId: initial as unknown, serverInfoError: undefined as unknown };
  const fake = fakeOfficialRpc({
    getServerInfo: () => {
      if (state.serverInfoError !== undefined) throw state.serverInfoError;
      return state.networkId === undefined
        ? { rpcApiVersion: 1, serverVersion: "2.1.0", hasUtxoIndex: true, isSynced: true, virtualDaaScore: 7n }
        : { rpcApiVersion: 1, serverVersion: "2.1.0", networkId: state.networkId, hasUtxoIndex: true, isSynced: true, virtualDaaScore: 7n };
    },
    getUtxosByAddresses: () => UTXOS,
    getBlockDagInfo: () => ({ virtualDaaScore: 7n, tipHashes: [] }),
    submitTransaction: () => ({ transactionId: "ab".repeat(32) })
  });
  return { fake, state, methods: () => fake.calls.map((c) => c.method) };
}

const session = (fake: ReturnType<typeof fakeOfficialRpc>, expectedNetworkId?: string, url = "ws://127.0.0.1:28210") =>
  new (OfficialRpcSession as any)(url, 2000, fake.factory, expectedNetworkId) as OfficialRpcSession;

async function failure(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a failure, the call succeeded");
}

describe("NODE-NETWORK-IDENTITY-1 · the session verifies the node's network before using it", () => {
  it("a node of the expected network is used normally, identity asked once per connection", async () => {
    const { fake, methods } = nodeClaiming("testnet-10");
    const s = session(fake, "testnet-10");
    await s.request("getUtxosByAddresses", { addresses: ["kaspatest:q"] });
    await s.request("getBlockDagInfo");
    expect(methods()).toEqual(["getServerInfo", "getUtxosByAddresses", "getBlockDagInfo"]);
    await s.close();
  });

  it("a simnet node presented as testnet-10 is refused before any request reaches it", async () => {
    const { fake, methods } = nodeClaiming("simnet");
    const s = session(fake, "testnet-10");
    const e = await failure(s.request("getUtxosByAddresses", { addresses: ["kaspatest:q"] }));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
    expect(e.isRetriable).toBe(false);
    expect(e.data).toMatchObject({ expected: "testnet-10", observed: "simnet" });
    expect(String(e.message)).toMatch(/testnet-10/);
    expect(String(e.message)).toMatch(/simnet/);
    expect(methods()).toEqual(["getServerInfo"]);
    await s.close();
  });

  it("a mainnet node presented as testnet-10 is refused, a submitTransaction never reaches it", async () => {
    const { fake, methods } = nodeClaiming("mainnet");
    const s = session(fake, "testnet-10");
    // a well-formed request (the session converts it, storage mass included, before it connects)
    const transaction = { version: 0, inputs: [], outputs: [], lockTime: "0", subnetworkId: "00".repeat(20), gas: "0", payload: "", storageMass: "0" };
    const e = await failure(s.request("submitTransaction", { transaction }));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
    expect(e.data).toMatchObject({ expected: "testnet-10", observed: "mainnet" });
    expect(methods()).not.toContain("submitTransaction");
  });

  it("a node that does not say which network it is: NODE_NETWORK_UNKNOWN, nothing used", async () => {
    const { fake, methods } = nodeClaiming(undefined);
    const s = session(fake, "testnet-10");
    const e = await failure(s.request("getUtxosByAddresses", { addresses: ["kaspatest:q"] }));
    expect(e.code).toBe("NODE_NETWORK_UNKNOWN");
    expect(e.isRetriable).toBe(false);
    expect(methods()).toEqual(["getServerInfo"]);
  });

  it("a node that refuses getServerInfo: NODE_NETWORK_UNKNOWN (identity not established), not a mismatch", async () => {
    const { fake, state, methods } = nodeClaiming("testnet-10");
    state.serverInfoError = nodeError("method not allowed");
    const s = session(fake, "testnet-10");
    const e = await failure(s.request("getBlockDagInfo"));
    expect(e.code).toBe("NODE_NETWORK_UNKNOWN");
    expect(methods()).toEqual(["getServerInfo"]);
  });

  it("a connection that cannot be opened stays a connection failure, never an identity verdict", async () => {
    const fake = fakeOfficialRpc({ getServerInfo: () => ({ networkId: "testnet-10" }) }, { connectError: new Error("Unable to connect") });
    const s = session(fake, "testnet-10");
    const e = await failure(s.request("getBlockDagInfo"));
    expect(e).toBeInstanceOf(RpcConnectionError);
    expect(String(e.code ?? "")).not.toMatch(/^NODE_NETWORK_/);
  });

  it("a reconnection verifies again: a validated session never carries its verdict to the next connection", async () => {
    const { fake, state, methods } = nodeClaiming("testnet-10");
    const s = session(fake, "testnet-10");
    await s.request("getBlockDagInfo");
    // the node goes away and something else answers behind the same URL
    fake.drop();
    state.networkId = "simnet";
    const e = await failure(s.request("getBlockDagInfo"));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
    expect(methods()).toEqual(["getServerInfo", "getBlockDagInfo", "getServerInfo"]);
    expect(fake.connects).toBe(2);
  });

  it("a verdict belongs to one endpoint: another URL opens and verifies its own connection", async () => {
    const a = nodeClaiming("testnet-10");
    const b = nodeClaiming("mainnet");
    const sa = session(a.fake, "testnet-10", "ws://127.0.0.1:28210");
    const sb = session(b.fake, "testnet-10", "ws://127.0.0.1:28211");
    await sa.request("getBlockDagInfo");
    const e = await failure(sb.request("getBlockDagInfo"));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
    expect(b.methods()).toEqual(["getServerInfo"]);
  });

  it("without an expected network nothing changes: no identity call", async () => {
    const { fake, methods } = nodeClaiming("simnet");
    const s = session(fake);
    await s.request("getBlockDagInfo");
    expect(methods()).toEqual(["getBlockDagInfo"]);
  });

  it("the three HardKAS clients pass the expectation down; a mismatch is not retried", async () => {
    for (const make of [
      (f: any) => new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:28210", rpcFactory: f, expectedNetworkId: "testnet-10" } as any),
      (f: any) => new KaspaJsonRpcClient({ url: "ws://127.0.0.1:28210", rpcFactory: f, expectedNetworkId: "testnet-10", retry: { baseDelayMs: 1 } } as any)
    ]) {
      const { fake, methods } = nodeClaiming("simnet");
      const client = make(fake.factory);
      const e = await failure(client.getBlockDagInfo());
      expect(e.code).toBe("NODE_NETWORK_MISMATCH");
      expect(methods()).toEqual(["getServerInfo"]);
      await client.close();
    }
    const { fake, methods } = nodeClaiming("mainnet");
    const w = new KaspaWrpcClient("ws://127.0.0.1:28210", { rpcFactory: fake.factory, expectedNetworkId: "testnet-10" } as any);
    const e = await failure(w.connect(2000));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
    expect(methods()).toEqual(["getServerInfo"]);
    await w.disconnect();
  });

  it("the node's own spelling is compared by network id (case, `kaspa-` prefix), never by substring", async () => {
    const ok = nodeClaiming("Kaspa-Testnet-10");
    await session(ok.fake, "testnet-10").request("getBlockDagInfo");
    const wrongSuffix = nodeClaiming("testnet-11");
    const e = await failure(session(wrongSuffix.fake, "testnet-10").request("getBlockDagInfo"));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
  });

  it("the refusal never carries URL credentials", async () => {
    const { fake } = nodeClaiming("simnet");
    const e = await failure(session(fake, "testnet-10", "wss://user:s3cret@node.example:443").request("getBlockDagInfo"));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
    expect(JSON.stringify({ m: e.message, d: e.data })).not.toContain("s3cret");
  });
});

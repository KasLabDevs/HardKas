import { describe, it, expect } from "vitest";
import { JsonWrpcKaspaClient } from "../src/index.js";
import { KaspaJsonRpcClient } from "../src/json-rpc-client.js";
import { LoadBalancedRpcProvider } from "../src/provider.js";
import { MockKaspaRpcClient } from "../src/index.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

const subscriptionHandlers = () => ({
  subscribeUtxosChanged: () => undefined,
  unsubscribeUtxosChanged: () => undefined,
  subscribeVirtualChainChanged: () => undefined,
  unsubscribeVirtualChainChanged: () => undefined
});

// A UTXO as the official client delivers it in a utxos-changed notification.
const utxoRef = (address: string, index: number) => ({
  address,
  outpoint: { transactionId: "ab".repeat(32), index },
  amount: 5_000_000_000n,
  scriptPublicKey: { version: 0, script: "20aa" },
  blockDaaScore: 10n,
  isCoinbase: false
});

describe("RPC Subscription Contract", () => {
  it("JsonWrpcKaspaClient: unsubscribe twice does not fail (idempotent)", async () => {
    const rpc = fakeOfficialRpc(subscriptionHandlers());
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://localhost:12345", rpcFactory: rpc.factory });

    const sub = await client.subscribeToUtxosChanged(["kaspa:test"], () => {});
    expect(sub.closed).toBe(false);
    expect(rpc.calls).toEqual([{ method: "subscribeUtxosChanged", request: ["kaspa:test"] }]);

    await sub.unsubscribe();
    expect(sub.closed).toBe(true);

    // Unsubscribe twice
    await expect(sub.unsubscribe()).resolves.toBeUndefined();
    expect(rpc.calls.filter((c) => c.method === "unsubscribeUtxosChanged")).toEqual([
      { method: "unsubscribeUtxosChanged", request: ["kaspa:test"] }
    ]);
  });

  it("JsonWrpcKaspaClient: notifications arrive typed like getUtxosByAddress, and stop after unsubscribe", async () => {
    const rpc = fakeOfficialRpc(subscriptionHandlers());
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://localhost:12345", rpcFactory: rpc.factory });
    const events: any[] = [];

    const sub = await client.subscribeToUtxosChanged(["kaspa:test"], (e) => events.push(e));
    rpc.emit("utxos-changed", { added: [utxoRef("kaspa:test", 0)], removed: [] });
    expect(events).toHaveLength(1);
    expect(events[0].added[0]).toMatchObject({
      address: "kaspa:test",
      outpoint: { transactionId: "ab".repeat(32), index: 0 },
      amountSompi: 5_000_000_000n,
      scriptPublicKey: "000020aa",
      isCoinbase: false
    });

    await sub.unsubscribe();
    rpc.emit("utxos-changed", { added: [utxoRef("kaspa:test", 1)], removed: [] });
    expect(events).toHaveLength(1);
  });

  it("JsonWrpcKaspaClient: two independent subscriptions do not interfere", async () => {
    const rpc = fakeOfficialRpc(subscriptionHandlers());
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://localhost:12345", rpcFactory: rpc.factory });
    const seen1: any[] = [];
    const seen2: any[] = [];

    const sub1 = await client.subscribeToUtxosChanged(["kaspa:test1"], (e) => seen1.push(e));
    const sub2 = await client.subscribeToUtxosChanged(["kaspa:test2"], (e) => seen2.push(e));

    expect(sub1.closed).toBe(false);
    expect(sub2.closed).toBe(false);

    // Each subscription sees only its own addresses.
    rpc.emit("utxos-changed", { added: [utxoRef("kaspa:test1", 0), utxoRef("kaspa:test2", 1)], removed: [] });
    expect(seen1[0].added.map((u: any) => u.address)).toEqual(["kaspa:test1"]);
    expect(seen2[0].added.map((u: any) => u.address)).toEqual(["kaspa:test2"]);

    await sub1.unsubscribe();
    expect(sub1.closed).toBe(true);
    expect(sub2.closed).toBe(false);
    // Only the address nobody watches any more stops at the node.
    expect(rpc.calls.filter((c) => c.method === "unsubscribeUtxosChanged")).toEqual([
      { method: "unsubscribeUtxosChanged", request: ["kaspa:test1"] }
    ]);

    await sub2.unsubscribe();
    expect(sub2.closed).toBe(true);
  });

  it("JsonWrpcKaspaClient: an address watched twice is subscribed once and released by the last subscriber", async () => {
    const rpc = fakeOfficialRpc(subscriptionHandlers());
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://localhost:12345", rpcFactory: rpc.factory });

    const a = await client.subscribeToUtxosChanged(["kaspa:same"], () => {});
    const b = await client.subscribeToUtxosChanged(["kaspa:same"], () => {});
    expect(rpc.calls.filter((c) => c.method === "subscribeUtxosChanged")).toHaveLength(1);

    await a.unsubscribe();
    expect(rpc.calls.filter((c) => c.method === "unsubscribeUtxosChanged")).toHaveLength(0);
    await b.unsubscribe();
    expect(rpc.calls.filter((c) => c.method === "unsubscribeUtxosChanged")).toHaveLength(1);
  });

  it("JsonWrpcKaspaClient: after the connection drops, active subscriptions are restored and closed ones are not", async () => {
    const rpc = fakeOfficialRpc({ ...subscriptionHandlers(), getSinkBlueScore: () => ({ blueScore: 1n }) });
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://localhost:12345", rpcFactory: rpc.factory });
    const kept: any[] = [];
    const dropped: any[] = [];

    await client.subscribeToUtxosChanged(["kaspa:kept"], (e) => kept.push(e));
    const gone = await client.subscribeToUtxosChanged(["kaspa:gone"], (e) => dropped.push(e));
    await gone.unsubscribe();

    rpc.drop();
    await client.getSinkBlueScore(); // the next call opens a new official client
    expect(rpc.urls).toHaveLength(2);
    // The node subscription is issued again, for the address still watched only.
    expect(rpc.calls.filter((c) => c.method === "subscribeUtxosChanged").at(-1)).toEqual({
      method: "subscribeUtxosChanged",
      request: ["kaspa:kept"]
    });

    rpc.emit("utxos-changed", { added: [utxoRef("kaspa:kept", 0), utxoRef("kaspa:gone", 1)], removed: [] });
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("JsonWrpcKaspaClient: subscribeToVirtualChainChanged lifecycle works", async () => {
    const rpc = fakeOfficialRpc(subscriptionHandlers());
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://localhost:12345", rpcFactory: rpc.factory });
    const events: any[] = [];

    const sub = await client.subscribeToVirtualChainChanged({ includeAcceptedTransactionIds: true }, (e) => events.push(e));
    expect(sub.closed).toBe(false);
    expect(rpc.calls).toEqual([{ method: "subscribeVirtualChainChanged", request: true }]);

    rpc.emit("virtual-chain-changed", {
      removedChainBlockHashes: [],
      addedChainBlockHashes: ["cc".repeat(32)],
      acceptedTransactionIds: [{ acceptingBlockHash: "cc".repeat(32), acceptedTransactionIds: ["dd".repeat(32)] }]
    });
    expect(events).toEqual([
      {
        removedChainBlockHashes: [],
        addedChainBlockHashes: ["cc".repeat(32)],
        acceptedTransactionIds: [{ acceptingBlockHash: "cc".repeat(32), acceptedTransactionIds: ["dd".repeat(32)] }]
      }
    ]);

    await sub.unsubscribe();
    expect(sub.closed).toBe(true);
    expect(rpc.calls.at(-1)).toEqual({ method: "unsubscribeVirtualChainChanged", request: true });

    await expect(sub.unsubscribe()).resolves.toBeUndefined();
  });

  it("KaspaJsonRpcClient (request/response only): throws RPC_SUBSCRIPTIONS_UNSUPPORTED", async () => {
    const client = new KaspaJsonRpcClient({ url: "http://localhost:12345" });
    await expect(client.subscribeToUtxosChanged(["kaspa:test"], () => {})).rejects.toThrow("RPC_SUBSCRIPTIONS_UNSUPPORTED");
    await expect(client.subscribeToVirtualChainChanged({ includeAcceptedTransactionIds: true }, () => {})).rejects.toThrow("RPC_SUBSCRIPTIONS_UNSUPPORTED");
  });

  it("LoadBalancedRpcProvider: preserves subscriptions across failover (wrapper)", async () => {
    const mock1 = new MockKaspaRpcClient();
    const mock2 = new MockKaspaRpcClient();
    const lb = new LoadBalancedRpcProvider([mock1, mock2], { strategy: "failover" });

    const sub = await lb.subscribeToUtxosChanged(["kaspa:test"], () => {});
    expect(sub.closed).toBe(false);

    await sub.unsubscribe();
    expect(sub.closed).toBe(true);
  });

  it("MockKaspaRpcClient: implements same lifecycle", async () => {
    const mock = new MockKaspaRpcClient();
    const sub = await mock.subscribeToUtxosChanged(["kaspa:test"], () => {});
    expect(sub.closed).toBe(false);
    await sub.unsubscribe();
    expect(sub.closed).toBe(true);
  });
});

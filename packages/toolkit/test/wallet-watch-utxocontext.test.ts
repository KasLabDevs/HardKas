import { describe, it, expect, vi, beforeEach } from "vitest";

// Surface Cut 3b · R2–R4. WalletToolkit.watch() observes through kaspa-wasm's UtxoProcessor +
// UtxoContext (via tx-builder's createUtxoContext, which re-snapshots after every reconnect), not
// through kaspa-rpc subscriptions. The record run of the gap experiment (29-sep) is the reason:
// resubscribing recovered liveness but kept the inputs spent while disconnected and missed the
// change. The contract under test: utxos() is the observed state; a `transaction` event is live
// activity only; the disconnected interval is reported once, as `resync`; no node → an error.
// A fake kaspa-wasm stands in for RpcClient / UtxoProcessor / UtxoContext.
const fake = vi.hoisted(() => {
  type Entry = { outpoint: { transactionId: string; index: number }; amount: bigint; isCoinbase: boolean; blockDaaScore: bigint };
  const entry = (txid: string, index: number, amount = 100n): Entry => ({ outpoint: { transactionId: txid, index }, amount, isCoinbase: false, blockDaaScore: 1n });
  // A TransactionRecord as UtxoProcessor delivers it (serialize() shape, measured against the node
  // in upstream-events-probe-1: a spend this context did not create arrives as a `maturity`
  // record of type "external", keyed by the transaction whose outputs were spent).
  const record = (id: string, type: string, entries: Entry[]) => ({
    id,
    data: { type, data: { utxoEntries: entries.map((e) => ({ index: e.outpoint.index, amount: e.amount })) } }
  });
  const hold = () => {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    return { promise, release };
  };
  const state = {
    node: new Map<string, Entry>(),
    calls: [] as string[],
    inFlight: 0,
    maxInFlight: 0,
    holdClear: null as null | { promise: Promise<void>; release: () => void },
    nodeDown: false,
    processors: [] as any[],
    contexts: [] as any[],
    rpcs: [] as any[]
  };
  class RpcClient {
    connectOptions: any;
    disconnected = false;
    constructor(public args: any) { state.rpcs.push(this); }
    async connect(options?: any) {
      this.connectOptions = options;
      // A node that never answers: kaspa-wasm's Retry strategy keeps connect() pending.
      if (state.nodeDown) await new Promise(() => {});
    }
    async disconnect() { this.disconnected = true; }
    async getServerInfo() { return { networkId: "simnet", isSynced: true, serverVersion: "fake", hasUtxoIndex: true }; }
    addEventListener() {}
    removeEventListener() {}
  }
  class UtxoProcessor {
    listeners: Array<(e: any) => void> = [];
    stopped = false;
    constructor(public args: any) { state.processors.push(this); }
    addEventListener(a: any, b?: any) { this.listeners.push(typeof a === "function" ? a : (e: any) => { if (e.type === a) b(e); }); }
    removeEventListener() {}
    async start() {}
    async stop() { this.stopped = true; }
    emit(type: string, data?: any) { for (const l of [...this.listeners]) l({ type, data }); }
  }
  class UtxoContext {
    mature: Entry[] = [];
    pending: Entry[] = [];
    constructor(public args: any) { state.contexts.push(this); }
    private async run(name: string, gate: { promise: Promise<void> } | null, body: () => void) {
      state.calls.push(name);
      state.inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      try {
        if (gate) await gate.promise;
        body();
      } finally {
        state.inFlight--;
      }
    }
    async clear() { await this.run("clear", state.holdClear, () => { this.mature = []; this.pending = []; }); }
    async trackAddresses(addresses: any[]) {
      await this.run(`track:${addresses.map(String).join(",")}`, null, () => {
        this.mature = [...state.node.values()];
        this.pending = [];
        // upstream reports what a scan finds as `discovery`: never live activity
        for (const e of this.mature) this.args.processor.emit("discovery", record(e.outpoint.transactionId, "incoming", [e]));
      });
    }
    async unregisterAddresses(addresses: any[]) { state.calls.push(`untrack:${addresses.map(String).join(",")}`); }
    getMatureRange(from: number, to: number) { return this.mature.slice(from, to); }
    getPending() { return [...this.pending]; }
    get matureLength() { return this.mature.length; }
    get balance() {
      return { mature: this.mature.reduce((s, e) => s + e.amount, 0n), pending: this.pending.reduce((s, e) => s + e.amount, 0n), outgoing: 0n };
    }
  }
  const reset = () => {
    state.node.clear();
    state.calls.length = 0;
    state.inFlight = 0;
    state.maxInFlight = 0;
    state.holdClear = null;
    state.nodeDown = false;
    state.processors.length = 0;
    state.contexts.length = 0;
    state.rpcs.length = 0;
  };
  return { k: { RpcClient, UtxoProcessor, UtxoContext, Encoding: { SerdeJson: 1 } }, state, entry, record, hold, reset };
});

vi.mock("@hardkas/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hardkas/core")>()),
  loadManagedKaspaWasmSync: () => fake.k
}));

import { WalletToolkit } from "../src/wallet.js";

const ADDRESS = "kaspasim:qwatched";
const RPC_URL = "ws://127.0.0.1:18210";
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};
const op = (txid: string, index: number, amountSompi = 100n) => ({ transactionId: txid, index, amountSompi });
const keysOf = (list: Array<{ transactionId: string; index: number }>) => list.map((u) => `${u.transactionId}:${u.index}`).sort();

async function openWatch(name: string, extra: Record<string, unknown> = {}) {
  const wallet = WalletToolkit.open(name, { rpcUrl: RPC_URL, storePath: `mem://${name}`, ...extra });
  vi.spyOn(wallet, "receive").mockResolvedValue(ADDRESS);
  const events: any[] = [];
  const handle: any = await wallet.watch((e: any) => {
    events.push(e);
  });
  return { wallet, handle, events, processor: fake.state.processors[0], context: fake.state.contexts[0] };
}
function liveAdd(context: any, processor: any, e: any) {
  fake.state.node.set(`${e.outpoint.transactionId}:${e.outpoint.index}`, e);
  context.pending.push(e);
  processor.emit("pending", fake.record(e.outpoint.transactionId, "incoming", [e]));
}
/** A spend this context did not create: upstream sends a `maturity` record of type "external". */
function liveSpend(context: any, processor: any, e: any) {
  const key = `${e.outpoint.transactionId}:${e.outpoint.index}`;
  fake.state.node.delete(key);
  const keep = (x: any) => `${x.outpoint.transactionId}:${x.outpoint.index}` !== key;
  context.mature = context.mature.filter(keep);
  context.pending = context.pending.filter(keep);
  processor.emit("maturity", fake.record(e.outpoint.transactionId, "external", [e]));
}

describe("Surface Cut 3b · R3/W6: watch() needs a node and observes through UtxoContext", () => {
  beforeEach(() => fake.reset());

  it("without a node URL, watch() rejects with WALLET_WATCH_REQUIRES_NODE instead of never firing", async () => {
    const simulatedLike = { subscribeToUtxosChanged: vi.fn(async () => ({ id: "s", closed: false, unsubscribe: async () => {} })) };
    const wallet = WalletToolkit.open("r3", { rpc: simulatedLike, storePath: "mem://r3" });
    vi.spyOn(wallet, "receive").mockResolvedValue(ADDRESS);
    await expect(wallet.watch(vi.fn())).rejects.toMatchObject({ code: "WALLET_WATCH_REQUIRES_NODE" });
  });

  it("R5: a node that never answers makes watch() reject after 30 s and release the client, not hang", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fake.state.nodeDown = true;
      const wallet = WalletToolkit.open("r5", { rpcUrl: RPC_URL, storePath: "mem://r5" });
      vi.spyOn(wallet, "receive").mockResolvedValue(ADDRESS);
      const watching = wallet.watch(vi.fn());
      const outcome = watching.then(() => "resolved", (e) => e);
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(outcome).resolves.toMatchObject({ code: "WALLET_WATCH_NODE_UNREACHABLE" });
      expect(fake.state.rpcs[0].disconnected).toBe(true);
      expect(fake.state.processors).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("watch() does not subscribe through kaspa-rpc; it opens its own retrying RpcClient and a UtxoContext", async () => {
    const kaspaRpcLike = { subscribeToUtxosChanged: vi.fn(async () => ({ id: "s", closed: false, unsubscribe: async () => {} })) };
    const { handle } = await openWatch("w6", { rpc: kaspaRpcLike });
    expect(kaspaRpcLike.subscribeToUtxosChanged).not.toHaveBeenCalled();
    expect(fake.state.rpcs).toHaveLength(1);
    expect(fake.state.rpcs[0].args.url).toBe(RPC_URL);
    expect(fake.state.rpcs[0].connectOptions?.strategy).not.toBe("fallback");
    expect(fake.state.processors).toHaveLength(1);
    expect(fake.state.calls).toEqual([`track:${ADDRESS}`]);
    await handle.unwatch();
  });
});

describe("Surface Cut 3b · R2: the disconnected interval is one resync, never synthetic transactions", () => {
  beforeEach(() => fake.reset());

  it("after a reconnect: exactly one resync with the exact difference, no transaction for re-discovered UTXOs, utxos() = node", async () => {
    for (const [t, i] of [["a", 0], ["b", 0], ["c", 0]] as const) fake.state.node.set(`${t}:${i}`, fake.entry(t, i));
    const { handle, events, processor } = await openWatch("r2a");
    expect(keysOf(handle.utxos())).toEqual(["a:0", "b:0", "c:0"]);
    // While disconnected the node spends a:0 and b:0 and creates the change x:1; nothing reaches the watch.
    processor.emit("disconnect");
    fake.state.node.delete("a:0");
    fake.state.node.delete("b:0");
    fake.state.node.set("x:1", fake.entry("x", 1));
    processor.emit("connect");
    await flush();
    expect(events.filter((e) => e.type === "transaction")).toEqual([]);
    expect(events).toEqual([{ type: "resync", reason: "reconnect", removed: [op("a", 0), op("b", 0)], added: [op("x", 1)] }]);
    expect(keysOf(handle.utxos())).toEqual(["c:0", "x:1"]);
    await handle.unwatch();
  });

  it("live activity after a resync is reported as a transaction again", async () => {
    fake.state.node.set("a:0", fake.entry("a", 0));
    const { handle, events, processor, context } = await openWatch("r2c");
    processor.emit("disconnect");
    processor.emit("connect");
    await flush();
    expect(events).toEqual([{ type: "resync", reason: "reconnect", removed: [], added: [] }]);
    liveAdd(fake.state.contexts[0], processor, fake.entry("y", 0));
    await flush();
    expect(events.slice(1)).toEqual([{ type: "transaction", txid: "y", details: { added: [op("y", 0)], removed: [] } }]);
    expect(context).toBe(fake.state.contexts[0]);
    await handle.unwatch();
  });

  it("race: two reconnects while the first re-snapshot is held, then unwatch(): one at a time, nothing after unwatch", async () => {
    fake.state.node.set("a:0", fake.entry("a", 0));
    const { handle, events, processor, context } = await openWatch("r2b");
    fake.state.calls.length = 0;
    const hold = (fake.state.holdClear = fake.hold());
    processor.emit("disconnect");
    processor.emit("connect");
    await flush();
    expect(fake.state.calls).toEqual(["clear"]); // the first re-snapshot is held
    processor.emit("disconnect");
    processor.emit("connect");
    processor.emit("disconnect");
    processor.emit("connect");
    await flush();
    expect(fake.state.calls).toEqual(["clear"]); // no second one starts beside it
    const unwatching = handle.unwatch();
    const callsAtUnwatch = fake.state.calls.length;
    const eventsAtUnwatch = events.length;
    fake.state.holdClear = null;
    hold.release();
    await unwatching;
    await flush();
    expect(fake.state.maxInFlight).toBe(1);
    expect(fake.state.calls.slice(callsAtUnwatch).some((c) => c.startsWith("track:"))).toBe(false);
    expect(events.length).toBe(eventsAtUnwatch);
    expect(processor.stopped).toBe(true);
    expect(fake.state.rpcs[0].disconnected).toBe(true);
    // late signals after unwatch reactivate nothing
    processor.emit("connect");
    liveAdd(context, processor, fake.entry("late", 0));
    await flush();
    expect(fake.state.calls.slice(callsAtUnwatch).some((c) => c.startsWith("track:"))).toBe(false);
    expect(events.length).toBe(eventsAtUnwatch);
  });
});

describe("Surface Cut 3b · R4: the watch contract on the new engine", () => {
  beforeEach(() => fake.reset());

  it("a live incoming UTXO is one transaction event with its outpoint", async () => {
    const { handle, events, processor, context } = await openWatch("r4a");
    liveAdd(context, processor, fake.entry("tx-123", 0));
    await flush();
    expect(events).toEqual([{ type: "transaction", txid: "tx-123", details: { added: [op("tx-123", 0)], removed: [] } }]);
    await handle.unwatch();
  });

  it("a live spend is one transaction event with the removed outpoint (txid: the record upstream reports)", async () => {
    fake.state.node.set("a:0", fake.entry("a", 0));
    const { handle, events, processor, context } = await openWatch("r4e");
    liveSpend(context, processor, fake.entry("a", 0));
    await flush();
    expect(events).toEqual([{ type: "transaction", txid: "a", details: { added: [], removed: [op("a", 0)] } }]);
    await handle.unwatch();
  });

  it("the same upstream report twice gives one event, and a maturity step is not a transaction", async () => {
    const { handle, events, processor, context } = await openWatch("r4b");
    const e = fake.entry("tx-dup", 0);
    liveAdd(context, processor, e);
    processor.emit("pending", fake.record("tx-dup", "incoming", [e]));
    processor.emit("maturity", fake.record("tx-dup", "incoming", [e]));
    await flush();
    expect(events).toHaveLength(1);
    await handle.unwatch();
  });

  it("a throwing listener does not stop delivery", async () => {
    const wallet = WalletToolkit.open("r4c", { rpcUrl: RPC_URL, storePath: "mem://r4c" });
    vi.spyOn(wallet, "receive").mockResolvedValue(ADDRESS);
    let calls = 0;
    const handle: any = await wallet.watch(() => {
      calls++;
      if (calls === 1) throw new Error("Boom");
    });
    const processor = fake.state.processors[0];
    const context = fake.state.contexts[0];
    liveAdd(context, processor, fake.entry("tx-aaa", 0));
    await flush();
    liveAdd(context, processor, fake.entry("tx-bbb", 0));
    await flush();
    expect(calls).toBe(2);
    await handle.unwatch();
  });

  it("unwatch stops delivery and releases the processor and the node connection", async () => {
    const { handle, events, processor, context } = await openWatch("r4d");
    await handle.unwatch();
    expect(processor.stopped).toBe(true);
    expect(fake.state.rpcs[0].disconnected).toBe(true);
    liveAdd(context, processor, fake.entry("tx-after", 0));
    await flush();
    expect(events).toEqual([]);
  });

  it("utxos() lists mature and pending UTXOs; coinbase UTXOs in stasis are counted, not listed", async () => {
    fake.state.node.set("m:0", fake.entry("m", 0, 5n));
    const { handle, processor, context } = await openWatch("r4f");
    liveAdd(context, processor, fake.entry("p", 1, 7n));
    processor.emit("balance", { balance: { mature: 5n, pending: 7n, outgoing: 0n, matureUtxoCount: 1, pendingUtxoCount: 1, stasisUtxoCount: 2 } });
    await flush();
    expect(handle.utxos().map((u: any) => [u.transactionId, u.index, u.amountSompi, u.state])).toEqual([
      ["m", 0, 5n, "mature"],
      ["p", 1, 7n, "pending"]
    ]);
    expect(handle.balance()).toEqual({ mature: 5n, pending: 7n, stasisCount: 2 });
    await handle.unwatch();
  });

  it("two watchers share one engine, which stops only when the last one unwatches", async () => {
    const wallet = WalletToolkit.open("r4g", { rpcUrl: RPC_URL, storePath: "mem://r4g" });
    vi.spyOn(wallet, "receive").mockResolvedValue(ADDRESS);
    const first: any[] = [];
    const second: any[] = [];
    const h1: any = await wallet.watch((e) => { first.push(e); });
    const h2: any = await wallet.watch((e) => { second.push(e); });
    expect(fake.state.processors).toHaveLength(1);
    const processor = fake.state.processors[0];
    await h1.unwatch();
    expect(processor.stopped).toBe(false);
    liveAdd(fake.state.contexts[0], processor, fake.entry("both", 0));
    await flush();
    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
    await h2.unwatch();
    expect(processor.stopped).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Surface Cut 3b · R1. kaspa-wasm's UtxoContext.clear() docs: after a reconnect the context must
// be cleared and its addresses registered again, or it keeps a stale view. The record run of the
// gap experiment (29-sep) measured it: resubscribing alone kept the inputs spent while
// disconnected and missed the change; clear() → trackAddresses() matched the node exactly.
// createUtxoContext is the one wrapper that applies the rule. A fake kaspa-wasm stands in for
// UtxoProcessor / UtxoContext so every call can be observed, and held, from the test.
const fake = vi.hoisted(() => {
  type Entry = { outpoint: { transactionId: string; index: number }; amount: bigint; isCoinbase: boolean; blockDaaScore: bigint };
  const entry = (txid: string, index: number, amount = 100n): Entry => ({ outpoint: { transactionId: txid, index }, amount, isCoinbase: false, blockDaaScore: 1n });
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
    failTrack: null as null | Error,
    processors: [] as any[],
    contexts: [] as any[]
  };
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
        if (state.failTrack) {
          const e = state.failTrack;
          state.failTrack = null;
          throw e;
        }
        this.mature = [...state.node.values()];
        for (const e of this.mature) this.args.processor.emit("discovery", { id: e.outpoint.transactionId });
      });
    }
    async unregisterAddresses(addresses: any[]) { state.calls.push(`untrack:${addresses.map(String).join(",")}`); }
    getMatureRange(from: number, to: number) { return this.mature.slice(from, to); }
    getPending() { return [...this.pending]; }
    get matureLength() { return this.mature.length; }
    get balance() { return undefined; }
  }
  const reset = () => {
    state.node.clear();
    state.calls.length = 0;
    state.inFlight = 0;
    state.maxInFlight = 0;
    state.holdClear = null;
    state.failTrack = null;
    state.processors.length = 0;
    state.contexts.length = 0;
  };
  return { k: { UtxoProcessor, UtxoContext, Encoding: { SerdeJson: 1 } }, state, entry, hold, reset };
});

vi.mock("@hardkas/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hardkas/core")>()),
  loadManagedKaspaWasmSync: () => fake.k
}));

import { createUtxoContext } from "../src/kaspa-wallet-adapter.js";

const ADDRESS = "kaspasim:qwatched";
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};
async function open() {
  const handle = await createUtxoContext({ wasmRpc: {}, networkId: "simnet", addresses: [ADDRESS] });
  const processor = fake.state.processors[0];
  fake.state.calls.length = 0; // from here on, only what a reconnect triggers
  return { handle: handle as any, processor };
}
const reconnect = (processor: any) => {
  processor.emit("disconnect");
  processor.emit("connect");
};

describe("Surface Cut 3b · R1: createUtxoContext re-snapshots after every reconnect", () => {
  beforeEach(() => fake.reset());

  it("a reconnect runs clear() then trackAddresses() on the tracked addresses, once and in order", async () => {
    fake.state.node.set("a:0", fake.entry("a", 0));
    const { processor } = await open();
    reconnect(processor);
    await flush();
    expect(fake.state.calls).toEqual(["clear", `track:${ADDRESS}`]);
    expect(fake.state.contexts[0].mature.map((e: any) => e.outpoint.transactionId)).toEqual(["a"]);
  });

  it("the first registration is not repeated, and nothing runs without a reconnect", async () => {
    await createUtxoContext({ wasmRpc: {}, networkId: "simnet", addresses: [ADDRESS] });
    expect(fake.state.calls).toEqual([`track:${ADDRESS}`]);
    await flush();
    expect(fake.state.calls).toEqual([`track:${ADDRESS}`]);
  });

  it("onResync fires once after each completed re-snapshot, and resyncing is true only while it runs", async () => {
    const { handle, processor } = await open();
    const seen: boolean[] = [];
    handle.onResync(() => seen.push(handle.resyncing));
    fake.state.holdClear = fake.hold();
    reconnect(processor);
    await flush();
    expect(handle.resyncing).toBe(true);
    fake.state.holdClear.release();
    await flush();
    expect(seen).toEqual([false]);
    expect(handle.resyncing).toBe(false);
  });

  it("reconnects during a held re-snapshot are merged: clear() and trackAddresses() never overlap", async () => {
    fake.state.node.set("a:0", fake.entry("a", 0));
    const { handle, processor } = await open();
    const hold = (fake.state.holdClear = fake.hold());
    reconnect(processor);
    await flush();
    expect(fake.state.calls).toEqual(["clear"]); // the first re-snapshot is in flight
    reconnect(processor);
    reconnect(processor);
    await flush();
    expect(fake.state.calls).toEqual(["clear"]); // nothing new starts while it is held
    fake.state.holdClear = null;
    hold.release();
    await flush();
    expect(fake.state.maxInFlight).toBe(1);
    const passes = fake.state.calls.filter((c) => c === "clear").length;
    expect(passes).toBeGreaterThanOrEqual(1);
    expect(passes).toBeLessThanOrEqual(2); // the reconnects that arrived mid-pass merge into one more pass
    expect(fake.state.calls).toEqual(Array.from({ length: passes }, () => ["clear", `track:${ADDRESS}`]).flat());
    expect(handle.resyncing).toBe(false);
  });

  it("stop() during a held re-snapshot: no trackAddresses() after stop, no onResync, processor stopped", async () => {
    const { handle, processor } = await open();
    let resyncs = 0;
    const hold = (fake.state.holdClear = fake.hold());
    reconnect(processor);
    await flush();
    expect(fake.state.calls).toEqual(["clear"]); // a re-snapshot is held
    handle.onResync(() => resyncs++);
    reconnect(processor);
    reconnect(processor);
    const stopping = handle.stop();
    const callsAtStop = fake.state.calls.length;
    fake.state.holdClear = null;
    hold.release();
    await stopping;
    await flush();
    expect(fake.state.calls.slice(callsAtStop).some((c) => c.startsWith("track:"))).toBe(false);
    expect(resyncs).toBe(0);
    expect(processor.stopped).toBe(true);
    reconnect(processor);
    await flush();
    expect(fake.state.calls.slice(callsAtStop).some((c) => c.startsWith("track:"))).toBe(false);
  });

  it("a failed re-snapshot is reported to onError, not swallowed", async () => {
    const { handle, processor } = await open();
    const errors: unknown[] = [];
    handle.onError((e: unknown) => errors.push(e));
    fake.state.failTrack = new Error("node refused the registration");
    reconnect(processor);
    await flush();
    expect(errors.map((e) => String((e as Error).message))).toEqual(["node refused the registration"]);
    expect(handle.resyncing).toBe(false);
  });
});

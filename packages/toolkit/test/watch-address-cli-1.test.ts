import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------------
// WATCH-CLI-1 · watchAddress (what `hardkas watch <address>` runs): the engine of WalletToolkit.watch() for any address.
// Events added / removed / matured (opt-in, watchAddress only) / resync after a reconnect; connection and error hooks;
// refusals before anything is tracked (a mainnet address or node, a node of another network, an address of another
// network). A fake kaspa-wasm stands in for RpcClient / UtxoProcessor / UtxoContext, as in wallet-watch-utxocontext.test.ts.
// -----------------------------------------------------------------------------

const fake = vi.hoisted(() => {
  type Entry = { outpoint: { transactionId: string; index: number }; amount: bigint; isCoinbase: boolean; blockDaaScore: bigint; entry?: any };
  const entry = (txid: string, index: number, amount = 100n, covenantId?: string): Entry => ({
    outpoint: { transactionId: txid, index },
    amount,
    isCoinbase: false,
    blockDaaScore: 1n,
    ...(covenantId ? { entry: { covenantId: { toString: () => covenantId } } } : {})
  });
  const record = (id: string, type: string, entries: Entry[]) => ({ id, data: { type, data: { utxoEntries: entries.map((e) => ({ index: e.outpoint.index, amount: e.amount })) } } });
  const state = { serverNetwork: "simnet", node: new Map<string, Entry>(), calls: [] as string[], processors: [] as any[], contexts: [] as any[], rpcs: [] as any[] };
  class RpcClient {
    disconnected = false;
    constructor(public args: any) {
      state.rpcs.push(this);
    }
    async connect() {}
    async disconnect() {
      this.disconnected = true;
    }
    async getServerInfo() {
      state.calls.push(`identity:${state.serverNetwork}`);
      return { networkId: state.serverNetwork, isSynced: true, serverVersion: "fake", hasUtxoIndex: true };
    }
    addEventListener() {}
    removeEventListener() {}
  }
  class UtxoProcessor {
    listeners: Array<(e: any) => void> = [];
    stopped = false;
    constructor(public args: any) {
      state.processors.push(this);
    }
    addEventListener(a: any, b?: any) {
      this.listeners.push(typeof a === "function" ? a : (e: any) => { if (e.type === a) b(e); });
    }
    removeEventListener() {}
    async start() {}
    async stop() {
      this.stopped = true;
    }
    emit(type: string, data?: any) {
      for (const l of [...this.listeners]) l({ type, data });
    }
  }
  class UtxoContext {
    mature: Entry[] = [];
    pending: Entry[] = [];
    constructor(public args: any) {
      state.contexts.push(this);
    }
    async clear() {
      state.calls.push("clear");
      this.mature = [];
      this.pending = [];
    }
    async trackAddresses(addresses: any[]) {
      state.calls.push(`track:${addresses.map(String).join(",")}`);
      this.mature = [...state.node.values()];
      this.pending = [];
    }
    async unregisterAddresses() {}
    getMatureRange(from: number, to: number) {
      return this.mature.slice(from, to);
    }
    getPending() {
      return [...this.pending];
    }
    get matureLength() {
      return this.mature.length;
    }
    get balance() {
      return { mature: this.mature.reduce((s, e) => s + e.amount, 0n), pending: this.pending.reduce((s, e) => s + e.amount, 0n), outgoing: 0n };
    }
  }
  const reset = () => {
    state.serverNetwork = "simnet";
    state.node.clear();
    state.calls.length = 0;
    state.processors.length = 0;
    state.contexts.length = 0;
    state.rpcs.length = 0;
  };
  return { k: { RpcClient, UtxoProcessor, UtxoContext, Encoding: { SerdeJson: 1 } }, state, entry, record, reset };
});

vi.mock("@hardkas/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hardkas/core")>()),
  loadManagedKaspaWasmSync: () => fake.k
}));

const { watchAddress } = await import("../src/watch.js");

const ADDRESS = "kaspasim:qwatched";
const RPC_URL = "ws://127.0.0.1:18210";
const COVENANT = "c0".repeat(32);
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "NO_ERROR";
  } catch (e: any) {
    return e?.code ?? `UNCODED: ${String(e?.message ?? e).slice(0, 120)}`;
  }
};

beforeEach(() => fake.reset());

describe("WATCH-CLI-1 · watchAddress events", () => {
  it("added, matured (opt-in), removed, and a resync after a reconnect, with the connection notices; covenant outputs keep their id", async () => {
    fake.state.node.set("aa:0", fake.entry("aa", 0, 500n, COVENANT));
    const events: any[] = [];
    const connection: string[] = [];
    const handle = await watchAddress(RPC_URL, ADDRESS, (e) => void events.push(e), { reportMaturity: true, onConnection: (s) => connection.push(s) });
    try {
      expect(handle.networkId).toBe("simnet");
      expect(handle.utxos().find((u) => u.transactionId === "aa")?.covenantId).toBe(COVENANT);
      const processor = fake.state.processors[0];
      const context = fake.state.contexts[0];
      const e = fake.entry("bb", 1, 700n);
      fake.state.node.set("bb:1", e);
      context.pending.push(e);
      processor.emit("pending", fake.record("bb", "incoming", [e]));
      context.pending = [];
      context.mature.push(e);
      processor.emit("maturity", fake.record("bb", "incoming", [e]));
      fake.state.node.delete("aa:0");
      context.mature = context.mature.filter((x: any) => x.outpoint.transactionId !== "aa");
      processor.emit("maturity", fake.record("aa", "external", [fake.entry("aa", 0, 500n)]));
      processor.emit("disconnect");
      fake.state.node.set("cc:2", fake.entry("cc", 2, 900n));
      processor.emit("connect");
      await flush();
      expect(events.map((x) => x.type)).toEqual(["transaction", "maturity", "transaction", "resync"]);
      expect(events[0].details.added).toEqual([{ transactionId: "bb", index: 1, amountSompi: 700n }]);
      expect(events[1]).toEqual({ type: "maturity", txid: "bb", details: { matured: [{ transactionId: "bb", index: 1, amountSompi: 700n }] } });
      expect(events[2].details.removed).toEqual([{ transactionId: "aa", index: 0, amountSompi: 500n }]);
      expect(events[3].added).toEqual([{ transactionId: "cc", index: 2, amountSompi: 900n }]);
      expect(connection).toEqual(["disconnected", "reconnected"]);
    } finally {
      await handle.stop();
    }
  });

  it("without reportMaturity no maturity event (WalletToolkit.watch()'s behaviour, unchanged)", async () => {
    const events: any[] = [];
    const handle = await watchAddress(RPC_URL, ADDRESS, (e) => void events.push(e));
    try {
      const e = fake.entry("dd", 0, 10n);
      fake.state.contexts[0].pending.push(e);
      fake.state.processors[0].emit("pending", fake.record("dd", "incoming", [e]));
      fake.state.processors[0].emit("maturity", fake.record("dd", "incoming", [e]));
      await flush();
      expect(events.map((x) => x.type)).toEqual(["transaction"]);
    } finally {
      await handle.stop();
    }
  });

  it("a node that changes its network after a reconnect stops the watch and reaches onError", async () => {
    const errors: any[] = [];
    const events: any[] = [];
    const handle = await watchAddress(RPC_URL, ADDRESS, (e) => void events.push(e), { onError: (err) => errors.push(err) });
    fake.state.processors[0].emit("disconnect");
    fake.state.serverNetwork = "testnet-10";
    fake.state.processors[0].emit("connect");
    await flush();
    expect(errors.map((e) => e?.code)).toEqual(["WALLET_WATCH_NODE_NETWORK_CHANGED"]);
    expect(events).toEqual([]);
    await handle.stop();
  });
});

describe("WATCH-CLI-1 · refusals before anything is tracked", () => {
  it("a mainnet address or a mainnet expected network: MAINNET_CONNECTION_DISABLED, no client created", async () => {
    expect(await codeOf(watchAddress(RPC_URL, "kaspa:qqmainnetaddress", () => {}))).toBe("MAINNET_CONNECTION_DISABLED");
    expect(await codeOf(watchAddress(RPC_URL, ADDRESS, () => {}, { expectedNetworkId: "mainnet" }))).toBe("MAINNET_CONNECTION_DISABLED");
    expect(fake.state.rpcs).toEqual([]);
  });

  it("not a Kaspa address: WATCH_ADDRESS_INVALID, no client created", async () => {
    expect(await codeOf(watchAddress(RPC_URL, "bitcoin:1abc", () => {}))).toBe("WATCH_ADDRESS_INVALID");
    expect(fake.state.rpcs).toEqual([]);
  });

  it("a node of another network than expected (WATCH_NODE_NETWORK_MISMATCH) or than the address's (WATCH_ADDRESS_NETWORK_MISMATCH): nothing tracked, the client released", async () => {
    fake.state.serverNetwork = "testnet-10";
    expect(await codeOf(watchAddress(RPC_URL, ADDRESS, () => {}, { expectedNetworkId: "simnet" }))).toBe("WATCH_NODE_NETWORK_MISMATCH");
    expect(fake.state.calls.some((c) => c.startsWith("track"))).toBe(false);
    expect(fake.state.rpcs[0].disconnected).toBe(true);
    expect(await codeOf(watchAddress(RPC_URL, ADDRESS, () => {}))).toBe("WATCH_ADDRESS_NETWORK_MISMATCH");
    expect(fake.state.calls.some((c) => c.startsWith("track"))).toBe(false);
  });

  it("a node that says mainnet: the engine's refusal after its identity answer, nothing tracked", async () => {
    fake.state.serverNetwork = "mainnet";
    expect(await codeOf(watchAddress(RPC_URL, ADDRESS, () => {}))).toBe("MAINNET_CONNECTION_DISABLED");
    expect(fake.state.calls).toEqual(["identity:mainnet"]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// A4 (rc2 audit) · `WalletToolkit.watch` identified its node once; its own kaspa-wasm client resumes by itself (Retry
// strategy), and the re-snapshot after a reconnect re-read the address from whatever answered behind the URL — a local
// testnet node replaced by a mainnet one on the same port, a proxy that changed its upstream. Now every reconnection is
// identified again BEFORE the re-snapshot clears or reads anything (tx-builder's beforeResnapshot hook): a node that names
// mainnet or another network stops the watch and nothing it answers is reported. A fake kaspa-wasm stands in.

const fake = vi.hoisted(() => {
  const state = { serverNetwork: "simnet", calls: [] as string[], processors: [] as any[], rpcs: [] as any[] };
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
      return { networkId: state.serverNetwork };
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
    addEventListener(a: any) {
      if (typeof a === "function") this.listeners.push(a);
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
    constructor(public args: any) {}
    async clear() {
      state.calls.push("clear");
    }
    async trackAddresses() {
      state.calls.push("track");
    }
    async unregisterAddresses() {}
    getMatureRange() {
      return [];
    }
    getPending() {
      return [];
    }
    get matureLength() {
      return 0;
    }
    get balance() {
      return { mature: 0n, pending: 0n };
    }
  }
  return { k: { RpcClient, UtxoProcessor, UtxoContext, Encoding: { SerdeJson: 1 } }, state };
});

vi.mock("@hardkas/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hardkas/core")>()),
  loadManagedKaspaWasmSync: () => fake.k
}));

const { UtxoWatchEngine } = await import("../src/watch.js");

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

async function watching() {
  const engine = new UtxoWatchEngine("ws://127.0.0.1:18210", async () => "kaspasim:qwatched");
  const events: any[] = [];
  engine.add((e) => {
    events.push(e);
  });
  await engine.start();
  return { engine, events, processor: fake.state.processors[0], rpc: fake.state.rpcs[0] };
}

beforeEach(() => {
  fake.state.serverNetwork = "simnet";
  fake.state.calls.length = 0;
  fake.state.processors.length = 0;
  fake.state.rpcs.length = 0;
});

describe("A4 · a resumed connection is identified again before the watch reads from it", () => {
  it("control: the same network after a reconnect → identified, re-snapshot, one resync event", async () => {
    const { processor, events } = await watching();
    fake.state.calls.length = 0;
    processor.emit("disconnect");
    processor.emit("connect");
    await flush();
    expect(fake.state.calls).toEqual(["identity:simnet", "clear", "track"]);
    expect(events.map((e) => e.type)).toEqual(["resync"]);
  });

  for (const [name, network] of [
    ["mainnet", "mainnet"],
    ["another network", "testnet-10"]
  ] as const) {
    it(`the node behind the URL now names ${name} → the address is not read again, no event, the watch stopped`, async () => {
      const { processor, events, rpc } = await watching();
      fake.state.calls.length = 0;
      processor.emit("disconnect");
      fake.state.serverNetwork = network;
      processor.emit("connect");
      await flush();
      // the identity question, then only the watch's own teardown (stop() clears the context): the address is never read
      // from that node again (no "track"), and nothing is reported
      expect(fake.state.calls[0]).toBe(`identity:${network}`);
      expect(fake.state.calls.filter((c) => c === "track")).toEqual([]);
      expect(events).toEqual([]);
      expect({ processorStopped: processor.stopped, clientReleased: rpc.disconnected }).toEqual({ processorStopped: true, clientReleased: true });
    });
  }
});

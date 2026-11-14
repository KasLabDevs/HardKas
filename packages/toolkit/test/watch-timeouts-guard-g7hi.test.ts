import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// G7 h, i (notes cross-check: 02 §2, 08, 12 §3, 13) · WalletToolkit.watch's engine:
//  h. `getServerInfo` and the snapshot had no timeout: a node that keeps the socket and stops answering held the first
//     start for ever, and after a reconnection held the re-snapshot — whose `running` flag then made every later
//     reconnect return early, so no resync ever came again. Each call is now bounded (WALLET_WATCH_NODE_TIMEOUT), and a
//     re-snapshot that does not finish is reported (WALLET_WATCH_RESNAPSHOT_TIMEOUT).
//  i. the engine built its own RpcClient without kaspa-rpc's process guard (useWsWebSocketForSdk); it is now built by
//     kaspa-rpc's officialRpcFactory, which installs it.
// A fake kaspa-wasm stands in.

const fake = vi.hoisted(() => {
  const never = () => new Promise<never>(() => {});
  const hold = () => {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    return { promise, release };
  };
  const state = {
    hangServerInfo: false,
    trackGate: null as null | { promise: Promise<void> },
    calls: [] as string[],
    processors: [] as any[],
    rpcs: [] as any[]
  };
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
      state.calls.push("identity");
      if (state.hangServerInfo) return never();
      return { networkId: "simnet" };
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
      if (state.trackGate) await state.trackGate.promise;
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
  return { k: { RpcClient, UtxoProcessor, UtxoContext, Encoding: { SerdeJson: 1 } }, state, hold };
});

vi.mock("@hardkas/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hardkas/core")>()),
  loadManagedKaspaWasmSync: () => fake.k
}));

const hostWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
const { UtxoWatchEngine } = await import("../src/watch.js");
const { logger } = await import("@hardkas/observability");

const URL = "ws://127.0.0.1:18210";
const ADDRESS = async () => "kaspasim:qwatched";
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  fake.state.hangServerInfo = false;
  fake.state.trackGate = null;
  fake.state.calls.length = 0;
  fake.state.processors.length = 0;
  fake.state.rpcs.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("G7 i · the watch engine's client carries kaspa-rpc's process guard", () => {
  it("built through officialRpcFactory: the SDK's global WebSocket becomes the guarded `ws` one", async () => {
    const engine = new UtxoWatchEngine(URL, ADDRESS);
    await engine.start();
    expect(fake.state.rpcs).toHaveLength(1);
    expect(fake.state.rpcs[0].args).toEqual({ url: URL, encoding: fake.k.Encoding.SerdeJson });
    const now = (globalThis as { WebSocket?: { name?: string } }).WebSocket;
    if (hostWebSocket !== undefined) expect(now).not.toBe(hostWebSocket);
    expect(now?.name).toBe("GuardedWebSocket");
    await engine.stop();
  });
});

describe("G7 h · every call of the watch's own is bounded", () => {
  it("start(): a node that connects but never answers getServerInfo → WALLET_WATCH_NODE_TIMEOUT, client released", async () => {
    fake.state.hangServerInfo = true;
    const engine = new UtxoWatchEngine(URL, ADDRESS, { requestMs: 40 });
    await expect(engine.start()).rejects.toMatchObject({ code: "WALLET_WATCH_NODE_TIMEOUT", metadata: { timeoutMs: 40 } });
    expect(fake.state.rpcs[0].disconnected).toBe(true);
    expect(fake.state.processors).toHaveLength(0);
  });

  it("start(): a first snapshot that never finishes → WALLET_WATCH_NODE_TIMEOUT; if it finishes later it is released", async () => {
    const gate = fake.hold();
    fake.state.trackGate = gate;
    const engine = new UtxoWatchEngine(URL, ADDRESS, { snapshotMs: 40 });
    await expect(engine.start()).rejects.toMatchObject({ code: "WALLET_WATCH_NODE_TIMEOUT" });
    expect(fake.state.rpcs[0].disconnected).toBe(true);
    expect(fake.state.processors[0].stopped).toBe(false);
    gate.release();
    await flush();
    expect(fake.state.processors[0].stopped).toBe(true);
  });

  it("after a reconnection: a hung identity question fails that pass, and the NEXT reconnection re-snapshots again", async () => {
    const errors = vi.spyOn(logger, "error");
    const engine = new UtxoWatchEngine(URL, ADDRESS, { requestMs: 40 });
    const events: any[] = [];
    engine.add((e) => {
      events.push(e);
    });
    await engine.start();
    const processor = fake.state.processors[0];

    fake.state.hangServerInfo = true;
    processor.emit("disconnect");
    processor.emit("connect");
    await sleep(80);
    await flush();
    expect(events).toEqual([]);
    expect(errors.mock.calls.some(([, ctx]: any[]) => ctx?.code === "WALLET_WATCH_NODE_TIMEOUT")).toBe(true);

    // before G7 h the hung pass kept `running` set, so this reconnect returned early and no resync ever came
    fake.state.hangServerInfo = false;
    fake.state.calls.length = 0;
    processor.emit("disconnect");
    processor.emit("connect");
    await flush();
    expect(fake.state.calls).toEqual(["identity", "clear", "track"]);
    expect(events.map((e) => e.type)).toEqual(["resync"]);
    await engine.stop();
  });

  it("a re-snapshot that does not finish is reported (WALLET_WATCH_RESNAPSHOT_TIMEOUT); one that finishes is not", async () => {
    const errors = vi.spyOn(logger, "error");
    const engine = new UtxoWatchEngine(URL, ADDRESS, { snapshotMs: 40 });
    await engine.start();
    const processor = fake.state.processors[0];

    processor.emit("disconnect");
    processor.emit("connect");
    await sleep(80);
    expect(errors.mock.calls.some(([, ctx]: any[]) => ctx?.code === "WALLET_WATCH_RESNAPSHOT_TIMEOUT")).toBe(false);

    const gate = fake.hold();
    fake.state.trackGate = gate;
    processor.emit("disconnect");
    processor.emit("connect");
    await sleep(80);
    expect(errors.mock.calls.some(([, ctx]: any[]) => ctx?.code === "WALLET_WATCH_RESNAPSHOT_TIMEOUT")).toBe(true);
    gate.release();
    await flush();
    await engine.stop();
  });

  it("stop() during a re-snapshot that never settles: bounded, typed, and the client is released", async () => {
    const engine = new UtxoWatchEngine(URL, ADDRESS, { requestMs: 40, snapshotMs: 10_000 });
    await engine.start();
    const processor = fake.state.processors[0];
    fake.state.trackGate = fake.hold(); // never released
    processor.emit("disconnect");
    processor.emit("connect");
    await flush();
    // before G7 h: the handle's stop() waited for the hung re-snapshot, so stop() (and unwatch()) never returned and the
    // client was never disconnected
    await expect(engine.stop()).rejects.toMatchObject({ code: "WALLET_WATCH_NODE_TIMEOUT" });
    expect(fake.state.rpcs[0].disconnected).toBe(true);
  });
});

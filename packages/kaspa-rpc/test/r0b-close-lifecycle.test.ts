import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OfficialRpcSession, type OfficialRpcClientLike, type OfficialRpcFactory } from "../src/upstream/session.js";
import { KaspaWrpcClient } from "../src/wrpc-client.js";
import { startFakeWrpcNode, type FakeWrpcNode } from "./helpers/fake-wrpc-node.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// RESOURCE-LIFECYCLE-1 (R0B) · RL-I4: closing a client while its connect() is still in flight cannot leave a socket or
// a timer alive: the connection that completes afterwards is released, never handed out, and close() returns only
// after that. close() is idempotent and never throws (it runs in finally blocks).

interface StandIn {
  connected: boolean;
  disconnects: number;
  finishConnect(): void;
}

/** A stand-in official client whose connect() completes only when the test says so. */
function deferredOfficialRpc(options: { throwOnDisconnect?: boolean } = {}) {
  const clients: StandIn[] = [];
  const factory: OfficialRpcFactory = () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const rec: StandIn = { connected: false, disconnects: 0, finishConnect: () => finish() };
    clients.push(rec);
    return {
      get isConnected() {
        return rec.connected;
      },
      async connect() {
        await gate;
        rec.connected = true;
      },
      disconnect() {
        rec.disconnects++;
        rec.connected = false;
        // a binding that throws synchronously instead of rejecting
        if (options.throwOnDisconnect) throw new Error("disconnect failed");
        return Promise.resolve();
      },
      addEventListener() {},
      removeEventListener() {},
      async getBlockDagInfo() {
        return { networkName: "kaspa-simnet" };
      }
    } as OfficialRpcClientLike;
  };
  return { factory, clients };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
  expect(cond()).toBe(true);
};

describe("RESOURCE-LIFECYCLE-1 · OfficialRpcSession.close()", () => {
  it("close() while connect() is in flight: the late connection is released, never handed out; close() waits for it", async () => {
    const rpc = deferredOfficialRpc();
    const session = new OfficialRpcSession("ws://127.0.0.1:1", 1000, rpc.factory);
    const request = session.request("getBlockDagInfo").then(
      () => "answered",
      (e: any) => e
    );
    await until(() => rpc.clients.length === 1);

    let closed = false;
    const closing = session.close().then(() => {
      closed = true;
    });
    await settle();
    expect(closed, "close() returned while the connection it must release was still being opened").toBe(false);

    rpc.clients[0]!.finishConnect();
    await closing;
    expect({ connected: rpc.clients[0]!.connected, disconnects: rpc.clients[0]!.disconnects, current: session.current() }).toEqual({ connected: false, disconnects: 1, current: null });
    expect(await request).toMatchObject({ code: "RPC_CLIENT_CLOSED", isRetriable: false });
  });

  it("close() is idempotent: sequential and concurrent calls release a connection once", async () => {
    const rpc = deferredOfficialRpc();
    const session = new OfficialRpcSession("ws://127.0.0.1:1", 1000, rpc.factory);
    const request = session.request("getBlockDagInfo");
    await until(() => rpc.clients.length === 1);
    rpc.clients[0]!.finishConnect();
    await request;
    await Promise.all([session.close(), session.close()]);
    await session.close();
    expect(rpc.clients[0]!.disconnects).toBe(1);
  });

  it("close() never throws, even when the official client's disconnect throws synchronously", async () => {
    const rpc = deferredOfficialRpc({ throwOnDisconnect: true });
    const session = new OfficialRpcSession("ws://127.0.0.1:1", 1000, rpc.factory);
    const request = session.request("getBlockDagInfo");
    await until(() => rpc.clients.length === 1);
    rpc.clients[0]!.finishConnect();
    await request;
    await expect(session.close()).resolves.toBeUndefined();
    expect(rpc.clients[0]!.disconnects).toBe(1);
  });
});

describe("RESOURCE-LIFECYCLE-1 · KaspaWrpcClient.disconnect()", () => {
  it("disconnect() during connect(): connect() is refused, the official client is released, and the client can connect again", async () => {
    const rpc = deferredOfficialRpc();
    const client = new KaspaWrpcClient("ws://127.0.0.1:1", { rpcFactory: rpc.factory });
    const connecting = client.connect(1000).then(
      () => "connected",
      (e: any) => e
    );
    await until(() => rpc.clients.length === 1);
    const disconnecting = client.disconnect();
    rpc.clients[0]!.finishConnect();
    await disconnecting;
    expect(await connecting).toMatchObject({ code: "RPC_CLIENT_CLOSED" });
    expect({ connected: rpc.clients[0]!.connected, disconnects: rpc.clients[0]!.disconnects }).toEqual({ connected: false, disconnects: 1 });

    const again = client.connect(1000);
    await until(() => rpc.clients.length === 2);
    rpc.clients[1]!.finishConnect();
    await again;
    expect(await client.getBlockDagInfo()).toEqual({ networkName: "kaspa-simnet" });
    await client.disconnect();
    expect({ connected: rpc.clients[1]!.connected, disconnects: rpc.clients[1]!.disconnects }).toEqual({ connected: false, disconnects: 1 });
  });
});

// The same property with the real pinned kaspa-wasm RpcClient against a fake wRPC node on loopback: each case runs in a
// child process that does its work and RETURNS; it must then end by itself (no socket or timer left alive).
describe("RESOURCE-LIFECYCLE-1 · a process that closed its client ends by itself (real kaspa-wasm, fake node)", () => {
  const dist = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  let node: FakeWrpcNode;
  let dir: string;
  let script: string;

  beforeAll(async () => {
    node = await startFakeWrpcNode();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r0b-rpc-"));
    script = path.join(dir, "case.mjs");
    fs.writeFileSync(
      script,
      [
        `import { pathToFileURL } from "node:url";`,
        `const [dist, url, kase] = process.argv.slice(2);`,
        `const rpc = await import(pathToFileURL(dist).href);`,
        `const outcome = (p) => p.then(() => "ok", (e) => String(e?.code ?? e?.name));`,
        `if (kase === "close-after-use" || kase === "no-close") {`,
        `  const client = new rpc.JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 5000 });`,
        `  console.log("request", await outcome(client.getBlockDagInfo()));`,
        `  if (kase === "close-after-use") await client.close();`,
        `} else if (kase === "close-during-connect") {`,
        `  const client = new rpc.JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 5000 });`,
        `  const pending = outcome(client.getBlockDagInfo());`,
        `  await client.close();`,
        `  console.log("request", await pending);`,
        `} else if (kase === "disconnect-during-connect") {`,
        `  const client = new rpc.KaspaWrpcClient(url);`,
        `  const pending = outcome(client.connect(5000));`,
        `  await client.disconnect();`,
        `  console.log("connect", await pending);`,
        `}`,
        `console.log("returned");`
      ].join("\n")
    );
  });

  afterAll(async () => {
    await node?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = (kase: string, killAfterMs: number) =>
    new Promise<{ killed: boolean; exit: number | null; out: string }>((resolve) => {
      const env: NodeJS.ProcessEnv = {};
      for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("VITEST") && k !== "NODE_ENV") env[k] = v;
      const child = spawn(process.execPath, [script, dist, node.url, kase], { env, windowsHide: true });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        child.kill();
      }, killAfterMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ killed, exit: killed ? null : code, out: out.trim() });
      });
    });

  it("the harness sees a leak: a client used and never closed keeps the process alive", async () => {
    const r = await run("no-close", 8_000);
    expect(r.killed, r.out).toBe(true);
  });

  it("close() after use: the process ends by itself", async () => {
    const r = await run("close-after-use", 20_000);
    expect({ killed: r.killed, exit: r.exit, returned: r.out.includes("returned") }, r.out).toEqual({ killed: false, exit: 0, returned: true });
  });

  it("JsonWrpcKaspaClient.close() while connect() is in flight: the request is refused and the process ends by itself", async () => {
    const r = await run("close-during-connect", 20_000);
    expect({ killed: r.killed, exit: r.exit, line: /^(?:request|connect) .*$/m.exec(r.out)?.[0]?.trim() }, r.out).toEqual({ killed: false, exit: 0, line: "request RPC_CLIENT_CLOSED" });
  });

  it("KaspaWrpcClient.disconnect() while connect() is in flight: connect() is refused and the process ends by itself", async () => {
    const r = await run("disconnect-during-connect", 20_000);
    expect({ killed: r.killed, exit: r.exit, line: /^(?:request|connect) .*$/m.exec(r.out)?.[0]?.trim() }, r.out).toEqual({ killed: false, exit: 0, line: "connect RPC_CLIENT_CLOSED" });
  });
});

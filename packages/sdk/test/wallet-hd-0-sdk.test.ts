/*
 * WALLET-HD-0 · the SDK route to WalletToolkit (`sdk.wallet.open`) respects the same rule: on an instance declared
 * for a public network the synthetic identity is refused before any address exists; on the simulator/simnet it works
 * as before. The public-network instance talks to a FAKE node on loopback that answers only the identity reads.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BLOCKED = "WALLET_SYNTHETIC_NETWORK_BLOCKED";
const made: string[] = [];
let fake: { url: string; methods: string[]; close(): Promise<void> };

async function startFake(network: string) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const methods: string[] = [];
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      const h = (n: number) => n.toString(16).padStart(64, "0");
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: 1000 });
        case "getInfo":
          return ok({ p2pId: "fake", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network, blockCount: 1, headerCount: 1, tipHashes: [h(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [h(1)], pruningPointHash: h(2), virtualDaaScore: 1000, sink: h(1) });
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    methods,
    close: () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); })
  };
}

function workspace(config: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "whd0-sdk-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), config);
  return ws;
}

const outcome = async (p: Promise<unknown>) => { try { return { ok: true as const, value: await p }; } catch (e: any) { return { ok: false as const, code: String(e?.code ?? ""), message: String(e?.message ?? e) }; } };

beforeAll(async () => { fake = await startFake("testnet-10"); });
afterAll(async () => { await fake.close(); for (const ws of made) fs.rmSync(ws, { recursive: true, force: true }); });

describe("WALLET-HD-0 · sdk.wallet.open on a testnet-10 instance", () => {
  it("create() and receive() refuse the synthetic identity; no address, no UTXO or balance read", async () => {
    const ws = workspace(
      `export default ${JSON.stringify({
        execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
        networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: fake.url } }
      })};\n`
    );
    const sdk = await Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
    try {
      const w = sdk.wallet.open("smoke-test-bot", { storePath: path.join(ws, "w.json") });
      const created = await outcome(w.create());
      expect(created.ok, JSON.stringify(created)).toBe(false);
      expect((created as any).code).toBe(BLOCKED);
      const received = await outcome(w.receive());
      expect(received.ok).toBe(false);
      expect((received as any).code).toBe(BLOCKED);
      const balance = await outcome(w.balance());
      expect((balance as any).code).toBe(BLOCKED);
      expect(fake.methods.filter((m) => m === "getUtxosByAddresses" || m === "getBalanceByAddress" || m === "getBalancesByAddresses")).toEqual([]);
    } finally {
      await sdk.close();
    }
  });
});

describe("WALLET-HD-0 · sdk.wallet.open on the simulator keeps working", () => {
  it("create() + receive() give the pinned simnet address of the wallet name", async () => {
    const ws = workspace(
      'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n'
    );
    const sdk = await Hardkas.open({ cwd: ws });
    try {
      const w = sdk.wallet.open("smoke-test-bot", { storePath: path.join(ws, "w.json") });
      await w.create();
      expect(await w.receive()).toBe("kaspasim:qq6te2qh54u92aj8nz4h503ye5g0f2tj4ctr2msqj550spzqq4q9yqv3pwvfc");
    } finally {
      await sdk.close();
    }
  });
});

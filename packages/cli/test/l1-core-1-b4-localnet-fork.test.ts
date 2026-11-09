// L1-CORE-1 B4 · localnet fork: what it really does, through the built CLI, against a FAKE wRPC node it starts on
// loopback (never a real node, no funds) that the workspace declares as its simnet endpoint. Asserted: the UTXOs of the
// addresses given are copied into the state file named (or .hardkas/localnet.json), with the fork's label and source;
// --json prints no JSON (documented "Not implemented yet"); a node that says it serves another network is refused before
// any UTXO is read; and the refusals that need no node (a simulated source, a public network without an endpoint) are
// typed and contact nothing (the hermetic preload logs every connection of the child).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { cliAsync, envelope, jsonDocs, simulatedWorkspace, removeDir, tempDir } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// two valid simnet addresses (the deterministic dev accounts alice and bob; public, no key involved here)
const A1 = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";
const A2 = "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980";
const DAA = 7_000_000;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");

type Fake = { url: string; methods: string[]; close(): Promise<void> };

/** A loopback wRPC node that says it serves `claim` and holds one UTXO per address asked (amount 10 KAS x (i+1)). */
async function startFake(claim: string): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const methods: string[] = [];
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try {
        params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
      } catch {
        params = undefined;
      }
      methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: claim, hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "fake", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network: claim, blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).map((address: string) => {
              const i = [A1, A2].indexOf(address);
              return {
                address,
                outpoint: { transactionId: hashOf(0xf00 + i), index: 0 },
                utxoEntry: { amount: (i + 1) * 10_00000000, scriptPublicKey: "0000" + "20" + "11".repeat(32) + "ac", blockDaaScore: DAA - 1000 - i, isCoinbase: false }
              };
            })
          });
        default:
          return err(`fake node does not implement ${method}`);
      }
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    methods,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

let parent: string;
let ws: string;
let logs: string;
let fake: Fake;
let liar: Fake;
let originalConfig: string;
let runs = 0;

/** The workspace declares `url` as its simnet node (the rest of the config as `init` wrote it). */
function declareSimnet(url: string) {
  const configPath = path.join(ws, "hardkas.config.ts");
  const next = originalConfig.replace(/rpcUrl:\s*"ws:\/\/127\.0\.0\.1:18210"/, `rpcUrl: ${JSON.stringify(url)}`);
  if (next === originalConfig) throw new Error(`no simnet rpcUrl in the init config:\n${originalConfig}`);
  fs.writeFileSync(configPath, next);
}

async function fork(args: string[]) {
  const log = path.join(logs, `fork-${++runs}.net.log`);
  const r = await cliAsync(["localnet", "fork", ...args], ws, { env: hermeticChildEnv(log), killAfterMs: 120_000 });
  const net = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t").slice(1, 3).join(" ")) : [];
  return { ...r, net };
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  ({ parent, ws } = simulatedWorkspace("hk-b4-localnet-fork-"));
  logs = tempDir("hk-b4-localnet-fork-logs-");
  originalConfig = fs.readFileSync(path.join(ws, "hardkas.config.ts"), "utf8");
  fake = await startFake("simnet");
  liar = await startFake("testnet-10");
});
afterAll(async () => {
  await fake?.close();
  await liar?.close();
  removeDir(parent);
  removeDir(logs);
});

describe("localnet fork", () => {
  it("--output <file>: the addresses' current UTXOs from the declared node, labelled with --at-daa-score, exit 0", async () => {
    declareSimnet(fake.url);
    const out = path.join(ws, "forked.json");
    const r = await fork(["--network", "simnet", "--addresses", A1, A2, "--at-daa-score", "123", "--output", out]);
    expect(r.status, r.all.slice(0, 1200)).toBe(0);
    expect(r.all).toMatch(/Forked state saved to/);
    expect(r.all).toMatch(/UTXOs: 2/);

    const state = JSON.parse(fs.readFileSync(out, "utf8"));
    expect({ networkId: state.networkId, mode: state.mode, daaScore: state.daaScore }).toEqual({ networkId: "simnet", mode: "simulator", daaScore: "123" });
    expect(state.accounts).toEqual([
      { name: "forked_0", address: A1 },
      { name: "forked_1", address: A2 }
    ]);
    expect(state.utxos.map((u: any) => [u.id, u.address, u.amountSompi, u.spent])).toEqual([
      [`${hashOf(0xf00)}:0`, A1, "1000000000", false],
      [`${hashOf(0xf01)}:0`, A2, "2000000000", false]
    ]);
    expect(state.forkSource).toMatchObject({ network: "simnet", rpcUrl: fake.url, daaScore: "123", addresses: [A1, A2] });
    // the identity of the node was asked before its UTXOs, and only the declared node was contacted
    expect(fake.methods.indexOf("getServerInfo")).toBeGreaterThanOrEqual(0);
    expect(fake.methods.indexOf("getServerInfo")).toBeLessThan(fake.methods.indexOf("getUtxosByAddresses"));
    const port = new URL(fake.url).port;
    expect(r.net.every((l) => l.endsWith(`127.0.0.1:${port}`)), r.net.join("\n")).toBe(true);
  });

  it("--json (documented: not implemented, no JSON is printed): stdout carries no JSON; the default state file is replaced", async () => {
    declareSimnet(fake.url);
    const statePath = path.join(ws, ".hardkas", "localnet.json");
    const r = await fork(["--network", "simnet", "--addresses", A1, "--at-daa-score", "456", "--json"]);
    expect(r.status, r.all.slice(0, 1200)).toBe(0);
    expect(jsonDocs(r.stdout)).toEqual([]);
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect({ networkId: state.networkId, daaScore: state.daaScore, utxos: state.utxos.length }).toEqual({ networkId: "simnet", daaScore: "456", utxos: 1 });
  });

  it("a node that says it serves another network: refused (exit 1) before any UTXO is read, nothing written", async () => {
    declareSimnet(liar.url);
    const out = path.join(ws, "forked-from-liar.json");
    const r = await fork(["--network", "simnet", "--addresses", A1, "--at-daa-score", "1", "--output", out, "--json"]);
    expect(r.status, r.all.slice(0, 1200)).toBe(1);
    expect(envelope(r.stdout)).toMatchObject({ ok: false, code: "FORKING_FAILED" });
    expect(String(envelope(r.stdout)?.message)).toMatch(/NODE_NETWORK_MISMATCH|testnet-10/);
    expect(liar.methods).not.toContain("getUtxosByAddresses");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("--network simulated: a typed usage refusal (there is no node to fork from), nothing contacted", async () => {
    const r = await fork(["--network", "simulated", "--at-daa-score", "1", "--json"]);
    expect(r.status, r.all.slice(0, 1200)).toBe(2);
    expect(envelope(r.stdout)).toMatchObject({ ok: false, code: "LOCALNET_FORK_SOURCE_SIMULATED" });
    expect(r.net).toEqual([]);
  });

  it("a public network the workspace declares no endpoint for: NETWORK_ENDPOINT_REQUIRED, nothing contacted", async () => {
    const r = await fork(["--network", "testnet-10", "--addresses", "kaspatest:qqnothing", "--at-daa-score", "1", "--json"]);
    expect(r.status, r.all.slice(0, 1200)).not.toBe(0);
    expect(envelope(r.stdout)).toMatchObject({ ok: false, code: "NETWORK_ENDPOINT_REQUIRED" });
    expect(r.net).toEqual([]);
  });
});

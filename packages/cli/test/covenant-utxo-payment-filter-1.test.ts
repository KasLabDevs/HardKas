import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1 (2026-10-25), through the built CLI. The node lists a covenant's UTXO (KIP-20 covenant
// id) at the payer's address next to ordinary ones. `tx plan` (the planner behind `tx send` and `tx batch` too) and
// `accounts consolidate` copied the UTXOs without the covenant id, so the pinned Generator spent the covenant's UTXO
// like any other and ended the covenant. Now: the plan spends only the ordinary UTXOs; with none it is refused; a
// consolidation does not count or spend the covenant's. Loopback fake testnet-10 node, throwaway addresses, no keys,
// nothing signed or sent; every child under the hermetic preload.
// -----------------------------------------------------------------------------

type Entry = { txid: string; sompi: number; covenantId?: string };
const DAA = 50_000_000;
const KAS = 100_000_000;
const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const COVENANT_ID = hashOf("covenant-utxo-payment-filter-1 covenant");
let kaspa: any;
let payer = "";
let payee = "";
const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};

type Fake = { url: string; methods: string[]; close(): Promise<void> };
async function startFake(entries: Entry[]): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const fake: Fake = { url: "", methods: [], close: async () => {} };
  const sink = hashOf("sink");
  const zero = "0".repeat(64);
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      fake.methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "cuf1", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network: "testnet-10", blockCount: 10, headerCount: 10, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: hashOf("pp"), virtualDaaScore: DAA, sink });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getBlock":
          return ok({ block: { header: { hash: sink, version: 1, parentsByLevel: [], hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: Date.now(), bits: 1, nonce: 0, daaScore: DAA, blueWork: "1", blueScore: DAA, pruningPoint: zero }, transactions: [], verboseData: { hash: sink, difficulty: 1, selectedParentHash: zero, transactionIds: [], isHeaderOnly: false, blueScore: DAA, childrenHashes: [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: true } } });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) =>
              (address === payer ? entries : []).map((e) => ({
                address,
                outpoint: { transactionId: e.txid, index: 0 },
                utxoEntry: { amount: e.sompi, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false, ...(e.covenantId ? { covenantId: e.covenantId } : {}) }
              }))
            )
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, sending: [], receiving: [] })) });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: address === payer ? entries.reduce((s, e) => s + e.sompi, 0) : 0 })) });
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  fake.url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); });
  return fake;
}

const made: string[] = [];
const fakes: Fake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1-netlogs-"));
made.push(logs);

// Asynchronous on purpose: the fake lives in this process, a synchronous spawn would freeze it.
async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 170_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
    child.stdin.end();
  });
  let json: any;
  try { json = JSON.parse(r.stdout.trim()); } catch { json = undefined; }
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { ...r, json, dialled, brief: `exit ${r.status}\n${r.stdout.slice(0, 2000)}\n${r.stderr.slice(-1500)}` };
}

async function workspace(entries: Entry[]): Promise<string> {
  const fake = await startFake(entries);
  fakes.push(fake);
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1-cli-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    defaultNetwork: "testnet-10",
    execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: fake.url } },
    accounts: {
      payer: { kind: "kaspa", network: "testnet-10", address: payer },
      payee: { kind: "kaspa", network: "testnet-10", address: payee }
    }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}
const nonLoopback = (dialled: string[]) => dialled.filter((l) => /\t(REFUSED_CONNECT|REFUSED_DNS)\t/.test(l));

beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  payer = new kaspa.PrivateKey(hashOf("cuf1 payer")).toPublicKey().toAddress("testnet-10").toString();
  payee = new kaspa.PrivateKey(hashOf("cuf1 payee")).toPublicKey().toAddress("testnet-10").toString();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const COVENANT: Entry = { txid: hashOf("covenant utxo"), sompi: 100 * KAS, covenantId: COVENANT_ID };
const ORDINARY: Entry = { txid: hashOf("ordinary utxo"), sompi: 50 * KAS };
const ordinaries = (n: number): Entry[] => Array.from({ length: n }, (_, i) => ({ txid: hashOf(`ordinary ${i}`), sompi: (20 + i) * KAS }));
const covenants = (n: number): Entry[] => Array.from({ length: n }, (_, i) => ({ txid: hashOf(`covenant ${i}`), sompi: (90 + i) * KAS, covenantId: hashOf(`covenant id ${i}`) }));

describe("COVENANT-UTXO-PAYMENT-FILTER-1 · CLI", () => {
  it("CC-1 mixed: `tx plan` spends the ordinary UTXO, never the covenant's one listed first", async () => {
    const ws = await workspace([COVENANT, ORDINARY]);
    const r = await run("cc1", ["tx", "plan", "--from", "payer", "--to", "payee", "--amount", "1", "--out", "plan.json", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    const plan = JSON.parse(fs.readFileSync(path.join(ws, "plan.json"), "utf8"));
    expect(plan.inputs.map((i: any) => i.outpoint.transactionId), r.brief).toEqual([ORDINARY.txid]);
    expect(nonLoopback(r.dialled)).toEqual([]);
  });

  it("CC-2 covenant UTXOs only: `tx plan` is refused and writes no plan", async () => {
    const ws = await workspace([COVENANT]);
    const r = await run("cc2", ["tx", "plan", "--from", "payer", "--to", "payee", "--amount", "1", "--out", "plan.json", "--json"], ws);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.stdout + r.stderr, r.brief).toMatch(/covenant/i);
    expect(fs.existsSync(path.join(ws, "plan.json"))).toBe(false);
    expect(nonLoopback(r.dialled)).toEqual([]);
  });

  it("CC-3 control, ordinary UTXOs only: `tx plan` spends them as before", async () => {
    const ws = await workspace([ORDINARY]);
    const r = await run("cc3", ["tx", "plan", "--from", "payer", "--to", "payee", "--amount", "1", "--out", "plan.json", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    const plan = JSON.parse(fs.readFileSync(path.join(ws, "plan.json"), "utf8"));
    expect(plan.inputs.map((i: any) => i.outpoint.transactionId)).toEqual([ORDINARY.txid]);
  });

  it("CC-4 `accounts consolidate --dry-run` counts and batches the ordinary UTXOs only", async () => {
    const ws = await workspace([...covenants(2), ...ordinaries(3)]);
    const r = await run("cc4", ["accounts", "consolidate", "payer", "--target-utxos", "1", "--dry-run", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.before, r.brief).toBe(3);
    expect(nonLoopback(r.dialled)).toEqual([]);
  });
});

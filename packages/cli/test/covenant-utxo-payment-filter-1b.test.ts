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
// COVENANT-UTXO-PAYMENT-FILTER-1B (F1.0-bis, 2026-10-25), through the built CLI. `tx plan` writes a plan over an ordinary
// UTXO; then the node lists that same outpoint as a covenant's UTXO (or no longer lists it). `tx sign` asks the node
// before signing and refuses: nothing is signed and no signed artifact is written. Loopback fake testnet-10 node,
// throwaway key in an environment variable, nothing sent; every child under the hermetic preload.
// -----------------------------------------------------------------------------

type Entry = { txid: string; sompi: number; covenantId?: string };
const DAA = 50_000_000;
const KAS = 100_000_000;
const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const COVENANT_ID = hashOf("covenant-utxo-payment-filter-1b cli covenant");
const PAYER_KEY = hashOf("cuf1b cli payer");
const KEY_ENV = "HK_CUF1B_PAYER_KEY";
let kaspa: any;
let payer = "";
let payee = "";
const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};

type Fake = { url: string; close(): Promise<void> };
async function startFake(state: { entries: Entry[] }): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const sink = hashOf("sink");
  const zero = "0".repeat(64);
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "cuf1b", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
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
              (address === payer ? state.entries : []).map((e) => ({
                address,
                outpoint: { transactionId: e.txid, index: 0 },
                utxoEntry: { amount: e.sompi, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false, ...(e.covenantId ? { covenantId: e.covenantId } : {}) }
              }))
            )
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, sending: [], receiving: [] })) });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: address === payer ? state.entries.reduce((s, e) => s + e.sompi, 0) : 0 })) });
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); }) };
}

const made: string[] = [];
const fakes: Fake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1b-netlogs-"));
made.push(logs);

// Asynchronous on purpose: the fake lives in this process, a synchronous spawn would freeze it.
async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: { ...hermeticChildEnv(log), [KEY_ENV]: PAYER_KEY } });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 170_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
    child.stdin.end();
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { ...r, dialled, brief: `exit ${r.status}\n${r.stdout.slice(0, 2000)}\n${r.stderr.slice(-1500)}` };
}

async function workspace(state: { entries: Entry[] }): Promise<string> {
  const fake = await startFake(state);
  fakes.push(fake);
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1b-cli-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    defaultNetwork: "testnet-10",
    execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: fake.url } },
    accounts: {
      payer: { kind: "kaspa", network: "testnet-10", address: payer, privateKeyEnv: KEY_ENV },
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
  payer = new kaspa.PrivateKey(PAYER_KEY).toPublicKey().toAddress("testnet-10").toString();
  payee = new kaspa.PrivateKey(hashOf("cuf1b cli payee")).toPublicKey().toAddress("testnet-10").toString();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const ORDINARY: Entry = { txid: hashOf("cli ordinary utxo"), sompi: 50 * KAS };

/** `tx plan` while the node lists ORDINARY, `between` changes what the node says, then `tx sign`. */
async function planThenSign(name: string, between: (state: { entries: Entry[] }) => void) {
  const state = { entries: [{ ...ORDINARY }] };
  const ws = await workspace(state);
  const planned = await run(`${name}-plan`, ["tx", "plan", "--from", "payer", "--to", "payee", "--amount", "1", "--out", "plan.json", "--json"], ws);
  expect(planned.status, planned.brief).toBe(0);
  between(state);
  const signed = await run(`${name}-sign`, ["tx", "sign", "plan.json", "--account", "payer", "--out", "signed.json", "--json"], ws);
  return { ws, signed, wroteSigned: fs.existsSync(path.join(ws, "signed.json")) };
}

describe("COVENANT-UTXO-PAYMENT-FILTER-1B · CLI tx sign", () => {
  it("CB-C1 control: the node lists the input as an ordinary UTXO; `tx sign` signs and writes the signed artifact", async () => {
    const r = await planThenSign("cbc1", () => undefined);
    expect(r.signed.status, r.signed.brief).toBe(0);
    expect(r.wroteSigned).toBe(true);
    expect(nonLoopback(r.signed.dialled)).toEqual([]);
  });

  it("CB-C2 the node lists the planned input as a covenant's UTXO: `tx sign` refuses and writes nothing", async () => {
    const r = await planThenSign("cbc2", (state) => { state.entries = [{ ...ORDINARY, covenantId: COVENANT_ID }]; });
    expect(r.signed.status, r.signed.brief).not.toBe(0);
    expect(r.signed.stdout + r.signed.stderr, r.signed.brief).toMatch(/COVENANT_UTXO_NOT_PAYMENT_INPUT/);
    expect(r.wroteSigned).toBe(false);
    expect(nonLoopback(r.signed.dialled)).toEqual([]);
  });

  it("CB-C3 the node no longer lists the planned input: `tx sign` cannot check it, refuses and writes nothing", async () => {
    const r = await planThenSign("cbc3", (state) => { state.entries = []; });
    expect(r.signed.status, r.signed.brief).not.toBe(0);
    expect(r.signed.stdout + r.signed.stderr, r.signed.brief).toMatch(/COVENANT_UTXO_UNVERIFIED/);
    expect(r.wroteSigned).toBe(false);
  });
});

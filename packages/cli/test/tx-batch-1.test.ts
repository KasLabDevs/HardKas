import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

// -----------------------------------------------------------------------------
// TX-BATCH-1 (2026-10-21). Found by the simnet regression of 2026-10-21 on a real rusty-kaspad 2.1.0:
//   1. a payroll paid from an account with few UTXOs failed: its third payment selected the two inputs the first one had
//      just spent (the node had dropped that transaction from its mempool, but its UTXO index still listed the inputs),
//      and the node refused it ("orphan where orphan is disallowed");
//   2. `tx batch` could not pay from an encrypted account: no --password-env / --password-stdin, and without a terminal
//      every payment failed at signing with KEYSTORE_PASSWORD_REQUIRED (after the plaintext payers had been paid).
// Fixed: a batch never selects what its earlier payments spent; a payment that cannot be funded while the node's index
// still lists them waits for the index (bounded) and reads again; the password is read once, before the first payment,
// and checked against every encrypted payer's keystore, so a missing or wrong one stops the batch before anything is sent.
// The payroll with few UTXOs (the failing one) and the one with many UTXOs (the demo's original, which worked) both run.
// The fake node behaves like kaspad: a mempool, a consensus UTXO set, a UTXO index that lags behind it, UTXOs listed in
// no particular order, kaspad's rejection texts. A transaction enters a block when the next one is accepted (or after
// MINE_FALLBACK_MS); the index shows the block INDEX_LAG_MS later. Loopback only, never a real node, no funds. Built CLI,
// real pinned kaspa-wasm (planner, signer, official txid). Traces in $HARDKAS_TB_TRACE_DIR.
// -----------------------------------------------------------------------------

const DAA0 = 20_000_000;
const INDEX_LAG_MS = 8_000;
const MINE_FALLBACK_MS = 15_000;
const KAS = 100_000_000n;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const short = (k: string) => `${k.slice(0, 8)}…:${k.split(":")[1]}`;

type Utxo = { address: string; amount: bigint; spk: string; daa: number; coinbase: boolean };
type Tx = { id: string; inputs: string[]; inputAmount: bigint; owners: string[]; outputs: Array<[string, Utxo]>; raw: unknown };

let kaspa: any;
/** The official id of a transaction as the node receives it (EXPECTED-TXID-1). */
let txIdOf: (transaction: unknown) => string;
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return Number(spk.version).toString(16).padStart(4, "0") + script;
}
const spkOf = (s: any): string =>
  typeof s === "string" ? s : Number(s?.version ?? 0).toString(16).padStart(4, "0") + String(s?.script ?? s?.scriptPublicKey ?? "");

/** kaspad lists an address's UTXOs from a hash map: no particular order. Deterministic here (seeded). */
function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class FakeSimnet {
  url = "";
  readonly virtual = new Map<string, Utxo>();
  readonly index = new Map<string, Utxo>();
  readonly mempool = new Map<string, Tx>();
  readonly accepted: Tx[] = [];
  readonly rejected: Array<{ id: string; inputs: string[]; reason: string }> = [];
  readonly methods: string[] = [];
  readonly utxoReads = new Map<string, number>();
  readonly timeline: string[] = [];
  private readonly chain: string[] = [sha("tb1-chain-0")];
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly unindexed: Tx[] = [];
  private readonly random: () => number;
  private readonly t0 = Date.now();
  private server!: WebSocketServer;

  constructor(
    private readonly label: string,
    private readonly addressBySpk: Map<string, string>,
    seed: number
  ) {
    this.random = mulberry32(seed);
  }

  /** Outputs the address owns before the batch, in the consensus set and the index alike. */
  fund(address: string, amounts: bigint[], coinbase = false): void {
    amounts.forEach((amount, i) => {
      const key = `${sha(`${this.label}-fund-${address}-${i}`)}:0`;
      const u: Utxo = { address, amount, spk: spkHex(address), daa: coinbase ? DAA0 - 1_000_000 - i : DAA0 - 5_000 - i, coinbase };
      this.virtual.set(key, u);
      this.index.set(key, u);
    });
  }
  balance(address: string): bigint {
    let total = 0n;
    for (const u of this.index.values()) if (u.address === address) total += u.amount;
    return total;
  }
  submits(): number {
    return this.methods.filter((m) => m === "submitTransaction").length;
  }
  /** Everything accepted enters a block and the index catches up: the state a later observer sees. */
  flush(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const tx of [...this.mempool.values()]) this.mine(tx);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const tx of [...this.unindexed]) this.indexApply(tx);
  }
  async start(): Promise<void> {
    this.server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((r, j) => {
      this.server.on("listening", () => r());
      this.server.on("error", j);
    });
    this.url = `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    this.server.on("connection", (socket) => socket.on("message", (data) => this.handle(socket, String(data))));
  }
  close(): Promise<void> {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    return new Promise((r) => {
      for (const c of this.server.clients) c.terminate();
      this.server.close(() => r());
    });
  }

  private note(what: string): void {
    this.timeline.push(`${String(Date.now() - this.t0).padStart(6)} ms ${what}`);
  }
  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }
  private daa(): number {
    return DAA0 + this.chain.length - 1;
  }
  /** A block takes the transaction: it leaves the mempool and enters the consensus set; the index follows later. */
  private mine(tx: Tx): void {
    if (!this.mempool.delete(tx.id)) return;
    this.chain.push(sha(`tb1-${this.label}-chain-${this.chain.length}`));
    for (const k of tx.inputs) this.virtual.delete(k);
    for (const [k, u] of tx.outputs) this.virtual.set(k, { ...u, daa: this.daa() });
    this.unindexed.push(tx);
    this.note(`mined ${tx.id.slice(0, 8)} (out of the mempool; the index still shows its inputs)`);
    this.later(INDEX_LAG_MS, () => this.indexApply(tx));
  }
  private indexApply(tx: Tx): void {
    const at = this.unindexed.indexOf(tx);
    if (at < 0) return;
    this.unindexed.splice(at, 1);
    for (const k of tx.inputs) this.index.delete(k);
    for (const [k] of tx.outputs) this.index.set(k, this.virtual.get(k) ?? tx.outputs.find(([o]) => o === k)![1]);
    this.note(`indexed ${tx.id.slice(0, 8)}`);
  }

  private handle(socket: any, text: string): void {
    const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
    const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
    let params: any;
    try {
      params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
    } catch {
      params = undefined;
    }
    this.methods.push(method);
    if (!id) return;
    const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
    const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
    const tip = this.chain.length - 1;
    const sink = this.chain[tip]!;
    switch (method) {
      case "getServerInfo":
        return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "simnet", hasUtxoIndex: true, isSynced: true, virtualDaaScore: this.daa() });
      case "getInfo":
        return ok({ p2pId: this.label, mempoolSize: this.mempool.size, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
      case "getBlockDagInfo":
        return ok({ network: "simnet", blockCount: tip + 1, headerCount: tip + 1, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: this.chain[0], virtualDaaScore: this.daa(), sink });
      case "getSinkBlueScore":
        return ok({ blueScore: this.daa() });
      case "getFeeEstimate":
        return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
      case "getBlock": {
        const i = this.chain.indexOf(params?.hash);
        if (i < 0) return err(`cannot find header ${params?.hash}`);
        const zero = "0".repeat(64);
        const hash = this.chain[i]!;
        return ok({
          block: {
            header: { hash, version: 1, parentsByLevel: i > 0 ? [[this.chain[i - 1]]] : [], hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: 1792088193138 + i * 100, bits: 486722099, nonce: 0, daaScore: DAA0 + i, blueWork: ((DAA0 + i) * 1000).toString(16), blueScore: DAA0 + i, pruningPoint: this.chain[0] },
            transactions: [],
            verboseData: { hash, difficulty: 1, selectedParentHash: i > 0 ? this.chain[i - 1] : zero, transactionIds: [], isHeaderOnly: false, blueScore: DAA0 + i, childrenHashes: [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: true }
          }
        });
      }
      case "getUtxosByAddresses": {
        const addresses: string[] = params?.addresses ?? [];
        for (const a of addresses) this.utxoReads.set(a, (this.utxoReads.get(a) ?? 0) + 1);
        const entries = [...this.index]
          .filter(([, u]) => addresses.includes(u.address))
          .map(([k, u]) => ({
            address: u.address,
            outpoint: { transactionId: k.split(":")[0], index: Number(k.split(":")[1]) },
            utxoEntry: { amount: Number(u.amount), scriptPublicKey: u.spk, blockDaaScore: u.daa, isCoinbase: u.coinbase }
          }));
        return ok({ entries: shuffled(entries, this.random) });
      }
      case "getMempoolEntriesByAddresses": {
        const addresses: string[] = params?.addresses ?? [];
        // kaspad 2.1.0 JSON: the entry flag is snake_case `is_orphan`
        const entryOf = (tx: Tx) => ({ fee: 1000, is_orphan: false, transaction: tx.raw });
        const pool = [...this.mempool.values()];
        return ok({
          entries: addresses.map((address) => ({
            address,
            sending: pool.filter((tx) => tx.owners.includes(address)).map(entryOf),
            receiving: pool.filter((tx) => tx.outputs.some(([, u]) => u.address === address)).map(entryOf)
          }))
        });
      }
      case "getMempoolEntry":
        return err(`Transaction ${params?.transactionId} not found`);
      case "submitTransaction": {
        const raw = params?.transaction;
        const txId = txIdOf(raw);
        const inputs: string[] = (raw?.inputs ?? []).map((i: any) => `${i.previousOutpoint.transactionId}:${Number(i.previousOutpoint.index)}`);
        const reject = (reason: string) => {
          this.rejected.push({ id: txId, inputs, reason });
          this.note(`REJECTED ${txId.slice(0, 8)} inputs=${inputs.map(short).join(",")}: ${reason}`);
          return err(`Rejected transaction ${txId}: ${reason}`);
        };
        // rusty-kaspa 2.1.0 mining/errors/src/mempool.rs: RejectDoubleSpendInMempool, RejectDisallowedOrphan
        for (const k of inputs) {
          const other = [...this.mempool.values()].find((t) => t.inputs.includes(k));
          if (other) return reject(`output ${k} already spent by transaction ${other.id} in the memory pool`);
        }
        if (inputs.some((k) => !this.virtual.has(k))) return reject(`transaction ${txId} is an orphan where orphan is disallowed`);
        const owners = inputs.map((k) => this.virtual.get(k)!.address);
        const inputAmount = inputs.reduce((s, k) => s + this.virtual.get(k)!.amount, 0n);
        const outputs: Array<[string, Utxo]> = (raw?.outputs ?? []).map((o: any, j: number) => {
          const spk = spkOf(o.scriptPublicKey);
          return [`${txId}:${j}`, { address: this.addressBySpk.get(spk) ?? `unknown:${spk}`, amount: BigInt(String(o.value ?? o.amount)), spk, daa: 0, coinbase: false }];
        });
        // a block takes what was waiting in the mempool
        for (const waiting of [...this.mempool.values()]) this.mine(waiting);
        const tx: Tx = { id: txId, inputs, inputAmount, owners, outputs, raw };
        this.mempool.set(txId, tx);
        this.accepted.push(tx);
        this.note(`accepted ${txId.slice(0, 8)} inputs=${inputs.map(short).join(",")}`);
        this.later(MINE_FALLBACK_MS, () => this.mine(tx));
        return ok({ transactionId: txId });
      }
      default:
        return err(`fake ${this.label} does not implement ${method}`);
    }
  }
}

const PW = "tb1-test-password-only";
const traceDir = process.env.HARDKAS_TB_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}
const made: string[] = [];
const fakes: FakeSimnet[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tb1-netlogs-"));
made.push(logs);

// Asynchronous on purpose: the fake lives in this process, a synchronous spawn would freeze it.
async function run(name: string, args: string[], cwd: string, opts: { env?: Record<string, string>; stdin?: string } = {}) {
  const log = path.join(logs, `${name}.net.log`);
  const t0 = Date.now();
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log, opts.env ?? {}) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 280_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
    if (opts.stdin !== undefined) child.stdin.write(opts.stdin);
    child.stdin.end();
  });
  let json: any;
  for (const chunk of r.stdout.split(/\r?\n(?=[{\[])/)) {
    try {
      const d = JSON.parse(chunk.trim());
      if (d && typeof d === "object" && !Array.isArray(d)) json = json ?? d;
    } catch {
      /* not a document */
    }
  }
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { ...r, json, ms: Date.now() - t0, dialled, brief: `exit ${r.status}\n${r.stdout.slice(0, 3000)}\n${r.stderr.slice(-1500)}` };
}

let template: string;
const address: Record<string, string> = {};
const addressBySpk = new Map<string, string>();
const PLAINTEXT = ["payroll", "miner", "bob", "carol", "dave", "charlie"];

function workspace(fake: FakeSimnet): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tb1-"));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), config(fake.url));
  return ws;
}
const config = (url: string) =>
  `export default ${JSON.stringify({
    execution: { default: "own", targets: { own: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    network: { allowPublic: false },
    networks: { simnet: { kind: "kaspa-rpc", network: "simnet", rpcUrl: url } }
  })};\n`;
async function fakeFor(label: string, seed: number): Promise<FakeSimnet> {
  const fake = new FakeSimnet(label, addressBySpk, seed);
  await fake.start();
  fakes.push(fake);
  return fake;
}
async function batch(name: string, ws: string, payments: unknown, args: string[] = [], opts: { env?: Record<string, string>; stdin?: string } = {}) {
  fs.writeFileSync(path.join(ws, `${name}.json`), JSON.stringify(payments));
  return run(name, ["tx", "batch", "--file", `${name}.json`, "--network", "simnet", "--json", ...args], ws, opts);
}
/** Every file HardKAS wrote in the workspace that contains `secret`. */
function filesContaining(ws: string, secret: string): string[] {
  const out: string[] = [];
  for (const rel of fs.readdirSync(ws, { recursive: true }) as string[]) {
    const p = path.join(ws, String(rel));
    if (!fs.statSync(p).isFile()) continue;
    if (fs.readFileSync(p).toString("latin1").includes(secret)) out.push(String(rel));
  }
  return out;
}
const plansIn = (ws: string): string[] => {
  const dir = path.join(ws, ".hardkas", "artifacts");
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true }) as string[]).map(String).filter((f) => /txPlan|plan/i.test(path.basename(f)) && f.endsWith(".json"));
};
/** The node's view of a run: what it accepted (with fees), what it refused. */
const nodeView = (fake: FakeSimnet) => ({
  accepted: fake.accepted.map((t) => ({
    txId: t.id,
    inputs: t.inputs,
    outputs: t.outputs.map(([k, u]) => ({ outpoint: k, address: u.address, sompi: u.amount })),
    feeSompi: t.inputAmount - t.outputs.reduce((s, [, u]) => s + u.amount, 0n)
  })),
  rejected: fake.rejected,
  utxoReads: Object.fromEntries(fake.utxoReads),
  timeline: fake.timeline
});
function expectDisjointInputs(fake: FakeSimnet) {
  const seen = new Set<string>();
  for (const tx of fake.accepted) {
    for (const k of tx.inputs) {
      expect(seen.has(k), `input ${k} spent twice`).toBe(false);
      seen.add(k);
    }
  }
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  txIdOf = (await import(pathToFileURL(path.join(repoRoot, "packages", "kaspa-rpc", "dist", "index.js")).href)).officialTxIdOf;
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tb1-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  fs.writeFileSync(path.join(template, "hardkas.config.ts"), config("ws://127.0.0.1:1"));
  for (const name of PLAINTEXT) {
    const r = await run(`gen-${name}`, ["accounts", "real", "generate", "--name", name, "--network", "simnet", "--unsafe-plaintext", "--yes", "--json"], template);
    expect(r.status, r.brief).toBe(0);
  }
  const enc = await run("gen-alice", ["accounts", "real", "generate", "--name", "alice", "--network", "simnet", "--password-env", "HK_TB_PW", "--json"], template, { env: { HK_TB_PW: PW } });
  expect(enc.status, enc.brief).toBe(0);
  const store = JSON.parse(fs.readFileSync(path.join(template, ".hardkas", "accounts.real.json"), "utf8"));
  for (const a of store.accounts) {
    address[a.name] = a.address;
    addressBySpk.set(spkHex(a.address), a.address);
  }
  for (const name of [...PLAINTEXT, "alice"]) expect(address[name], name).toMatch(/^kaspasim:/);
});

afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("TX-BATCH-1 · tx batch on a node whose UTXO index lags behind its mempool", () => {
  it("few UTXOs (the payroll of the simnet regression): 3 of 3 accepted, no input spent twice, the third paid from the first one's change", async () => {
    const fake = await fakeFor("few", 0x5eed01);
    fake.fund(address.payroll!, [10n * KAS, 10n * KAS, 10n * KAS]);
    const ws = workspace(fake);
    const r = await batch("payroll-few", ws, { payments: [{ from: "payroll", to: "bob", amount: "1" }, { from: "payroll", to: "carol", amount: "2" }, { from: "payroll", to: "dave", amount: "3" }] });
    const view = nodeView(fake);
    trace("few-utxos", { exit: r.status, ms: r.ms, output: r.json, node: view, stderrTail: r.stderr.slice(-2000) });
    expect(fake.rejected, `the node refused a payment\n${fake.timeline.join("\n")}`).toEqual([]);
    expect(r.status, r.brief).toBe(0);
    expect(r.json).toMatchObject({ ok: true, batchSize: 3, successCount: 3, failCount: 0 });
    expect(r.json.results.map((x: any) => x.txId)).toEqual(fake.accepted.map((t) => t.id));
    expectDisjointInputs(fake);
    // as on the real node, the first payment took two of the three outputs and the second the third one: the third
    // payment could only be paid from change, which the index showed after the first payment's block
    const [t1, t2, t3] = fake.accepted;
    expect(t1!.inputs.length + t2!.inputs.length, "the first two payments spent the three original outputs").toBe(3);
    for (const k of t3!.inputs) expect([t1!.id, t2!.id], `third payment input ${k}`).toContain(k.split(":")[0]);
    fake.flush();
    expect(fake.balance(address.bob!)).toBe(1n * KAS);
    expect(fake.balance(address.carol!)).toBe(2n * KAS);
    expect(fake.balance(address.dave!)).toBe(3n * KAS);
    const fees = view.accepted.reduce((s, t) => s + t.feeSompi, 0n);
    for (const t of view.accepted) expect(t.feeSompi > 0n && t.feeSompi < KAS, `fee of ${t.txId}`).toBe(true);
    expect(fake.balance(address.payroll!)).toBe(30n * KAS - 6n * KAS - fees);
  });

  it("many UTXOs (the demo's original payroll, from the miner): 3 of 3 accepted with no wait — the reads of an ordinary plan — and no input spent twice", async () => {
    const fake = await fakeFor("many", 0x5eed02);
    fake.fund(address.miner!, Array.from({ length: 40 }, () => 50n * KAS), true);
    const ws = workspace(fake);
    const r = await batch("payroll-many", ws, { payments: [{ from: "miner", to: "alice", amount: "5" }, { from: "miner", to: "bob", amount: "5" }, { from: "miner", to: "charlie", amount: "5" }] });
    const view = nodeView(fake);
    trace("many-utxos", { exit: r.status, ms: r.ms, output: r.json, node: view });
    expect(fake.rejected, fake.timeline.join("\n")).toEqual([]);
    expect(r.status, r.brief).toBe(0);
    expect(r.json).toMatchObject({ ok: true, batchSize: 3, successCount: 3, failCount: 0 });
    expectDisjointInputs(fake);
    // every input is one of the miner's original outputs, and each plan read the index exactly twice (read + re-check)
    for (const tx of fake.accepted) for (const k of tx.inputs) expect(fake.accepted.map((t) => t.id)).not.toContain(k.split(":")[0]);
    expect(fake.utxoReads.get(address.miner!)).toBe(6);
    fake.flush();
    for (const who of ["alice", "bob", "charlie"]) expect(fake.balance(address[who]!), who).toBe(5n * KAS);
  });

  it("a payer paid earlier in the same batch: its payment waits for the index to show that payment, then is accepted", async () => {
    const fake = await fakeFor("dependent", 0x5eed03);
    fake.fund(address.payroll!, [10n * KAS]);
    const ws = workspace(fake);
    const r = await batch("dependent", ws, [{ from: "payroll", to: "bob", amount: "5" }, { from: "bob", to: "carol", amount: "1" }]);
    const view = nodeView(fake);
    trace("dependent-payer", { exit: r.status, ms: r.ms, output: r.json, node: view });
    expect(fake.rejected, fake.timeline.join("\n")).toEqual([]);
    expect(r.status, r.brief).toBe(0);
    expect(r.json).toMatchObject({ ok: true, successCount: 2, failCount: 0 });
    const [t1, t2] = fake.accepted;
    expect(t2!.inputs.every((k) => k.startsWith(`${t1!.id}:`)), "bob paid from what the first payment gave him").toBe(true);
    fake.flush();
    expect(fake.balance(address.carol!)).toBe(1n * KAS);
  });
});

describe("TX-BATCH-1 · tx batch from an encrypted account", () => {
  const alicePayments = [{ from: "alice", to: "bob", amount: "1" }, { from: "alice", to: "carol", amount: "2" }];

  it("--password-env: read once, both payments signed and accepted; the password is nowhere in the output or the workspace", async () => {
    const fake = await fakeFor("enc-env", 0x5eed04);
    fake.fund(address.alice!, [20n * KAS, 20n * KAS]);
    const ws = workspace(fake);
    const r = await batch("alice-env", ws, alicePayments, ["--password-env", "HK_TB_PW"], { env: { HK_TB_PW: PW } });
    trace("encrypted-password-env", { exit: r.status, ms: r.ms, output: r.json, node: nodeView(fake) });
    expect(r.status, r.brief).toBe(0);
    expect(r.json).toMatchObject({ ok: true, successCount: 2, failCount: 0 });
    expect(fake.rejected).toEqual([]);
    expectDisjointInputs(fake);
    expect(`${r.stdout}\n${r.stderr}`.includes(PW)).toBe(false);
    expect(filesContaining(ws, PW)).toEqual([]);
  });

  it("--password-stdin: read once, both payments signed and accepted", async () => {
    const fake = await fakeFor("enc-stdin", 0x5eed05);
    fake.fund(address.alice!, [20n * KAS, 20n * KAS]);
    const ws = workspace(fake);
    const r = await batch("alice-stdin", ws, alicePayments, ["--password-stdin"], { stdin: `${PW}\n` });
    trace("encrypted-password-stdin", { exit: r.status, ms: r.ms, output: r.json, node: nodeView(fake) });
    expect(r.status, r.brief).toBe(0);
    expect(r.json).toMatchObject({ ok: true, successCount: 2, failCount: 0 });
    expect(fake.rejected).toEqual([]);
    expect(`${r.stdout}\n${r.stderr}`.includes(PW)).toBe(false);
    expect(filesContaining(ws, PW)).toEqual([]);
  });

  it("no password and no terminal: KEYSTORE_PASSWORD_REQUIRED before anything is planned or sent, even with a plaintext payer first", async () => {
    const fake = await fakeFor("enc-none", 0x5eed06);
    fake.fund(address.payroll!, [10n * KAS]);
    fake.fund(address.alice!, [20n * KAS]);
    const ws = workspace(fake);
    const r = await batch("mixed-no-password", ws, [{ from: "payroll", to: "bob", amount: "1" }, { from: "alice", to: "carol", amount: "1" }]);
    trace("encrypted-no-password", { exit: r.status, ms: r.ms, output: r.json, methods: fake.methods, node: nodeView(fake) });
    expect(r.status, r.brief).toBe(2);
    expect(r.json?.code, r.brief).toBe("KEYSTORE_PASSWORD_REQUIRED");
    expect(String(r.json?.message ?? r.json?.error ?? "")).toMatch(/nothing was planned, signed or sent/i);
    expect(fake.submits(), "nothing was sent").toBe(0);
    expect(fake.utxoReads.size, "nothing was planned").toBe(0);
    expect(plansIn(ws)).toEqual([]);
  });

  it("a wrong password: KEYSTORE_PASSWORD_INVALID before anything is planned or sent", async () => {
    const fake = await fakeFor("enc-wrong", 0x5eed07);
    fake.fund(address.alice!, [20n * KAS]);
    const ws = workspace(fake);
    const r = await batch("alice-wrong", ws, alicePayments, ["--password-env", "HK_TB_PW_WRONG"], { env: { HK_TB_PW_WRONG: "not-the-password-0" } });
    trace("encrypted-wrong-password", { exit: r.status, ms: r.ms, output: r.json, methods: fake.methods });
    expect(r.status, r.brief).toBe(2);
    expect(r.json?.code, r.brief).toBe("KEYSTORE_PASSWORD_INVALID");
    expect(fake.submits()).toBe(0);
    expect(fake.utxoReads.size).toBe(0);
    expect(`${r.stdout}\n${r.stderr}`.includes("not-the-password-0")).toBe(false);
  });
});

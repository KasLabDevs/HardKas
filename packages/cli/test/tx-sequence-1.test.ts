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
// TX-SEQUENCE-1 (2026-10-21). On a real rusty-kaspad 2.1.0 simnet the few-UTXO payroll paid 2 of 3: the third payment
// spent the two change outputs the first two had just created, and the node refused it with "one of the transaction
// sequence locks conditions was not met". HardKAS payments carried sequence 0, 1, 2… (kaspa-wasm createTransaction
// numbers its inputs), and in Kaspa a sequence is a relative lock in DAA. Fixed: every input of an ordinary payment at
// sequence 0. The fake node applies rusty-kaspa's consensus rule (check_sequence_lock):
//   for each input whose sequence lacks the disable bit (1 << 63):
//     block_daa_score(UTXO) + (sequence & 0xffffffff) - 1 >= virtual DAA score  =>  refused
// A UTXO accepted by the current virtual has block_daa_score == virtual DAA. The fake mines a block (DAA + 1, every
// mempool transaction, the index updated at once) when a UTXO read arrives with two or more transactions waiting: the
// real failure (the first two payments of the payroll in one block, right before the third plans). Loopback only, never
// a real node, no funds. Built CLI (with TX-BATCH-1), real pinned kaspa-wasm. Traces in $HARDKAS_TS_TRACE_DIR.
// -----------------------------------------------------------------------------

const DAA0 = 30_000_000;
const KAS = 100_000_000n;
const DISABLED = 1n << 63n;
const MASK = 0xffffffffn;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

type Utxo = { address: string; amount: bigint; spk: string; daa: number };
type Tx = { id: string; inputs: string[]; sequences: bigint[]; owners: string[]; outputs: Array<[string, Utxo]>; inputAmount: bigint; raw: unknown };

let kaspa: any;
let txIdOf: (transaction: unknown) => string;
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return Number(spk.version).toString(16).padStart(4, "0") + script;
}
const spkOf = (s: any): string =>
  typeof s === "string" ? s : Number(s?.version ?? 0).toString(16).padStart(4, "0") + String(s?.script ?? s?.scriptPublicKey ?? "");

class SequenceLockNode {
  url = "";
  daa = DAA0;
  readonly utxos = new Map<string, Utxo>(); // consensus set = index (no lag here)
  readonly mempool = new Map<string, Tx>();
  readonly accepted: Tx[] = [];
  readonly rejected: Array<{ id: string; inputs: string[]; sequences: string[]; reason: string }> = [];
  readonly methods: string[] = [];
  readonly timeline: string[] = [];
  private readonly chain: string[] = [sha("ts1-chain-0")];
  private server!: WebSocketServer;
  private readonly t0 = Date.now();
  constructor(
    private readonly label: string,
    private readonly addressBySpk: Map<string, string>
  ) {}

  /** UTXOs the node accepted `ageDaa` DAA ago (0: accepted by the current virtual, the freshest a UTXO can be). */
  fund(address: string, amounts: bigint[], ageDaa: number): void {
    amounts.forEach((amount, i) => this.utxos.set(`${sha(`${this.label}-${address}-${i}`)}:0`, { address, amount, spk: spkHex(address), daa: this.daa - ageDaa }));
  }
  balance(address: string): bigint {
    let t = 0n;
    for (const u of this.utxos.values()) if (u.address === address) t += u.amount;
    return t;
  }
  submits(): number {
    return this.methods.filter((m) => m === "submitTransaction").length;
  }
  /** One block with everything waiting: DAA + 1, the outputs accepted by the new virtual (block_daa_score == DAA). */
  mine(): void {
    if (this.mempool.size === 0) return;
    this.daa += 1;
    this.chain.push(sha(`ts1-${this.label}-chain-${this.chain.length}`));
    for (const tx of this.mempool.values()) {
      for (const k of tx.inputs) this.utxos.delete(k);
      for (const [k, u] of tx.outputs) this.utxos.set(k, { ...u, daa: this.daa });
    }
    this.timeline.push(`${Date.now() - this.t0} ms block DAA ${this.daa}: ${[...this.mempool.keys()].map((id) => id.slice(0, 8)).join(",")}`);
    this.mempool.clear();
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
    return new Promise((r) => {
      for (const c of this.server.clients) c.terminate();
      this.server.close(() => r());
    });
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
    const sink = this.chain[this.chain.length - 1]!;
    switch (method) {
      case "getServerInfo":
        return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "simnet", hasUtxoIndex: true, isSynced: true, virtualDaaScore: this.daa });
      case "getInfo":
        return ok({ p2pId: this.label, mempoolSize: this.mempool.size, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
      case "getBlockDagInfo":
        return ok({ network: "simnet", blockCount: this.chain.length, headerCount: this.chain.length, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: this.chain[0], virtualDaaScore: this.daa, sink });
      case "getSinkBlueScore":
        return ok({ blueScore: this.daa });
      case "getFeeEstimate":
        return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
      case "getBlock": {
        const i = this.chain.indexOf(params?.hash);
        if (i < 0) return err(`cannot find header ${params?.hash}`);
        const zero = "0".repeat(64);
        const hash = this.chain[i]!;
        const d = DAA0 + i;
        return ok({
          block: {
            header: { hash, version: 1, parentsByLevel: i > 0 ? [[this.chain[i - 1]]] : [], hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: 1792088193138 + i * 100, bits: 486722099, nonce: 0, daaScore: d, blueWork: (d * 1000).toString(16), blueScore: d, pruningPoint: this.chain[0] },
            transactions: [],
            verboseData: { hash, difficulty: 1, selectedParentHash: i > 0 ? this.chain[i - 1] : zero, transactionIds: [], isHeaderOnly: false, blueScore: d, childrenHashes: [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: true }
          }
        });
      }
      case "getUtxosByAddresses": {
        // the two payments waiting are mined together right before the next plan reads (the real failure's shape)
        if (this.mempool.size >= 2) this.mine();
        const addresses: string[] = params?.addresses ?? [];
        const entries = [...this.utxos]
          .filter(([, u]) => addresses.includes(u.address))
          .sort(([, a], [, b]) => a.daa - b.daa)
          .map(([k, u]) => ({ address: u.address, outpoint: { transactionId: k.split(":")[0], index: Number(k.split(":")[1]) }, utxoEntry: { amount: Number(u.amount), scriptPublicKey: u.spk, blockDaaScore: u.daa, isCoinbase: false } }));
        return ok({ entries });
      }
      case "getMempoolEntriesByAddresses": {
        const addresses: string[] = params?.addresses ?? [];
        const entryOf = (tx: Tx) => ({ fee: 1000, is_orphan: false, transaction: tx.raw });
        const pool = [...this.mempool.values()];
        return ok({ entries: addresses.map((address) => ({ address, sending: pool.filter((t) => t.owners.includes(address)).map(entryOf), receiving: pool.filter((t) => t.outputs.some(([, u]) => u.address === address)).map(entryOf) })) });
      }
      case "getMempoolEntry":
        return err(`Transaction ${params?.transactionId} not found`);
      case "submitTransaction": {
        const raw = params?.transaction;
        const txId = txIdOf(raw);
        const inputs: string[] = (raw?.inputs ?? []).map((i: any) => `${i.previousOutpoint.transactionId}:${Number(i.previousOutpoint.index)}`);
        const sequences: bigint[] = (raw?.inputs ?? []).map((i: any) => BigInt(String(i.sequence ?? 0)));
        const reject = (reason: string) => {
          this.rejected.push({ id: txId, inputs, sequences: sequences.map(String), reason });
          this.timeline.push(`${Date.now() - this.t0} ms REJECTED ${txId.slice(0, 8)} sequences=[${sequences.join(",")}]: ${reason}`);
          return err(`Rejected transaction ${txId}: ${reason}`);
        };
        for (const k of inputs) {
          const other = [...this.mempool.values()].find((t) => t.inputs.includes(k));
          if (other) return reject(`output ${k} already spent by transaction ${other.id} in the memory pool`);
        }
        if (inputs.some((k) => !this.utxos.has(k))) return reject(`transaction ${txId} is an orphan where orphan is disallowed`);
        // rusty-kaspa 2.1.0 consensus check_sequence_lock, at the virtual DAA score
        for (let i = 0; i < inputs.length; i++) {
          const seq = sequences[i]!;
          if ((seq & DISABLED) === DISABLED) continue;
          const lock = BigInt(this.utxos.get(inputs[i]!)!.daa) + (seq & MASK) - 1n;
          if (lock >= BigInt(this.daa)) return reject("one of the transaction sequence locks conditions was not met");
        }
        const owners = inputs.map((k) => this.utxos.get(k)!.address);
        const inputAmount = inputs.reduce((s, k) => s + this.utxos.get(k)!.amount, 0n);
        const outputs: Array<[string, Utxo]> = (raw?.outputs ?? []).map((o: any, j: number) => {
          const spk = spkOf(o.scriptPublicKey);
          return [`${txId}:${j}`, { address: this.addressBySpk.get(spk) ?? `unknown:${spk}`, amount: BigInt(String(o.value ?? o.amount)), spk, daa: 0 }];
        });
        const tx: Tx = { id: txId, inputs, sequences, owners, outputs, inputAmount, raw };
        this.mempool.set(txId, tx);
        this.accepted.push(tx);
        this.timeline.push(`${Date.now() - this.t0} ms accepted ${txId.slice(0, 8)} sequences=[${sequences.join(",")}]`);
        return ok({ transactionId: txId });
      }
      default:
        return err(`fake ${this.label} does not implement ${method}`);
    }
  }
}

const traceDir = process.env.HARDKAS_TS_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}
const made: string[] = [];
const nodes: SequenceLockNode[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ts1-netlogs-"));
made.push(logs);

async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log, {}) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 280_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
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
  return { ...r, json, brief: `exit ${r.status}\n${r.stdout.slice(0, 2500)}\n${r.stderr.slice(-1500)}` };
}

let template: string;
const address: Record<string, string> = {};
const addressBySpk = new Map<string, string>();
const PAYERS = ["fresh1", "fresh2", "fresh5", "old2", "payroll"];
const RECIPIENTS = ["bob", "carol", "dave"];
const config = (url: string) =>
  `export default ${JSON.stringify({
    execution: { default: "own", targets: { own: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    network: { allowPublic: false },
    networks: { simnet: { kind: "kaspa-rpc", network: "simnet", rpcUrl: url } }
  })};\n`;
function workspace(node: SequenceLockNode): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ts1-"));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), config(node.url));
  return ws;
}
async function nodeFor(label: string): Promise<SequenceLockNode> {
  const n = new SequenceLockNode(label, addressBySpk);
  await n.start();
  nodes.push(n);
  return n;
}
/** The signed transactions HardKAS wrote in the workspace: declared txId and the inputs' sequences of its payload. */
function signedIn(ws: string): Array<{ txId: string; sequences: string[] }> {
  const dir = path.join(ws, ".hardkas", "artifacts", "signed");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    const a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const payload = typeof a.signedTransaction?.payload === "string" ? JSON.parse(a.signedTransaction.payload) : a.signedTransaction?.payload;
    return { txId: a.txId, sequences: (payload?.inputs ?? []).map((i: any) => String(i.sequence)) };
  });
}
/** The fee of each plan HardKAS wrote (what the payment was priced at). */
function planFees(ws: string): string[] {
  const dir = path.join(ws, ".hardkas", "artifacts", "plans");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => String(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).estimatedFeeSompi));
}
function expectAcceptedClean(node: SequenceLockNode, ws: string) {
  const fees = planFees(ws);
  const declared = new Set(signedIn(ws).map((s) => s.txId));
  const seen = new Set<string>();
  for (const tx of node.accepted) {
    expect(tx.sequences.every((s) => s === 0n), `${tx.id}: sequences ${tx.sequences.join(",")}`).toBe(true);
    expect(declared.has(tx.id), `${tx.id}: the official id is the txId HardKAS declared`).toBe(true);
    const fee = tx.inputAmount - tx.outputs.reduce((s, [, u]) => s + u.amount, 0n);
    expect(fees, `${tx.id}: fee ${fee} is one the plans priced`).toContain(fee.toString());
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
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ts1-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  fs.writeFileSync(path.join(template, "hardkas.config.ts"), config("ws://127.0.0.1:1"));
  for (const name of [...PAYERS, ...RECIPIENTS]) {
    const r = await run(`gen-${name}`, ["accounts", "real", "generate", "--name", name, "--network", "simnet", "--unsafe-plaintext", "--yes", "--json"], template);
    expect(r.status, r.brief).toBe(0);
  }
  const store = JSON.parse(fs.readFileSync(path.join(template, ".hardkas", "accounts.real.json"), "utf8"));
  for (const a of store.accounts) {
    address[a.name] = a.address;
    addressBySpk.set(spkHex(a.address), a.address);
  }
});

afterAll(async () => {
  for (const n of nodes) await n.close();
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("TX-SEQUENCE-1 · a node that enforces Kaspa's relative sequence locks", () => {
  const send = (ws: string, name: string, from: string, to: string, amount: string) =>
    run(name, ["tx", "send", "--from", from, "--to", to, "--amount", amount, "--network", "simnet", "--json"], ws);

  it("two inputs, both just accepted by the node: the payment is accepted, every input at sequence 0", async () => {
    const node = await nodeFor("fresh2");
    node.fund(address.fresh2!, [10n * KAS, 10n * KAS], 0);
    const ws = workspace(node);
    const r = await send(ws, "fresh2", "fresh2", "bob", "15");
    trace("two-fresh-inputs", { exit: r.status, output: r.json, accepted: node.accepted.map((t) => ({ id: t.id, inputs: t.inputs, sequences: t.sequences })), rejected: node.rejected, timeline: node.timeline });
    expect(node.rejected, node.timeline.join("\n")).toEqual([]);
    expect(r.status, r.brief).toBe(0);
    expect(node.accepted).toHaveLength(1);
    expect(node.accepted[0]!.inputs).toHaveLength(2);
    expectAcceptedClean(node, ws);
    node.mine();
    expect(node.balance(address.bob!)).toBe(15n * KAS);
  });

  it("five inputs, all just accepted: accepted, every input at sequence 0", async () => {
    const node = await nodeFor("fresh5");
    node.fund(address.fresh5!, Array.from({ length: 5 }, () => 10n * KAS), 0);
    const ws = workspace(node);
    const r = await send(ws, "fresh5", "fresh5", "carol", "45");
    trace("five-fresh-inputs", { exit: r.status, output: r.json, accepted: node.accepted.map((t) => ({ id: t.id, inputs: t.inputs, sequences: t.sequences })), rejected: node.rejected, timeline: node.timeline });
    expect(node.rejected, node.timeline.join("\n")).toEqual([]);
    expect(r.status, r.brief).toBe(0);
    expect(node.accepted[0]!.inputs).toHaveLength(5);
    expectAcceptedClean(node, ws);
    node.mine();
    expect(node.balance(address.carol!)).toBe(45n * KAS);
  });

  it("one input just accepted: accepted (sequence 0 was never a lock), as before", async () => {
    const node = await nodeFor("fresh1");
    node.fund(address.fresh1!, [10n * KAS], 0);
    const ws = workspace(node);
    const r = await send(ws, "fresh1", "fresh1", "dave", "5");
    expect(node.rejected, node.timeline.join("\n")).toEqual([]);
    expect(r.status, r.brief).toBe(0);
    expect(node.accepted[0]!.inputs).toHaveLength(1);
    expectAcceptedClean(node, ws);
  });

  it("two old inputs: accepted, as before (the lock never applied to UTXOs older than the input index)", async () => {
    const node = await nodeFor("old2");
    node.fund(address.old2!, [10n * KAS, 10n * KAS], 1000);
    const ws = workspace(node);
    const r = await send(ws, "old2", "old2", "bob", "15");
    expect(node.rejected, node.timeline.join("\n")).toEqual([]);
    expect(r.status, r.brief).toBe(0);
    expectAcceptedClean(node, ws);
  });

  it("the few-UTXO payroll (TX-BATCH-1): 3 of 3, the third paid from the two fresh change outputs", async () => {
    const node = await nodeFor("payroll");
    node.fund(address.payroll!, [10n * KAS, 10n * KAS, 10n * KAS], 1000);
    const ws = workspace(node);
    fs.writeFileSync(path.join(ws, "payroll.json"), JSON.stringify({ payments: [{ from: "payroll", to: "bob", amount: "1" }, { from: "payroll", to: "carol", amount: "2" }, { from: "payroll", to: "dave", amount: "3" }] }));
    const r = await run("payroll", ["tx", "batch", "--file", "payroll.json", "--network", "simnet", "--json"], ws);
    trace("few-utxo-payroll", { exit: r.status, output: r.json, accepted: node.accepted.map((t) => ({ id: t.id, inputs: t.inputs, sequences: t.sequences })), rejected: node.rejected, timeline: node.timeline });
    expect(node.rejected, node.timeline.join("\n")).toEqual([]);
    expect(r.status, r.brief).toBe(0);
    expect(r.json).toMatchObject({ ok: true, successCount: 3, failCount: 0 });
    const [t1, t2, t3] = node.accepted;
    // the third payment spent the change of the first two, both accepted by the virtual right before it was sent
    expect(t3!.inputs.map((k) => k.split(":")[0]).sort()).toEqual([t1!.id, t2!.id].sort());
    expectAcceptedClean(node, ws);
    node.mine();
    expect(node.balance(address.bob!)).toBe(1n * KAS);
    expect(node.balance(address.carol!)).toBe(2n * KAS);
    expect(node.balance(address.dave!)).toBe(3n * KAS);
  });
});

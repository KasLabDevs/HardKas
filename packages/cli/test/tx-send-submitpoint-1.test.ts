import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

// -----------------------------------------------------------------------------
// TX-SEND-SUBMITPOINT-1, loopback fakes only. Found by TN10-CERTIFICATION-REHEARSAL-1: for a ws:// / wss:// endpoint
// `hardkas tx send` gives the SDK a `KaspaWrpcClient`, which has no `getSinkBlueScore`; `sdk.tx.send` swallowed the
// error and recorded the submission WITHOUT its `submitPoint`, so `tx wait` scanned from the node's pruning point
// (on TN10: ≈ 1.45 M blue score of chain).
// Contract (review 2026-10-16):
//   * the submit point is read BEFORE submitTransaction, from ONE view of the chain: the sink the node names and THAT
//     block's own blue score (its header); never a later reading presented as the submit point;
//   * a failed capture records no submitPoint and says why (`submitPointUnavailable`); the send itself, its single
//     attempt and the accept/reject/unknown semantics are unchanged;
//   * `tx wait` starts its scan at the persisted submit point, not at the pruning point; a cursor the node no longer
//     holds is never replaced by the pruning point;
//   * exactly one submitTransaction; the network/mainnet guards are untouched (their own suites).
// The fake is STAGE-B-2's, plus a long history behind the pruning point, the submit answer modes, capture failures and
// a record of where every virtual-chain scan starts. Traces in $HARDKAS_SP_TRACE_DIR.
// -----------------------------------------------------------------------------

const SCRIPT = path.join(repoRoot, "scripts", "testnet-qualification.mjs");
const PW = "tcf-test-password-only";
const PW_VAR = "HK_TCF_TEST_PW";
const BATCH = 1840;
const BLUE0 = 584_900_000;
const DAA0 = 596_400_000;

let kaspa: any;
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

const funding = { address: "", txid: sha("tcf-funding"), index: 0, amount: 50_00000000 };

type ChainFakeOptions = {
  /** accept: the chain lists the tx at its accepting block; utxo-only: outputs appear, the chain never names it. */
  mode?: "accept" | "utxo-only";
  /** Added to the accepting block's DAA score in the UTXO rows (≠ 0: the row contradicts the chain). */
  utxoDaaOffset?: number;
  /** After the submission, the node no longer serves the chain from any block up to the submit-time sink. */
  forgetStartAfterSubmit?: boolean;
  daaPerChain?: number;
  tickMs?: number;
  acceptAfter?: number;
  /** Static chain (no ticking) with `txid` accepted at `accept` — for tx status. */
  staticChain?: { tip: number; accept: number; txid: string };
  /** The node's mempool lists this (external) txId. */
  mempoolTxid?: string;
  /** The first N getVirtualChainFromBlock calls fail with a transport-style error (not "unknown block"). */
  failFirstChainReads?: number;
  /** Chain blocks between the pruning point (block 0) and the tip at start (default 3 000). */
  history?: number;
  /** How the node answers submitTransaction (the tx is accepted a few blocks later except on reject). */
  submitMode?: "accept" | "reject" | "timeout" | "disconnect";
  /** Before any submission, getBlock fails for every block (the sink's header cannot be read). */
  failHeadersBeforeSubmit?: boolean;
  /** Before any submission, getBlock answers with the header of the PREVIOUS block (a header that is not the one asked for). */
  wrongHeaderBeforeSubmit?: boolean;
};
type ChainFake = {
  url: string;
  port: number;
  methods: string[];
  /** The startHash of every getVirtualChainFromBlock call, in order. */
  vcfbStarts: string[];
  /** The sink the node named at each getBlockDagInfo before the submission (the candidates for a submit point). */
  sinksBeforeSubmit: string[];
  /** Index of a block hash on the current or the replaced chain. */
  heightOf(hash: string): number | undefined;
  submits: number;
  submittedAtTip?: number;
  acceptAt?: number;
  txid?: string;
  hashOf(i: number): string;
  /** The selected chain from the accepting block onward is replaced by blocks that do not accept the tx. */
  reorg(): void;
  close(): Promise<void>;
};

async function startChainFake(label: string, opts: ChainFakeOptions = {}): Promise<ChainFake> {
  const daaPerChain = opts.daaPerChain ?? 1;
  const hashOf = (i: number) => sha(`tcf-${label}-chain-${i}`);
  // after reorg(): the selected chain from the accepting block onward is made of these blocks instead
  const hashB = (i: number) => sha(`tcf-${label}-chainB-${i}`);
  let reorged = false;
  const indexB = new Map<string, number>();
  const chainAt = (i: number) => (reorged && fake.acceptAt !== undefined && i >= fake.acceptAt ? hashB(i) : hashOf(i));
  let chainReads = 0;
  const index = new Map<string, number>();
  let tip = 0;
  const grow = (to: number) => {
    for (let i = tip; i <= to; i++) {
      index.set(hashOf(i), i);
      if (reorged && fake.acceptAt !== undefined && i >= fake.acceptAt) indexB.set(hashB(i), i);
    }
    tip = to;
  };
  grow(opts.staticChain?.tip ?? opts.history ?? 3_000);
  const daa = (i: number) => DAA0 + i * daaPerChain;
  const blue = (i: number) => BLUE0 + i;
  let submitted: { txid: string; outputs: Array<{ spk: string; value: number }>; transaction: unknown } | undefined;
  const fake: ChainFake = {
    url: "",
    port: 0,
    methods: [],
    vcfbStarts: [],
    sinksBeforeSubmit: [],
    heightOf: (hash: string) => index.get(hash) ?? indexB.get(hash),
    submits: 0,
    hashOf,
    reorg: () => {
      for (let i = fake.acceptAt!; i <= tip; i++) indexB.set(hashB(i), i);
      reorged = true;
    },
    close: async () => {}
  };
  if (opts.staticChain) {
    fake.txid = opts.staticChain.txid;
    fake.acceptAt = opts.staticChain.accept;
  }
  const accepted = () => fake.acceptAt !== undefined && tip >= fake.acceptAt;
  const timer = opts.staticChain ? undefined : setInterval(() => grow(tip + 1), opts.tickMs ?? 10);
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  const zero = "0".repeat(64);
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1]; // u64: echoed raw
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try {
        params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
      } catch {
        params = undefined;
      }
      fake.methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: daa(tip) + 1 });
        case "getInfo":
          return ok({ p2pId: label, mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo": {
          if (!submitted) fake.sinksBeforeSubmit.push(chainAt(tip));
          const dag: Record<string, unknown> = { network: "testnet-10", blockCount: tip + 1, headerCount: tip + 1, tipHashes: [chainAt(tip)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [chainAt(tip)], pruningPointHash: hashOf(0), virtualDaaScore: daa(tip) + 1, sink: chainAt(tip) };
          return ok(dag);
        }
        case "getSinkBlueScore":
          return ok({ blueScore: blue(tip) });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: address === funding.address && !accepted() ? funding.amount : 0 })) });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getUtxosByAddresses": {
          const entries: unknown[] = [];
          for (const address of params?.addresses ?? []) {
            if (address === funding.address && !(submitted && accepted())) {
              entries.push({ address, outpoint: { transactionId: funding.txid, index: funding.index }, utxoEntry: { amount: funding.amount, blockDaaScore: DAA0 - 100_000, covenantId: null, isCoinbase: false, scriptPublicKey: spkHex(address) } });
            }
            if (submitted && accepted()) {
              const spk = spkHex(address);
              submitted.outputs.forEach((o, i) => {
                if (o.spk === spk) {
                  entries.push({ address, outpoint: { transactionId: submitted!.txid, index: i }, utxoEntry: { amount: o.value, blockDaaScore: daa(fake.acceptAt!) + (opts.utxoDaaOffset ?? 0), covenantId: null, isCoinbase: false, scriptPublicKey: spk } });
                }
              });
            }
          }
          return ok({ entries });
        }
        case "getMempoolEntry":
          if (opts.mempoolTxid !== undefined && params?.transactionId === opts.mempoolTxid) {
            return ok({
              mempoolEntry: {
                fee: 2036,
                // kaspad 2.1.0 / kaspa-wasm serde: the entry carries `is_orphan` (snake case)
                is_orphan: false,
                transaction: { version: 0, inputs: [], outputs: [], lockTime: 0, subnetworkId: "0".repeat(40), gas: 0, payload: "", mass: 0, verboseData: { transactionId: opts.mempoolTxid, hash: opts.mempoolTxid, computeMass: 0, blockHash: zero, blockTime: 0 } }
              }
            });
          }
          if (submitted && params?.transactionId === submitted.txid && !accepted()) {
            return ok({ mempoolEntry: { fee: 2036, is_orphan: false, transaction: submitted.transaction } });
          }
          return err(`Transaction ${params?.transactionId} not found`);
        case "submitTransaction": {
          fake.submits++;
          if (opts.submitMode === "reject") return err("transaction rejected: the node refuses this submission (test)");
          const tx = params?.transaction;
          const txid: string = new kaspa.Transaction({
            version: tx.version,
            inputs: tx.inputs.map((i: any) => ({ previousOutpoint: i.previousOutpoint, signatureScript: i.signatureScript, sequence: BigInt(i.sequence), sigOpCount: i.sigOpCount })),
            outputs: tx.outputs.map((o: any) => ({ value: BigInt(o.value ?? o.amount), scriptPublicKey: o.scriptPublicKey })),
            lockTime: BigInt(tx.lockTime),
            subnetworkId: tx.subnetworkId,
            gas: BigInt(tx.gas),
            payload: tx.payload ?? ""
          }).id;
          submitted = { txid, transaction: tx, outputs: tx.outputs.map((o: any) => ({ spk: String(o.scriptPublicKey), value: Number(o.value ?? o.amount) })) };
          fake.txid = txid;
          fake.submittedAtTip = tip;
          fake.acceptAt = tip + (opts.acceptAfter ?? 5);
          if (opts.submitMode === "timeout") return; // never answered; the tx IS accepted (the ambiguous case)
          if (opts.submitMode === "disconnect") return socket.terminate(); // connection lost; the tx IS accepted
          return ok({ transactionId: txid });
        }
        case "getBlock": {
          if (opts.failHeadersBeforeSubmit && !submitted) return err("header store temporarily unavailable (test)");
          const i = index.get(params?.hash) ?? indexB.get(params?.hash);
          if (i === undefined) return err(`cannot find header ${params?.hash}`);
          const own = opts.wrongHeaderBeforeSubmit && !submitted && i > 0 ? chainAt(i - 1) : String(params.hash);
          const parentsByLevel: string[][] = [];
          for (let level = 0; level < 16 && i - 2 ** level >= 0; level++) parentsByLevel.push([chainAt(i - 2 ** level)]);
          return ok({
            block: {
              header: { hash: own, version: 1, parentsByLevel, hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: 1792088193138 + i * 100, bits: 486722099, nonce: 0, daaScore: daa(i), blueWork: (blue(i) * 1000).toString(16), blueScore: blue(i), pruningPoint: hashOf(0) },
              transactions: [],
              verboseData: { hash: own, difficulty: 1, selectedParentHash: i > 0 ? chainAt(i - 1) : zero, transactionIds: [], isHeaderOnly: false, blueScore: blue(i), childrenHashes: i < tip ? [chainAt(i + 1)] : [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: own === chainAt(i) }
            }
          });
        }
        case "getVirtualChainFromBlock": {
          fake.vcfbStarts.push(String(params?.startHash));
          if (chainReads++ < (opts.failFirstChainReads ?? 0)) return err("websocket peer temporarily overloaded, retry later");
          const fromOld = index.get(params?.startHash);
          const i = fromOld ?? indexB.get(params?.startHash);
          if (i === undefined) return err(`cannot find header ${params?.startHash}`);
          if (opts.forgetStartAfterSubmit && fake.submittedAtTip !== undefined && i <= fake.submittedAtTip) {
            return err(`cannot find header ${params?.startHash}`);
          }
          // a start block the reorganization took off the selected chain: the answer removes it (and the old blocks
          // above it) and adds the new chain from the common ancestor (accept − 1) onward
          const offChain = reorged && fromOld !== undefined && fake.acceptAt !== undefined && i >= fake.acceptAt;
          const removed: string[] = [];
          if (offChain) for (let j = tip; j >= fake.acceptAt!; j--) removed.push(hashOf(j));
          const from = offChain ? fake.acceptAt! - 1 : i;
          const added: string[] = [];
          const acceptedIds: unknown[] = [];
          for (let j = from + 1; j <= Math.min(from + BATCH, tip); j++) {
            added.push(chainAt(j));
            const listsTx =
              !reorged && (opts.mode ?? "accept") === "accept" && fake.txid !== undefined && j === fake.acceptAt && (opts.staticChain !== undefined || submitted !== undefined);
            acceptedIds.push({ acceptingBlockHash: chainAt(j), acceptedTransactionIds: listsTx ? [sha(`cb-${j}`), fake.txid] : [sha(`cb-${j}`)] });
          }
          return ok({ removedChainBlockHashes: removed, addedChainBlockHashes: added, acceptedTransactionIds: params?.includeAcceptedTransactionIds ? acceptedIds : [] });
        }
        default:
          return err(`fake ${label} does not implement ${method}`);
      }
    });
  });
  fake.port = (server.address() as AddressInfo).port;
  fake.url = `ws://127.0.0.1:${fake.port}`;
  fake.close = () =>
    new Promise<void>((r) => {
      if (timer) clearInterval(timer);
      for (const c of server.clients) c.terminate();
      server.close(() => r());
    });
  return fake;
}

const traceDir = process.env.HARDKAS_SP_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, null, 2));
}
const made: string[] = [];
const fakes: ChainFake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sp-netlogs-"));
made.push(logs);

async function run(name: string, argv: string[], cwd: string, env: Record<string, string> = {}) {
  const log = path.join(logs, `${name}.net.log`);
  const base = hermeticChildEnv(log, { [PW_VAR]: PW });
  for (const k of Object.keys(base)) if (k.startsWith("HARDKAS_TQ_")) delete base[k];
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, argv, { cwd, env: { ...base, ...env } });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 280_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  const dialled = fs.existsSync(log)
    ? [...new Set(fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t")).map(([, k, t]) => `${k} ${t}`))]
    : [];
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { name, exit: r.status, stdout: r.stdout, stderr: r.stderr, json, dialled, brief: `exit ${r.status}\n${r.stdout.slice(-2500)}\n${r.stderr.slice(0, 2000)}` };
}

const cfg = (url: string) =>
  `export default ${JSON.stringify(
    {
      execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
      network: { allowPublic: true },
      experimental: true,
      networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } }
    },
    null,
    2
  )};\n`;
let template = "";
function workspace(label: string, url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-sp-${label}-`));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), cfg(url));
  return ws;
}
let dest = "";
function tqEnv(endpoint: string, ws: string): Record<string, string> {
  return {
    HARDKAS_TQ_ENDPOINT: endpoint,
    HARDKAS_TQ_ENDPOINT_CLASS: "wrpc",
    HARDKAS_TQ_WORKSPACE: ws,
    HARDKAS_TQ_FUNDING_ACCOUNT: "funder",
    HARDKAS_TQ_FUNDING_ADDRESS: funding.address,
    HARDKAS_TQ_FUNDING_TXID: funding.txid,
    HARDKAS_TQ_FUNDING_INDEX: String(funding.index),
    HARDKAS_TQ_FUNDING_MIN_SOMPI: String(funding.amount),
    HARDKAS_TQ_DEST_ADDRESS: dest,
    HARDKAS_TQ_AMOUNT_SOMPI: "100000000",
    HARDKAS_TQ_RECEIPTS_DIR: path.join(ws, ".hardkas", "testnet-qualification"),
    HARDKAS_TQ_KEYSTORE_PASSWORD_ENV: PW_VAR
  };
}
const qualify = (name: string, ws: string, endpoint: string, flags: string[] = ["--min-confirmations", "100"]) =>
  run(name, [SCRIPT, "--live", "--expected-network", "testnet-10", ...flags], ws, tqEnv(endpoint, ws));
function receiptOf(ws: string): any {
  const dir = path.join(ws, ".hardkas", "testnet-qualification", "raw");
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.endsWith(".json")) : undefined;
  return f ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : undefined;
}
const observationsOf = (ws: string) => {
  const dir = path.join(ws, ".hardkas", "artifacts", "observations");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
};
const onlyLoopback = (dialled: string[], f: ChainFake) => dialled.every((d) => d === `LOOPBACK_CONNECT 127.0.0.1:${f.port}`);

beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sp-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  fs.writeFileSync(path.join(template, "hardkas.config.ts"), `export default ${JSON.stringify({ execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } })};\n`);
  const gen = await run("setup-generate", [cliDist, "accounts", "real", "generate", "--name", "funder", "--network", "testnet-10", "--password-env", PW_VAR, "--json"], template);
  funding.address = /kaspatest:[0-9a-z]+/.exec(gen.stdout)?.[0] ?? "";
  expect(funding.address, gen.brief).not.toBe("");
  dest = new kaspa.PrivateKey("66".repeat(32)).toAddress("testnet-10").toString();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
async function fakeFor(label: string, opts: ChainFakeOptions = {}) {
  const f = await startChainFake(label, opts);
  fakes.push(f);
  return f;
}



const both = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;
function submissionOf(ws: string): any {
  const files = fs
    .readdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true })
    .map(String)
    .filter((f) => /txSubmission-[0-9a-f]{64}\.json$/.test(f));
  expect(files, "exactly one submission record").toHaveLength(1);
  return JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "artifacts", files[0]!), "utf8"));
}
/** plan → sign → send over ws:// (the CLI's `KaspaWrpcClient` path). */
async function sendFromWorkspace(name: string, ws: string) {
  const plan = await run(`${name}-plan`, [cliDist, "tx", "plan", "--from", "funder", "--to", dest, "--amount", "1", "--network", "testnet-10", "--out", "plan.json", "--json"], ws);
  expect(plan.exit, plan.brief).toBe(0);
  const sign = await run(`${name}-sign`, [cliDist, "tx", "sign", "plan.json", "--account", "funder", "--password-env", PW_VAR, "--out", "signed.json", "--json"], ws);
  expect(sign.exit, sign.brief).toBe(0);
  const send = await run(`${name}-send`, [cliDist, "tx", "send", "signed.json", "--yes", "--json"], ws);
  const txId = String(JSON.parse(fs.readFileSync(path.join(ws, "signed.json"), "utf8")).txId);
  return { send, txId };
}
/** The submit point is ONE view: a sink the node named before the submission, with THAT block's blue score. */
function expectCoherentSubmitPoint(F: ChainFake, sub: any) {
  expect(sub.submitPoint, JSON.stringify(sub)).toBeDefined();
  expect(sub.submitPointUnavailable).toBeUndefined();
  const { sinkHash, sinkBlueScore, virtualDaaScore } = sub.submitPoint;
  expect(sinkHash).toMatch(/^[0-9a-f]{64}$/);
  expect(F.sinksBeforeSubmit).toContain(sinkHash);
  const h = F.heightOf(sinkHash)!;
  expect(h).toBeLessThanOrEqual(F.submittedAtTip ?? Number.MAX_SAFE_INTEGER);
  expect(sinkBlueScore).toBe(String(BLUE0 + h));
  expect(virtualDaaScore).toMatch(/^\d+$/);
}
const wait = (name: string, ws: string, txId: string, timeout = "60") =>
  run(name, [cliDist, "tx", "wait", txId, "--until", "confirmed", "--timeout", timeout, "--interval", "1", "--json"], ws);

describe("TX-SEND-SUBMITPOINT-1 · tx send over ws:// records the submit point; tx wait starts there", () => {
  const HISTORY = 200_000; // the pruning point is block 0: a scan from it would read ≈ 109 batches
  let F: ChainFake;
  let ws = "";
  let txId = "";
  let sub: any;

  it("SP-1 accept: one submitTransaction; the submission carries a coherent submitPoint read before the submit", async () => {
    F = await fakeFor("sp1", { history: HISTORY });
    ws = workspace("sp1", F.url);
    const r = await sendFromWorkspace("SP-1", ws);
    txId = r.txId;
    sub = submissionOf(ws);
    trace("SP-1", { send: r.send.brief, submission: sub, sinksBeforeSubmit: F.sinksBeforeSubmit, submittedAtTip: F.submittedAtTip });
    expect(r.send.exit, r.send.brief).toBe(0);
    expect(F.submits).toBe(1);
    expect(sub.submitResult.accepted).toBe(true);
    expectCoherentSubmitPoint(F, sub);
    expect(onlyLoopback(r.send.dialled, F)).toBe(true);
  });

  it("SP-2 tx wait scans from the persisted submit point, never from the pruning point → CONFIRMED in a few reads", async () => {
    const before = F.vcfbStarts.length;
    const w = await wait("SP-2", ws, txId);
    const starts = F.vcfbStarts.slice(before);
    trace("SP-2", { exit: w.exit, state: w.json?.state, starts: starts.length, first: starts[0], submitPoint: sub?.submitPoint, out: w.brief });
    expect(w.exit, w.brief).toBe(0);
    expect(w.json?.state).toBe("CONFIRMED");
    expect(starts[0]).toBe(sub.submitPoint.sinkHash);
    expect(starts).not.toContain(F.hashOf(0));
    expect(starts.length).toBeLessThan(10);
    expect(F.submits).toBe(1);
  });
});

describe("TX-SEND-SUBMITPOINT-1 · the submit point under rejection, timeout and disconnection (never a re-send)", () => {
  for (const mode of ["reject", "timeout", "disconnect"] as const) {
    it(`SP-3-${mode}: exactly one submitTransaction; the submit point was captured before it; ${mode === "reject" ? "the rejection is recorded" : "the unknown outcome is recorded and tx wait recovers from the submit point"}`, async () => {
      const F = await fakeFor(`sp3${mode}`, { history: 60_000, submitMode: mode });
      const ws = workspace(`sp3-${mode}`, F.url);
      const r = await sendFromWorkspace(`SP-3-${mode}`, ws);
      const s = submissionOf(ws);
      trace(`SP-3-${mode}`, { send: r.send.brief, submission: s });
      expect(r.send.exit, r.send.brief).not.toBe(0);
      expect(F.submits).toBe(1);
      expect(s.submitResult.accepted).toBe(false);
      expect(String(s.submitResult.error ?? "")).not.toBe("");
      // the record names the transaction it sent (the signed txId) even without an answer, so tx wait <txId> finds it
      expect(s.txId).toBe(r.txId);
      expectCoherentSubmitPoint(F, s);
      if (mode !== "reject") {
        const before = F.vcfbStarts.length;
        const w = await wait(`SP-3-${mode}-wait`, ws, r.txId);
        const starts = F.vcfbStarts.slice(before);
        trace(`SP-3-${mode}-wait`, { exit: w.exit, state: w.json?.state, first: starts[0], out: w.brief });
        expect(w.json?.state, w.brief).toBe("CONFIRMED");
        expect(starts[0]).toBe(s.submitPoint.sinkHash);
        expect(starts).not.toContain(F.hashOf(0));
      }
      expect(F.submits, "never re-sent").toBe(1);
    });
  }
});

describe("TX-SEND-SUBMITPOINT-1 · a capture that fails is explicit, never invented, and changes nothing else", () => {
  for (const [name, opts, why] of [
    ["SP-4a", { failHeadersBeforeSubmit: true }, /header|getBlock/i],
    ["SP-4b", { wrongHeaderBeforeSubmit: true }, /another block/i]
  ] as const) {
    it(`${name} ${name === "SP-4a" ? "the sink's header cannot be read" : "the node answers another block's header for the sink"}: no submitPoint, submitPointUnavailable says why; still ONE accepted submission`, async () => {
      const F = await fakeFor(name.toLowerCase(), { history: 3_000, ...opts });
      const ws = workspace(name.toLowerCase(), F.url);
      const r = await sendFromWorkspace(name, ws);
      const s = submissionOf(ws);
      trace(name, { send: r.send.brief, submission: s });
      expect(r.send.exit, r.send.brief).toBe(0);
      expect(F.submits).toBe(1);
      expect(s.submitResult.accepted).toBe(true);
      expect(s.submitPoint).toBeUndefined();
      expect(s.submitPointUnavailable?.reason ?? "", JSON.stringify(s)).toMatch(why);
      const v = await run(`${name}-verify`, [cliDist, "artifact", "verify", path.join(".hardkas", "artifacts", fs.readdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true }).map(String).find((f) => /txSubmission-/.test(f))!), "--json"], ws);
      expect(v.exit, v.brief).toBe(0);
    });
  }
});

describe("TX-SEND-SUBMITPOINT-1 · cursor the node no longer holds, and reorganization", () => {
  it("SP-5 the node no longer serves the chain from the submit point: tx wait records no claim and NEVER falls back to the pruning point", async () => {
    const F = await fakeFor("sp5", { history: 60_000, forgetStartAfterSubmit: true });
    const ws = workspace("sp5", F.url);
    const r = await sendFromWorkspace("SP-5", ws);
    expect(r.send.exit, r.send.brief).toBe(0);
    const s = submissionOf(ws);
    expectCoherentSubmitPoint(F, s);
    const before = F.vcfbStarts.length;
    const w = await wait("SP-5-wait", ws, r.txId, "6");
    const starts = F.vcfbStarts.slice(before);
    trace("SP-5", { exit: w.exit, starts: [...new Set(starts)], out: w.brief });
    expect(w.exit, w.brief).toBe(1);
    expect(both(w)).toMatch(/TX_WAIT_TIMEOUT/);
    expect(both(w)).not.toMatch(/CONFIRMED \(/);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts).not.toContain(F.hashOf(0));
    expect(F.submits).toBe(1);
  });

  it("SP-6 reorganization after CONFIRMED: the accepting block leaves the chain → REORGED; the submit point is unchanged and nothing is re-sent", async () => {
    const F = await fakeFor("sp6", { history: 60_000 });
    const ws = workspace("sp6", F.url);
    const r = await sendFromWorkspace("SP-6", ws);
    const s = submissionOf(ws);
    expectCoherentSubmitPoint(F, s);
    const w = await wait("SP-6-wait", ws, r.txId);
    expect(w.json?.state, w.brief).toBe("CONFIRMED");
    F.reorg();
    const st = await run("SP-6-status", [cliDist, "tx", "status", r.txId, "--json"], ws);
    trace("SP-6", { wait: w.json?.state, status: st.json?.state, out: st.brief });
    expect(st.exit, st.brief).toBe(0);
    expect(st.json?.state).toBe("REORGED");
    expect(submissionOf(ws).submitPoint).toEqual(s.submitPoint);
    expect(F.submits).toBe(1);
  });
});

describe("TX-SEND-SUBMITPOINT-1 · control: the SDK's own client (JsonWrpcKaspaClient)", () => {
  it("SP-7 sdk.tx.send without the CLI's client swap also records a coherent submit point", async () => {
    const F = await fakeFor("sp7", { history: 3_000 });
    const ws = workspace("sp7", F.url);
    const plan = await run("SP-7-plan", [cliDist, "tx", "plan", "--from", "funder", "--to", dest, "--amount", "1", "--network", "testnet-10", "--out", "plan.json", "--json"], ws);
    expect(plan.exit, plan.brief).toBe(0);
    const sign = await run("SP-7-sign", [cliDist, "tx", "sign", "plan.json", "--account", "funder", "--password-env", PW_VAR, "--out", "signed.json", "--json"], ws);
    expect(sign.exit, sign.brief).toBe(0);
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk: any = await Hardkas.open({ cwd: ws, network: "testnet-10" });
    try {
      await sdk.tx.send(JSON.parse(fs.readFileSync(path.join(ws, "signed.json"), "utf8")));
    } finally {
      await sdk.close?.();
    }
    const s = submissionOf(ws);
    trace("SP-7", { submission: s });
    expect(F.submits).toBe(1);
    expectCoherentSubmitPoint(F, s);
  });
});

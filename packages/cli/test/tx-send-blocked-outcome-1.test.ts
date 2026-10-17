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
// TX-SEND-BLOCKED-OUTCOME-1 (D3), loopback fakes only. Found by TN10-CERTIFICATION-REHEARSAL-1/2: a submitTransaction
// refused locally before anything left the process was recorded exactly like a network timeout (a txSubmission with an
// unknown outcome, "timed out after 5000ms"), and a refused second send left a second submission.
// Contract (review 2026-10-17):
//   * a request refused BEFORE the transport (HardKAS's own pre-transport failures, or an interceptor that refuses with
//     the code RPC_REQUEST_NOT_SENT) is a typed SUBMIT_NOT_SENT and writes NO submission: nothing was submitted;
//   * when the request may have reached the node (timeout, disconnection, or a failure HardKAS cannot see), the
//     submission keeps its UNKNOWN outcome — conservative, unchanged; a node rejection stays a rejection;
//   * a cross-process limit of one send still holds; receipt / status / why / explain / verify read the real one.
// The fake is TX-SEND-SUBMITPOINT-1's. Traces in $HARDKAS_BO_TRACE_DIR.
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

const traceDir = process.env.HARDKAS_BO_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, null, 2));
}
const made: string[] = [];
const fakes: ChainFake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-bo-netlogs-"));
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
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-bo-${label}-`));
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
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-bo-template-"));
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




// -----------------------------------------------------------------------------
// TX-SEND-BLOCKED-OUTCOME-1 helpers: a test interceptor that refuses submitTransaction BEFORE the transport (the
// contract: an error whose code is RPC_REQUEST_NOT_SENT), with a cross-process counter like the certification guard;
// and a frame-level blocker (throws inside the WebSocket send), which HardKAS cannot see.
// -----------------------------------------------------------------------------
const both = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;
const codeOf = (r: { json: any; stdout: string; stderr: string }) =>
  r.json?.error?.code ?? r.json?.code ?? /\[([A-Z][A-Z0-9_]+)\]/.exec(both(r))?.[1] ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(r.stderr)?.[1];
function submissionsOf(ws: string): any[] {
  const root = path.join(ws, ".hardkas", "artifacts");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true })
    .map(String)
    .filter((f) => /txSubmission-[0-9a-f]{64}\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8")));
}
const preloads = fs.mkdtempSync(path.join(os.tmpdir(), "hk-bo-preloads-"));
made.push(preloads);
const INTERCEPTOR = path.join(preloads, "interceptor.cjs");
fs.writeFileSync(
  INTERCEPTOR,
  `"use strict";
// Refuses kaspa-wasm RpcClient.submitTransaction before the transport once BO_MAX calls were let through (counted in the
// file BO_STATE, across processes). The refusal follows HardKAS's contract: code RPC_REQUEST_NOT_SENT.
const Module = require("node:module");
const fs = require("node:fs");
const original = Module._load;
Module._load = function (request, ...rest) {
  const m = original.call(this, request, ...rest);
  const proto = m && m.RpcClient && m.RpcClient.prototype;
  if (proto && typeof proto.submitTransaction === "function" && !proto.__boWrapped) {
    const submit = proto.submitTransaction;
    proto.submitTransaction = async function (...args) {
      let n = 0;
      try { n = Number(fs.readFileSync(process.env.BO_STATE, "utf8")) || 0; } catch {}
      if (n >= Number(process.env.BO_MAX || 0)) {
        const e = new Error("test interceptor: submitTransaction refused before the transport");
        e.code = "RPC_REQUEST_NOT_SENT";
        throw e;
      }
      fs.writeFileSync(process.env.BO_STATE, String(n + 1));
      return submit.apply(this, args);
    };
    Object.defineProperty(proto, "__boWrapped", { value: true });
  }
  return m;
};
`
);
const FRAME_BLOCKER = path.join(preloads, "frame-blocker.cjs");
fs.writeFileSync(
  FRAME_BLOCKER,
  `"use strict";
// Throws inside the WebSocket send of any submitTransaction frame: the frame never leaves, but the RPC client swallows
// the throw and the request times out — HardKAS cannot tell this from a lost answer.
const Module = require("node:module");
const original = Module._load;
const wrap = (proto) => {
  if (!proto || typeof proto.send !== "function" || proto.__boFrame) return;
  const send = proto.send;
  proto.send = function (data, ...rest) {
    if (/submitTransaction/.test(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))) throw new Error("frame blocked (test)");
    return send.call(this, data, ...rest);
  };
  Object.defineProperty(proto, "__boFrame", { value: true });
};
Module._load = function (request, ...rest) {
  const m = original.call(this, request, ...rest);
  if (request === "ws" && m) { wrap(m.prototype); if (m.WebSocket) wrap(m.WebSocket.prototype); }
  if (request === "websocket" && m && m.w3cwebsocket) wrap(m.w3cwebsocket.prototype);
  return m;
};
`
);
const withPreload = (file: string, extra: Record<string, string> = {}) => ({
  NODE_OPTIONS: `${String(hermeticChildEnv(path.join(logs, "x.log")).NODE_OPTIONS ?? "")} --require=${file.replace(/\\/g, "/")}`,
  ...extra
});
async function planAndSign(name: string, ws: string) {
  const plan = await run(`${name}-plan`, [cliDist, "tx", "plan", "--from", "funder", "--to", dest, "--amount", "1", "--network", "testnet-10", "--out", "plan.json", "--json"], ws);
  expect(plan.exit, plan.brief).toBe(0);
  const sign = await run(`${name}-sign`, [cliDist, "tx", "sign", "plan.json", "--account", "funder", "--password-env", PW_VAR, "--out", "signed.json", "--json"], ws);
  expect(sign.exit, sign.brief).toBe(0);
  return String(JSON.parse(fs.readFileSync(path.join(ws, "signed.json"), "utf8")).txId);
}
const send = (name: string, ws: string, env: Record<string, string> = {}) => run(name, [cliDist, "tx", "send", "signed.json", "--yes", "--json"], ws, env);

describe("TX-SEND-BLOCKED-OUTCOME-1 · a submission refused before the transport is not a network outcome", () => {
  it("BO-1 the request is refused before it reaches the transport: typed SUBMIT_NOT_SENT, NO submission record, nothing reached the node", async () => {
    const F = await fakeFor("bo1", { history: 3_000 });
    const ws = workspace("bo1", F.url);
    const txId = await planAndSign("BO-1", ws);
    const r = await send("BO-1", ws, withPreload(INTERCEPTOR, { BO_STATE: path.join(ws, "bo.state"), BO_MAX: "0" }));
    const subs = submissionsOf(ws);
    trace("BO-1", { send: r.brief, submissions: subs });
    expect(F.submits, "nothing reached the node").toBe(0);
    expect(r.exit, r.brief).not.toBe(0);
    expect(codeOf(r), r.brief).toBe("SUBMIT_NOT_SENT");
    expect(both(r)).toMatch(/not sent|never left/i);
    expect(subs, "a request that never left is not a submission").toEqual([]);
    const st = await run("BO-1-status", [cliDist, "tx", "status", txId, "--no-observe", "--json"], ws);
    expect(st.json?.derived?.evidence?.submissionArtifactId, st.brief).toBeUndefined();
    const rc = await run("BO-1-receipt", [cliDist, "tx", "receipt", txId, "--json"], ws);
    expect(codeOf(rc), rc.brief).toBe("RECEIPT_NOT_FOUND");
  });

  it("BO-2 the second send of an accepted transaction is refused before the transport (cross-process): still ONE submission, one frame; receipt / status / why / explain / verify read the accepted one", async () => {
    const F = await fakeFor("bo2", { history: 3_000 });
    const ws = workspace("bo2", F.url);
    const txId = await planAndSign("BO-2", ws);
    const env = withPreload(INTERCEPTOR, { BO_STATE: path.join(ws, "bo.state"), BO_MAX: "1" });
    const first = await send("BO-2-first", ws, env);
    expect(first.exit, first.brief).toBe(0);
    const again = await send("BO-2-again", ws, env);
    const subs = submissionsOf(ws);
    trace("BO-2", { first: first.brief, again: again.brief, submissions: subs.map((s) => ({ id: s.contentHash, result: s.submitResult })) });
    expect(F.submits).toBe(1);
    expect(again.exit, again.brief).not.toBe(0);
    expect(codeOf(again), again.brief).toBe("SUBMIT_NOT_SENT");
    expect(subs).toHaveLength(1);
    expect(subs[0].submitResult.accepted).toBe(true);
    const w = await run("BO-2-wait", [cliDist, "tx", "wait", txId, "--until", "confirmed", "--timeout", "60", "--json"], ws);
    expect(w.json?.state, w.brief).toBe("CONFIRMED");
    const rc = await run("BO-2-receipt", [cliDist, "tx", "receipt", txId, "--json"], ws);
    expect(rc.json?.result?.submitResult?.accepted, rc.brief).toBe(true);
    const why = await run("BO-2-why", [cliDist, "why", "--tx", txId, "--json"], ws);
    expect(why.json?.origin, why.brief).toBe("submitted");
    expect(why.json?.target).toBe(subs[0].contentHash);
    const ex = await run("BO-2-explain", [cliDist, "explain", "--tx", txId], ws);
    expect(ex.exit, ex.brief).toBe(0);
    expect(ex.stdout).toMatch(/CONFIRMED/);
    const v = await run("BO-2-verify", [cliDist, "verify", ".hardkas/artifacts", "--json"], ws);
    expect(v.json?.ok, v.brief).toBe(true);
  });
});

describe("TX-SEND-BLOCKED-OUTCOME-1 · when HardKAS cannot know, it stays conservative (unchanged)", () => {
  for (const mode of ["timeout", "disconnect"] as const) {
    it(`BO-3-${mode} the request left (the node received it) and no answer came: a submission with an UNKNOWN outcome, never 'not sent'; tx wait recovers`, async () => {
      const F = await fakeFor(`bo3${mode}`, { history: 3_000, submitMode: mode });
      const ws = workspace(`bo3-${mode}`, F.url);
      const txId = await planAndSign(`BO-3-${mode}`, ws);
      const r = await send(`BO-3-${mode}`, ws);
      const subs = submissionsOf(ws);
      trace(`BO-3-${mode}`, { send: r.brief, submissions: subs.map((s) => s.submitResult) });
      expect(F.submits).toBe(1);
      expect(codeOf(r)).not.toBe("SUBMIT_NOT_SENT");
      expect(subs).toHaveLength(1);
      expect(subs[0].submitResult.accepted).toBe(false);
      expect(String(subs[0].submitResult.error)).toMatch(/timed out|disconnected/i);
      expect(subs[0].txId).toBe(txId);
      const w = await run(`BO-3-${mode}-wait`, [cliDist, "tx", "wait", txId, "--until", "confirmed", "--timeout", "60", "--json"], ws);
      expect(w.json?.state, w.brief).toBe("CONFIRMED");
      expect(F.submits).toBe(1);
    });
  }

  it("BO-4 the node rejects: a submission with the node's rejection (unchanged)", async () => {
    const F = await fakeFor("bo4", { history: 3_000, submitMode: "reject" });
    const ws = workspace("bo4", F.url);
    await planAndSign("BO-4", ws);
    const r = await send("BO-4", ws);
    const subs = submissionsOf(ws);
    trace("BO-4", { send: r.brief, submissions: subs.map((s) => s.submitResult) });
    expect(F.submits).toBe(1);
    expect(codeOf(r)).not.toBe("SUBMIT_NOT_SENT");
    expect(subs).toHaveLength(1);
    expect(subs[0].submitResult.accepted).toBe(false);
    expect(String(subs[0].submitResult.error)).toMatch(/rejected/i);
  });

  it("BO-5 a frame swallowed inside the WebSocket (HardKAS cannot see it): conservative — a submission with an UNKNOWN outcome, never claimed 'not sent'", async () => {
    const F = await fakeFor("bo5", { history: 3_000 });
    const ws = workspace("bo5", F.url);
    await planAndSign("BO-5", ws);
    const r = await send("BO-5", ws, withPreload(FRAME_BLOCKER));
    const subs = submissionsOf(ws);
    trace("BO-5", { send: r.brief, submissions: subs.map((s) => s.submitResult) });
    expect(F.submits).toBe(0);
    expect(codeOf(r)).not.toBe("SUBMIT_NOT_SENT");
    expect(subs).toHaveLength(1);
    expect(subs[0].submitResult.accepted).toBe(false);
  });
});

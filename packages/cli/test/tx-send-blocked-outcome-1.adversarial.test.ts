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
// TX-SEND-BLOCKED-OUTCOME-1 · ADVERSARIAL (review 2026-10-17), loopback fakes only. Two checks on the contract that a
// submitTransaction error carrying the code RPC_REQUEST_NOT_SENT means "the request never left this process":
//   1. that code cannot be injected by the NODE: a node answer whose text, whose JSON-RPC `code`, or whose success
//      payload carries it — after the request reached the node — is never turned into SUBMIT_NOT_SENT;
//   2. a local interceptor that refuses before the transport gives SUBMIT_NOT_SENT with zero frames and zero records,
//      and does not poison the workspace for the real send that follows.
// The fake is TX-SEND-BLOCKED-OUTCOME-1's plus three adversarial answer modes. Traces in $HARDKAS_BO_TRACE_DIR.
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
  submitMode?: "accept" | "reject" | "timeout" | "disconnect" | "remote-error-text" | "remote-error-code" | "remote-ok-with-code";
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
          // ADVERSARIAL (BO-6): the request DID reach the node (the tx is accepted): the answer carries RPC_REQUEST_NOT_SENT
          if (opts.submitMode === "remote-error-text") return err("RPC_REQUEST_NOT_SENT: adversarial node text after the request was received (test)");
          if (opts.submitMode === "remote-error-code") return socket.send(`{"id":${id},"error":{"code":"RPC_REQUEST_NOT_SENT","message":"adversarial string code after the request was received (test)","data":null}}`);
          if (opts.submitMode === "remote-ok-with-code") return ok({ transactionId: txid, code: "RPC_REQUEST_NOT_SENT" });
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
// TX-SEND-BLOCKED-OUTCOME-1 · adversarial (review 2026-10-17): the code RPC_REQUEST_NOT_SENT must never be injectable
// by the node. Scenario 1: the request reaches the node and the node's answer carries that text / that code — HardKAS
// must NOT claim SUBMIT_NOT_SENT (the node even accepts the tx, the worst case). Scenario 2: a local interceptor refuses
// the request before the transport — SUBMIT_NOT_SENT, zero frames at the node, zero submission records; and the
// workspace is not poisoned: a later real send works, and a further one is refused again (cross-process).
// -----------------------------------------------------------------------------
const both = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;
const codeOf = (r: { json: any; stdout: string; stderr: string }) =>
  r.json?.error?.code ?? r.json?.code ?? /\[([A-Z][A-Z0-9_]+)\]/.exec(both(r))?.[1] ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(r.stderr)?.[1];
function artifactsOf(ws: string, pattern: RegExp): any[] {
  const root = path.join(ws, ".hardkas", "artifacts");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true })
    .map(String)
    .filter((f) => pattern.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8")));
}
const submissionsOf = (ws: string) => artifactsOf(ws, /txSubmission-[0-9a-f]{64}\.json$/);
const observationsOf2 = (ws: string) => artifactsOf(ws, /txObservation-[0-9a-f]{64}\.json$/);
const preloads = fs.mkdtempSync(path.join(os.tmpdir(), "hk-bo-adv-preloads-"));
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
const NOT_SENT_CLAIM = /SUBMIT_NOT_SENT|never left this process|was not sent/;

describe("TX-SEND-BLOCKED-OUTCOME-1 · adversarial 1 · the node's answer carries RPC_REQUEST_NOT_SENT after the request reached it", () => {
  for (const [mode, what] of [
    ["remote-error-text", "a node error whose TEXT is the code"],
    ["remote-error-code", "a JSON-RPC error whose `code` field is the string RPC_REQUEST_NOT_SENT"],
    ["remote-ok-with-code", "a success answer that also carries `code: RPC_REQUEST_NOT_SENT`"]
  ] as const) {
    it(`BO-6 ${mode}: ${what} — the node received the request (and accepts the tx): HardKAS never claims SUBMIT_NOT_SENT, records ONE submission naming the txId, and tx wait confirms from its submit point`, async () => {
      const F = await fakeFor(`bo6-${mode}`, { history: 3_000, submitMode: mode });
      const ws = workspace(`bo6-${mode}`, F.url);
      const txId = await planAndSign(`BO-6-${mode}`, ws);
      const r = await send(`BO-6-${mode}`, ws);
      const subs = submissionsOf(ws);
      trace(`BO-6-${mode}`, { send: r.brief, submissions: subs.map((s) => ({ txId: s.txId, result: s.submitResult, submitPoint: s.submitPoint })) });
      // the request DID reach the node
      expect(F.submits, "the node received the request").toBe(1);
      expect(F.methods).toContain("submitTransaction");
      // never "not sent", anywhere
      expect(codeOf(r), r.brief).not.toBe("SUBMIT_NOT_SENT");
      expect(both(r)).not.toMatch(NOT_SENT_CLAIM);
      // exactly one submission, naming the transaction that was sent, with its submit point; what happened is the
      // node's answer (accepted, or an error = unknown outcome), never a local refusal
      expect(subs).toHaveLength(1);
      expect(subs[0].txId).toBe(txId);
      expect(subs[0].submitPoint).toBeDefined();
      expect(JSON.stringify(subs[0])).not.toMatch(NOT_SENT_CLAIM);
      if (subs[0].submitResult.accepted === false) {
        expect(String(subs[0].submitResult.error)).not.toBe("");
      } else {
        expect(subs[0].submitResult.transactionId).toBe(txId);
      }
      // the record is usable: the observer confirms the (accepted) transaction from the recorded submit point
      const w = await run(`BO-6-${mode}-wait`, [cliDist, "tx", "wait", txId, "--until", "confirmed", "--timeout", "60", "--json"], ws);
      expect(w.json?.state, w.brief).toBe("CONFIRMED");
      expect(F.submits, "never re-sent").toBe(1);
    });
  }
});

describe("TX-SEND-BLOCKED-OUTCOME-1 · adversarial 2 · a local interceptor refuses the request before the transport", () => {
  it("BO-7 refused → SUBMIT_NOT_SENT with zero frames at the node and zero records; then a real send works (one frame, one submission); then a further send is refused again across processes and the records stay as they were", async () => {
    const F = await fakeFor("bo7", { history: 3_000 });
    const ws = workspace("bo7", F.url);
    const txId = await planAndSign("BO-7", ws);
    const state = path.join(ws, "bo.state");
    // 1. refused before the transport
    const refused = await send("BO-7-refused", ws, withPreload(INTERCEPTOR, { BO_STATE: state, BO_MAX: "0" }));
    trace("BO-7-refused", { send: refused.brief, submissions: submissionsOf(ws), observations: observationsOf2(ws).length });
    expect(refused.exit, refused.brief).not.toBe(0);
    expect(codeOf(refused), refused.brief).toBe("SUBMIT_NOT_SENT");
    expect(both(refused)).toMatch(/never left this process/);
    expect(F.submits, "zero frames at the node").toBe(0);
    expect(F.methods, "no submitTransaction reached the node at all").not.toContain("submitTransaction");
    expect(submissionsOf(ws), "zero submission records").toEqual([]);
    expect(observationsOf2(ws), "zero observation records").toEqual([]);
    const rc0 = await run("BO-7-receipt-0", [cliDist, "tx", "receipt", txId, "--json"], ws);
    expect(codeOf(rc0), rc0.brief).toBe("RECEIPT_NOT_FOUND");
    // 2. the refusal did not poison the workspace: the same signed artifact is sent for real
    const sent = await send("BO-7-sent", ws, withPreload(INTERCEPTOR, { BO_STATE: state, BO_MAX: "1" }));
    trace("BO-7-sent", { send: sent.brief, submissions: submissionsOf(ws).map((s) => s.submitResult) });
    expect(sent.exit, sent.brief).toBe(0);
    expect(F.submits).toBe(1);
    const subs1 = submissionsOf(ws);
    expect(subs1).toHaveLength(1);
    expect(subs1[0].submitResult).toMatchObject({ accepted: true, transactionId: txId });
    expect(subs1[0].txId).toBe(txId);
    // 3. a further send (a new process, the shared state at its limit) is refused again; nothing changes
    const again = await send("BO-7-again", ws, withPreload(INTERCEPTOR, { BO_STATE: state, BO_MAX: "1" }));
    trace("BO-7-again", { send: again.brief });
    expect(codeOf(again), again.brief).toBe("SUBMIT_NOT_SENT");
    expect(F.submits, "still one frame").toBe(1);
    expect(submissionsOf(ws).map((s) => s.contentHash)).toEqual(subs1.map((s) => s.contentHash));
    const w = await run("BO-7-wait", [cliDist, "tx", "wait", txId, "--until", "confirmed", "--timeout", "60", "--json"], ws);
    expect(w.json?.state, w.brief).toBe("CONFIRMED");
    const rc = await run("BO-7-receipt", [cliDist, "tx", "receipt", txId, "--json"], ws);
    expect(rc.json?.result?.submitResult?.accepted, rc.brief).toBe(true);
    expect(F.submits).toBe(1);
  });
});

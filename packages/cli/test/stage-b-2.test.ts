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
// STAGE-B-2 (C3, C4), loopback fakes only — the scenarios the review added to STAGE-B-1's ten:
//   * an external tx observed as MEMPOOL_ACCEPTED, ACCEPTED, CONFIRMED and REORGED: `why --tx` / `explain --tx` answer
//     with origin "observed" and the derived state; `tx receipt` stays RECEIPT_NOT_FOUND and says what was observed;
//     no submission is ever created and these commands contact no node;
//   * evidence that does not verify (tampered observation, tampered submission) or that conflicts (two observers)
//     never yields an observed explanation it does not support;
//   * the output of a tx sent from this workspace keeps its shape (origin "submitted" is the only addition);
//   * `tx wait --since`: an unavailable cursor ends the wait at once with nothing recorded; the no-cursor hint appears
//     only when it is the cause; an explicit cursor survives a transport error on the first look.
// The fake is TN10-CONFIRMATION-FIX-1's, plus a mempool entry for an external tx, a chain reorganization and transient
// chain-read failures. Traces in $HARDKAS_SB_TRACE_DIR.
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
};
type ChainFake = {
  url: string;
  port: number;
  methods: string[];
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
    for (let i = tip; i <= to; i++) index.set(hashOf(i), i);
    tip = to;
  };
  grow(opts.staticChain?.tip ?? 3_000);
  const daa = (i: number) => DAA0 + i * daaPerChain;
  const blue = (i: number) => BLUE0 + i;
  let submitted: { txid: string; outputs: Array<{ spk: string; value: number }>; transaction: unknown } | undefined;
  const fake: ChainFake = {
    url: "",
    port: 0,
    methods: [],
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
        case "getBlockDagInfo":
          return ok({ network: "testnet-10", blockCount: tip + 1, headerCount: tip + 1, tipHashes: [chainAt(tip)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [chainAt(tip)], pruningPointHash: hashOf(0), virtualDaaScore: daa(tip) + 1, sink: chainAt(tip) });
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
            return ok({ mempoolEntry: { fee: 2036, isOrphan: false, transaction: submitted.transaction } });
          }
          return err(`Transaction ${params?.transactionId} not found`);
        case "submitTransaction": {
          fake.submits++;
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
          return ok({ transactionId: txid });
        }
        case "getBlock": {
          const i = index.get(params?.hash) ?? indexB.get(params?.hash);
          if (i === undefined) return err(`cannot find header ${params?.hash}`);
          const own = String(params.hash);
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

const traceDir = process.env.HARDKAS_SB_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, null, 2));
}
const made: string[] = [];
const fakes: ChainFake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sb-netlogs-"));
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
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-sb-${label}-`));
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
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sb-template-"));
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
const codeOf = (r: { json: any; stdout: string; stderr: string }) =>
  r.json?.error?.code ?? r.json?.code ?? /\[([A-Z][A-Z0-9_]+)\]/.exec(both(r))?.[1] ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(r.stderr)?.[1];
const submissionsOf = (ws: string) =>
  fs
    .readdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true })
    .map(String)
    .filter((f) => /submission|receipt/i.test(f) && f.endsWith(".json"));
const NO_SUBMISSION = /no submission recorded in this workspace/i;
const NO_CURSOR_HINT = /no --since was given/;
const observe = (name: string, ws: string, txId: string, since?: string) =>
  run(name, [cliDist, "tx", "status", txId, ...(since ? ["--since", since] : []), "--json"], ws);
const readers = async (name: string, ws: string, txId: string) => ({
  receipt: await run(`${name}-receipt`, [cliDist, "tx", "receipt", txId, "--json"], ws),
  why: await run(`${name}-why`, [cliDist, "why", "--tx", txId, "--json"], ws),
  explain: await run(`${name}-explain`, [cliDist, "explain", "--tx", txId], ws)
});

describe("STAGE-B-2 · C4 · an external tx observed in each derived state: origin observed, never a submission", () => {
  const cases = [
    { name: "SB2-C4-MEMPOOL", state: "MEMPOOL_ACCEPTED", tx: sha("sb2-mempool-tx") },
    { name: "SB2-C4-ACCEPTED", state: "ACCEPTED", tx: sha("sb2-accepted-tx") },
    { name: "SB2-C4-CONFIRMED", state: "CONFIRMED", tx: sha("sb2-confirmed-tx") },
    { name: "SB2-C4-REORGED", state: "REORGED", tx: sha("sb2-reorged-tx") }
  ] as const;
  for (const c of cases) {
    it(`${c.name} why --tx / explain --tx answer ${c.state} with origin "observed"; tx receipt stays RECEIPT_NOT_FOUND and names it; no node contacted, nothing created`, async () => {
      const F =
        c.state === "MEMPOOL_ACCEPTED"
          ? await fakeFor(c.name, { staticChain: { tip: 2_000, accept: 1_000_000_000, txid: c.tx }, mempoolTxid: c.tx })
          : c.state === "ACCEPTED"
            ? await fakeFor(c.name, { staticChain: { tip: 50_050, accept: 50_000, txid: c.tx } })
            : c.state === "CONFIRMED"
              ? await fakeFor(c.name, { staticChain: { tip: 60_000, accept: 50_000, txid: c.tx } })
              : await fakeFor(c.name, { staticChain: { tip: 50_300, accept: 50_000, txid: c.tx } });
      const ws = workspace(c.name.toLowerCase(), F.url);
      const first = await observe(`${c.name}-look1`, ws, c.tx, F.hashOf(c.state === "MEMPOOL_ACCEPTED" ? 1_900 : 49_900));
      trace(`${c.name}-look1`, { exit: first.exit, json: first.json, out: first.brief });
      expect(first.exit, first.brief).toBe(0);
      if (c.state === "REORGED") {
        expect(first.json?.state, first.brief).toBe("CONFIRMED");
        F.reorg();
        const second = await observe(`${c.name}-look2`, ws, c.tx);
        expect(second.exit, second.brief).toBe(0);
      }
      const before = F.methods.length;
      const r = await readers(c.name, ws, c.tx);
      trace(c.name, { receipt: r.receipt.brief, why: r.why.json ?? r.why.brief, explain: r.explain.brief });
      // why --tx (JSON): the observed view, its derived state, the looks it stands on, no submission
      expect(r.why.exit, r.why.brief).toBe(0);
      expect(r.why.json).toMatchObject({ target: c.tx, origin: "observed", txId: c.tx, network: "testnet-10", state: c.state, submission: null });
      expect(r.why.json.note).toMatch(NO_SUBMISSION);
      expect(r.why.json.observations.length).toBe(observationsOf(ws).length);
      expect(r.why.json.observations.every((o: any) => /^[0-9a-f]{64}$/.test(o.artifactId))).toBe(true);
      expect(r.why.json.derived.status).toBe(c.state);
      expect(r.why.json.derived.evidence.submissionArtifactId).toBeUndefined();
      if (c.state === "CONFIRMED") expect(r.why.json.acceptingBlockHash).toBe(F.hashOf(50_000));
      if (c.state === "MEMPOOL_ACCEPTED") expect(r.why.json.acceptingBlockHash).toBeUndefined();
      // explain --tx: the same state, labelled observed
      expect(r.explain.exit, r.explain.brief).toBe(0);
      expect(r.explain.stdout).toContain(c.state);
      expect(r.explain.stdout).toMatch(/Origin\W+observed/);
      expect(r.explain.stdout).toMatch(NO_SUBMISSION);
      expect(r.explain.stdout).not.toMatch(/Artifact ID/);
      // tx receipt: no receipt is invented; the refusal names the observed state
      expect(r.receipt.exit, r.receipt.brief).toBe(1);
      expect(codeOf(r.receipt)).toBe("RECEIPT_NOT_FOUND");
      expect(both(r.receipt)).toMatch(NO_SUBMISSION);
      expect(both(r.receipt)).toContain(`derived state: ${c.state}`);
      // a state other than CONFIRMED is never presented as CONFIRMED
      if (c.state !== "CONFIRMED") {
        expect(r.why.json.state).not.toBe("CONFIRMED");
        expect(both(r.receipt)).not.toMatch(/derived state: CONFIRMED/);
      }
      // no submission, signature or receipt was created; the three readers contacted no node
      expect(submissionsOf(ws)).toEqual([]);
      expect(fs.readdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true }).map(String).filter((f) => /signed|plan/i.test(f) && f.endsWith(".json"))).toEqual([]);
      for (const x of [r.receipt, r.why, r.explain]) expect(x.dialled, x.brief).toEqual([]);
      expect(F.methods.length).toBe(before);
    });
  }
});

describe("STAGE-B-2 · C4 · evidence that does not verify or that conflicts", () => {
  const TX = sha("sb2-evidence-tx");

  it("SB2-EV-1 the only observation is tampered (body changed, identity not recomputed): no observed explanation, nothing CONFIRMED; the receipt refusal says it was ignored", async () => {
    const F = await fakeFor("ev1", { staticChain: { tip: 60_000, accept: 50_000, txid: TX } });
    const ws = workspace("ev1", F.url);
    const s = await observe("SB2-EV-1-look", ws, TX, F.hashOf(49_900));
    expect(s.json?.state, s.brief).toBe("CONFIRMED");
    const dir = path.join(ws, ".hardkas", "artifacts", "observations");
    const file = path.join(dir, observationsOf(ws)[0]!);
    const o = JSON.parse(fs.readFileSync(file, "utf8"));
    o.finding.acceptingBlueScore = String(BigInt(o.finding.acceptingBlueScore) - 5000n);
    fs.writeFileSync(file, JSON.stringify(o, null, 2));
    const r = await readers("SB2-EV-1", ws, TX);
    trace("SB2-EV-1", { receipt: r.receipt.brief, why: r.why.brief, explain: r.explain.brief });
    for (const x of [r.receipt, r.why, r.explain]) {
      expect(x.exit, x.brief).not.toBe(0);
      expect(both(x)).not.toMatch(/origin.{0,4}observed|CONFIRMED/i);
    }
    expect(codeOf(r.receipt)).toBe("RECEIPT_NOT_FOUND");
    expect(both(r.receipt)).toMatch(/1 observation file\(s\) for this txId do not verify/);
    expect(codeOf(r.why)).toBe("RECEIPT_NOT_FOUND");
  });

  it("SB2-EV-2 two observers that disagree (each names a different accepting block): the explanation is the derived conflict, never CONFIRMED", async () => {
    const A = await fakeFor("ev2a", { staticChain: { tip: 60_000, accept: 50_000, txid: TX } });
    // B's chain also accepts the tx at height 50 000, but B's blocks are different blocks: two observers, two accepting blocks
    const B = await fakeFor("ev2b", { staticChain: { tip: 60_000, accept: 50_000, txid: TX } });
    const ws = workspace("ev2", A.url);
    const a = await observe("SB2-EV-2-lookA", ws, TX, A.hashOf(49_900));
    expect(a.json?.state, a.brief).toBe("CONFIRMED");
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), cfg(B.url));
    const b = await observe("SB2-EV-2-lookB", ws, TX, B.hashOf(49_900));
    expect(b.exit, b.brief).toBe(0);
    const derivedHere = b.json?.state;
    const r = await readers("SB2-EV-2", ws, TX);
    trace("SB2-EV-2", { derivedByStatus: derivedHere, why: r.why.json ?? r.why.brief, receipt: r.receipt.brief, explain: r.explain.brief });
    expect(r.why.exit, r.why.brief).toBe(0);
    expect(r.why.json.origin).toBe("observed");
    // the explanation is exactly what tx status derives from the same evidence
    expect(r.why.json.state).toBe(derivedHere);
    expect(r.why.json.state).not.toBe("CONFIRMED");
    expect(new Set(r.why.json.observations.map((l: any) => l.observerId)).size).toBe(2);
    expect(both(r.receipt)).toContain(`derived state: ${derivedHere}`);
  });

  it("SB2-EV-3 a tampered SUBMISSION is never replaced by the observed view: why/explain/receipt keep the verification error even though observations exist", async () => {
    const F = await fakeFor("ev3", { acceptAfter: 3 });
    const ws = workspace("ev3", F.url);
    const txId = await sendFromWorkspace("SB2-EV-3", ws);
    const w = await run("SB2-EV-3-wait", [cliDist, "tx", "wait", txId, "--until", "confirmed", "--timeout", "120", "--json"], ws);
    expect(w.json?.state, w.brief).toBe("CONFIRMED");
    expect(observationsOf(ws).length).toBeGreaterThan(0);
    const sub = path.join(ws, ".hardkas", "artifacts", submissionsOf(ws).find((f) => /submission/i.test(f))!);
    const body = JSON.parse(fs.readFileSync(sub, "utf8"));
    body.networkId = body.networkId === "testnet-10" ? "testnet-11" : "testnet-10";
    fs.writeFileSync(sub, JSON.stringify(body, null, 2));
    const r = await readers("SB2-EV-3", ws, txId);
    trace("SB2-EV-3", { receipt: r.receipt.brief, why: r.why.brief, explain: r.explain.brief });
    for (const x of [r.receipt, r.why, r.explain]) {
      expect(x.exit, x.brief).not.toBe(0);
      expect(both(x)).not.toMatch(/origin.{0,4}observed/i);
      expect(codeOf(x)).not.toBe("RECEIPT_NOT_FOUND");
    }
  });
});

let ctlWs = "";
let ctlTx = "";
async function sendFromWorkspace(name: string, ws: string): Promise<string> {
  const plan = await run(`${name}-plan`, [cliDist, "tx", "plan", "--from", "funder", "--to", dest, "--amount", "1", "--network", "testnet-10", "--out", "plan.json", "--json"], ws);
  expect(plan.exit, plan.brief).toBe(0);
  const sign = await run(`${name}-sign`, [cliDist, "tx", "sign", "plan.json", "--account", "funder", "--password-env", PW_VAR, "--out", "signed.json", "--json"], ws);
  expect(sign.exit, sign.brief).toBe(0);
  const send = await run(`${name}-send`, [cliDist, "tx", "send", "signed.json", "--yes", "--json"], ws);
  expect(send.exit, send.brief).toBe(0);
  return String(send.json?.txId ?? send.json?.result?.txId ?? /[0-9a-f]{64}/.exec(send.stdout)?.[0]);
}

describe("STAGE-B-2 · compatibility · a tx sent from this workspace keeps its output (origin \"submitted\" is the only addition)", () => {
  it("SB2-COMPAT-1 why --tx JSON keeps its keys plus origin submitted; explain --tx keeps its rows plus Origin submitted; tx receipt unchanged", async () => {
    const F = await fakeFor("compat", { acceptAfter: 3 });
    ctlWs = workspace("compat", F.url);
    ctlTx = await sendFromWorkspace("SB2-COMPAT-1", ctlWs);
    expect(F.submits).toBe(1);
    const w = await run("SB2-COMPAT-1-wait", [cliDist, "tx", "wait", ctlTx, "--until", "confirmed", "--timeout", "120", "--json"], ctlWs);
    expect(w.json?.state, w.brief).toBe("CONFIRMED");
    const r = await readers("SB2-COMPAT-1", ctlWs, ctlTx);
    trace("SB2-COMPAT-1", { receipt: r.receipt.json ?? r.receipt.brief, why: r.why.json ?? r.why.brief, explain: r.explain.brief });
    expect(r.why.exit, r.why.brief).toBe(0);
    expect(Object.keys(r.why.json).sort()).toEqual(["authScope", "chain", "origin", "resolvedBy", "resolvedPath", "target"]);
    expect(r.why.json.origin).toBe("submitted");
    expect(r.why.json.chain.length).toBeGreaterThanOrEqual(1);
    expect(r.explain.exit, r.explain.brief).toBe(0);
    for (const row of ["Artifact ID", "Tx ID", "Authentication Scope", "Resolved By", "Integrity", "Network State"]) expect(r.explain.stdout).toContain(row);
    expect(r.explain.stdout).toMatch(/Origin\W+submitted/);
    expect(r.explain.stdout).not.toMatch(/origin.{0,4}observed/i);
    expect(r.receipt.exit, r.receipt.brief).toBe(0);
    expect(r.receipt.json).toMatchObject({ ok: true, command: "tx receipt", result: { txId: ctlTx } });
    expect(F.submits).toBe(1);
  });
});

describe("STAGE-B-2 · C3 · tx wait --since edges", () => {
  const TX = sha("sb2-c3-tx");
  const LONG = sha("sb2-c3-long-tx");

  it("SB2-C3-1 --since a block the node does not hold: ends at once with OBSERVE_SINCE_UNAVAILABLE, nothing recorded (no timeout)", async () => {
    const F = await fakeFor("c3u", { staticChain: { tip: 60_000, accept: 50_000, txid: TX } });
    const ws = workspace("sb2-c3-1", F.url);
    const t0 = Date.now();
    const r = await run("SB2-C3-1", [cliDist, "tx", "wait", TX, "--since", sha("not-a-block-the-node-holds"), "--timeout", "60", "--json"], ws);
    const ms = Date.now() - t0;
    trace("SB2-C3-1", { exit: r.exit, ms, out: r.brief });
    expect(r.exit, r.brief).not.toBe(0);
    expect(codeOf(r), r.brief).toBe("OBSERVE_SINCE_UNAVAILABLE");
    expect(ms).toBeLessThan(30_000);
    expect(observationsOf(ws)).toEqual([]);
    expect(submissionsOf(ws)).toEqual([]);
  });

  it("SB2-C3-2 --since a block AFTER the acceptance: the wait times out (absence proves nothing) and does NOT give the no-cursor hint", async () => {
    const F = await fakeFor("c3a", { staticChain: { tip: 60_000, accept: 50_000, txid: TX } });
    const ws = workspace("sb2-c3-2", F.url);
    const r = await run("SB2-C3-2", [cliDist, "tx", "wait", TX, "--since", F.hashOf(55_000), "--timeout", "4", "--interval", "1", "--json"], ws);
    trace("SB2-C3-2", { exit: r.exit, out: r.brief });
    expect(r.exit, r.brief).toBe(1);
    expect(codeOf(r)).toBe("TX_WAIT_TIMEOUT");
    expect(both(r)).toMatch(/INSUFFICIENT_EVIDENCE/);
    expect(both(r)).not.toMatch(NO_CURSOR_HINT);
  });

  it("SB2-C3-3 a tx sent from this workspace that the chain never names: the wait times out WITHOUT the no-cursor hint (a submission is recorded)", async () => {
    const F = await fakeFor("c3s", { mode: "utxo-only", acceptAfter: 3 });
    const ws = workspace("sb2-c3-3", F.url);
    const txId = await sendFromWorkspace("SB2-C3-3", ws);
    const r = await run("SB2-C3-3", [cliDist, "tx", "wait", txId, "--until", "accepted", "--timeout", "5", "--interval", "1", "--json"], ws);
    trace("SB2-C3-3", { exit: r.exit, out: r.brief });
    expect(r.exit, r.brief).toBe(1);
    expect(codeOf(r)).toBe("TX_WAIT_TIMEOUT");
    expect(both(r)).not.toMatch(NO_CURSOR_HINT);
    expect(F.submits).toBe(1);
  });

  it("SB2-C3-4 an explicit --since survives a transport error on the first look: the next look still starts there (long history, accepted near the tip) → CONFIRMED", async () => {
    const F = await fakeFor("c3t", { staticChain: { tip: 400_000, accept: 390_000, txid: LONG }, failFirstChainReads: 1 });
    const ws = workspace("sb2-c3-4", F.url);
    const r = await run("SB2-C3-4", [cliDist, "tx", "wait", LONG, "--since", F.hashOf(389_900), "--timeout", "30", "--interval", "1", "--json"], ws);
    trace("SB2-C3-4", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.json?.state).toBe("CONFIRMED");
    expect(r.json.derived.acceptingBlockHash).toBe(F.hashOf(390_000));
    // one failed look (nothing recorded) + one look from the explicit cursor
    expect(observationsOf(ws)).toHaveLength(1);
  });

  it("SB2-C3-5 a second wait without --since resumes from the stored window (no rescan from the pruning point)", async () => {
    const F = await fakeFor("c3r", { staticChain: { tip: 400_000, accept: 390_000, txid: LONG } });
    const ws = workspace("sb2-c3-5", F.url);
    const s = await run("SB2-C3-5-status", [cliDist, "tx", "status", LONG, "--since", F.hashOf(300_000), "--json"], ws);
    expect(s.exit, s.brief).toBe(0);
    const before = F.methods.filter((m) => m === "getVirtualChainFromBlock").length;
    const r = await run("SB2-C3-5", [cliDist, "tx", "wait", LONG, "--timeout", "30", "--interval", "1", "--json"], ws);
    const reads = F.methods.filter((m) => m === "getVirtualChainFromBlock").length - before;
    trace("SB2-C3-5", { exit: r.exit, reads, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.json?.state).toBe("CONFIRMED");
    // from the stored window (≈ 336 800) to 390 000 is ≈ 29 batches; from the pruning point it would be ≈ 212
    expect(reads).toBeLessThan(60);
  });
});

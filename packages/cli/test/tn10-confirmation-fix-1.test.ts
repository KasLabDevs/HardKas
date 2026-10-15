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
// TN10-CONFIRMATION-FIX-1 (2026-10-15), loopback fakes only. Findings from the first public TN10 payment:
//   * a kaspad UTXO row carries the accepting chain block's DAA score and NO block hash, so TQ-1 could never record
//     inclusion (TQ-INCLUSION-METADATA-1), and it counted a DAA delta as confirmations;
//   * `hardkas tx status` of a tx sent outside this workspace scans from the pruning point and cannot reach it
//     (TX-STATUS-WINDOW-1).
// Contract (review 2026-10-15):
//   * TQ-1 records the sink BEFORE the submission, then the product observer (`sdk.tx.observe`) names the accepting
//     chain block from it; confirmations are blue-score depth; the block is bound to the UTXO row (same DAA score);
//     UTXO presence alone never confirms; receipts are v3; still exactly ONE submitTransaction;
//   * `--confirmation-daa-delta` is a loud legacy alias with blue-score meaning; conflicting with --min-confirmations it
//     is refused before any connection;
//   * `hardkas tx status <txid> --since <chainBlockHash>` observes an external tx without inventing a receipt; an
//     unknown/pruned cursor gives INSUFFICIENT_EVIDENCE with a clear cause and records nothing.
// The fake: testnet-10, a selected chain that grows one block per tick (blue +1, DAA +daaPerChain), UTXO rows in
// exactly the kaspad 2.1.0 shape (no blockHash), getVirtualChainFromBlock in batches of 1 840 with accepted tx ids.
// It computes the txid of the submitted transaction with kaspa-wasm and accepts it a few blocks later. Traces in
// $HARDKAS_TCF_TRACE_DIR.
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
  close(): Promise<void>;
};

async function startChainFake(label: string, opts: ChainFakeOptions = {}): Promise<ChainFake> {
  const daaPerChain = opts.daaPerChain ?? 1;
  const hashOf = (i: number) => sha(`tcf-${label}-chain-${i}`);
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
  const fake: ChainFake = { url: "", port: 0, methods: [], submits: 0, hashOf, close: async () => {} };
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
          return ok({ network: "testnet-10", blockCount: tip + 1, headerCount: tip + 1, tipHashes: [hashOf(tip)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(tip)], pruningPointHash: hashOf(0), virtualDaaScore: daa(tip) + 1, sink: hashOf(tip) });
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
          const i = index.get(params?.hash);
          if (i === undefined) return err(`cannot find header ${params?.hash}`);
          const parentsByLevel: string[][] = [];
          for (let level = 0; level < 16 && i - 2 ** level >= 0; level++) parentsByLevel.push([hashOf(i - 2 ** level)]);
          return ok({
            block: {
              header: { hash: hashOf(i), version: 1, parentsByLevel, hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: 1792088193138 + i * 100, bits: 486722099, nonce: 0, daaScore: daa(i), blueWork: (blue(i) * 1000).toString(16), blueScore: blue(i), pruningPoint: hashOf(0) },
              transactions: [],
              verboseData: { hash: hashOf(i), difficulty: 1, selectedParentHash: i > 0 ? hashOf(i - 1) : zero, transactionIds: [], isHeaderOnly: false, blueScore: blue(i), childrenHashes: i < tip ? [hashOf(i + 1)] : [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: true }
            }
          });
        }
        case "getVirtualChainFromBlock": {
          const i = index.get(params?.startHash);
          if (i === undefined) return err(`cannot find header ${params?.startHash}`);
          if (opts.forgetStartAfterSubmit && fake.submittedAtTip !== undefined && i <= fake.submittedAtTip) {
            return err(`cannot find header ${params?.startHash}`);
          }
          const added: string[] = [];
          const acceptedIds: unknown[] = [];
          for (let j = i + 1; j <= Math.min(i + BATCH, tip); j++) {
            added.push(hashOf(j));
            const listsTx = (opts.mode ?? "accept") === "accept" && fake.txid !== undefined && j === fake.acceptAt && (opts.staticChain !== undefined || submitted !== undefined);
            acceptedIds.push({ acceptingBlockHash: hashOf(j), acceptedTransactionIds: listsTx ? [sha(`cb-${j}`), fake.txid] : [sha(`cb-${j}`)] });
          }
          return ok({ removedChainBlockHashes: [], addedChainBlockHashes: added, acceptedTransactionIds: params?.includeAcceptedTransactionIds ? acceptedIds : [] });
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

const traceDir = process.env.HARDKAS_TCF_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, null, 2));
}
const made: string[] = [];
const fakes: ChainFake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tcf-netlogs-"));
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
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-tcf-${label}-`));
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
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tcf-template-"));
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

describe("TN10-CONFIRMATION-FIX-1 · TQ-1 names the accepting chain block and counts blue score", () => {
  it("TCF-1 PASS: one submitTransaction; start point captured before it; the virtual chain names the accepting block; ≥100 blue-score confirmations; bound to the UTXO row; receipt v3", async () => {
    const F = await fakeFor("tcf1");
    const ws = workspace("tcf1", F.url);
    const r = await qualify("TCF-1", ws, F.url);
    const rec = receiptOf(ws);
    trace("TCF-1", { exit: r.exit, dialled: r.dialled, submits: F.submits, acceptAt: F.acceptAt, submittedAtTip: F.submittedAtTip, receipt: rec, out: r.brief });
    expect(F.submits, r.brief).toBe(1);
    expect(r.exit, r.brief).toBe(0);
    expect(onlyLoopback(r.dialled, F), JSON.stringify(r.dialled)).toBe(true);
    expect(rec.schemaVersion).toBe(3);
    expect(rec.outcome).toBe("PASS");
    const ev = rec.evidence;
    expect(ev.inclusions).toBeUndefined();
    expect(ev.confirmations).toBeUndefined();
    // the start point is a chain position at or before the submission
    const startIdx = [...Array(F.submittedAtTip! + 1).keys()].reverse().find((i) => F.hashOf(i) === ev.startPoints[0].sinkHash);
    expect(startIdx, "start point = a sink seen no later than the submission").toBeDefined();
    expect(ev.chainAcceptances[0]).toMatchObject({
      txid: F.txid,
      method: "virtual-chain-from-submit-start-point",
      acceptingBlockHash: F.hashOf(F.acceptAt!),
      acceptingBlueScore: String(BLUE0 + F.acceptAt!),
      acceptingDaaScore: String(DAA0 + F.acceptAt!),
      utxoBinding: { result: "matches", utxoBlockDaaScore: String(DAA0 + F.acceptAt!), acceptingDaaScore: String(DAA0 + F.acceptAt!) }
    });
    const c = ev.blueConfirmations[0];
    expect(c).toMatchObject({ acceptingBlockHash: F.hashOf(F.acceptAt!), unit: "blue-score", policy: { minConfirmations: "100", unit: "blue-score", requestedVia: "--min-confirmations", satisfied: true } });
    expect(BigInt(c.confirmationsBlue)).toBeGreaterThanOrEqual(100n);
    expect(BigInt(c.sinkBlueScoreAtObservation) - BigInt(c.acceptingBlueScore)).toBe(BigInt(c.confirmationsBlue));
    expect(["CONFIRMED", "FINALIZED"]).toContain(c.observedStatus);
    // the observation it stands on is the product observer's, persisted in the workspace
    expect(observationsOf(ws).some((f) => f.includes(c.observationArtifactId))).toBe(true);
    expect(r.stdout).toMatch(/accepting block\s*:\s*[0-9a-f]{64}/);
    expect(r.stdout).toMatch(/confirmation\s*:\s*\d+ blue-score confirmations >= 100/);
    expect(r.stdout).toMatch(/submit calls\s*:\s*1\b/);
    for (const text of [r.stdout, r.stderr, JSON.stringify(rec)]) expect(text.includes(PW)).toBe(false);
  });

  it("TCF-2 red blocks (DAA +3 per chain block): the threshold is blue score — the receipt's blue confirmations reach 100, not merely 100 DAA", async () => {
    const F = await fakeFor("tcf2", { daaPerChain: 3 });
    const ws = workspace("tcf2", F.url);
    const r = await qualify("TCF-2", ws, F.url);
    const rec = receiptOf(ws);
    trace("TCF-2", { exit: r.exit, receipt: rec, out: r.brief });
    expect(F.submits, r.brief).toBe(1);
    expect(r.exit, r.brief).toBe(0);
    const c = rec.evidence.blueConfirmations[0];
    expect(BigInt(c.confirmationsBlue)).toBeGreaterThanOrEqual(100n);
    // DAA and blue score come from two RPC reads while the fake chain grows, so their ratio is not exact; DAA runs ahead
    expect(BigInt(c.confirmationsDaa)).toBeGreaterThan(BigInt(c.confirmationsBlue));
  });

  it("TCF-3 the outputs reach the UTXO set but the virtual chain never names an accepting block → UNRESOLVED ACCEPTANCE_BLOCK_NOT_FOUND (exit 2), never confirmed", async () => {
    const F = await fakeFor("tcf3", { mode: "utxo-only" });
    const ws = workspace("tcf3", F.url);
    const r = await qualify("TCF-3", ws, F.url);
    const rec = receiptOf(ws);
    trace("TCF-3", { exit: r.exit, receipt: rec, out: r.brief });
    expect(F.submits, r.brief).toBe(1);
    expect(r.exit, r.brief).toBe(2);
    expect(rec.outcome).toBe("UNRESOLVED");
    expect(rec.evidence.acceptances).toHaveLength(1);
    expect(rec.evidence.chainAcceptances).toBeUndefined();
    expect(rec.evidence.blueConfirmations).toBeUndefined();
    expect(rec.evidence.notes.blocker).toMatchObject({ stage: "acceptance-block", code: "ACCEPTANCE_BLOCK_NOT_FOUND" });
    expect(r.stdout).toMatch(/confirmation\s*:\s*\(none\)/);
  });

  it("TCF-4 the UTXO row's DAA score contradicts the block the chain names → UNRESOLVED ACCEPTANCE_UTXO_CONFLICT", async () => {
    const F = await fakeFor("tcf4", { utxoDaaOffset: 1 });
    const ws = workspace("tcf4", F.url);
    const r = await qualify("TCF-4", ws, F.url);
    const rec = receiptOf(ws);
    trace("TCF-4", { exit: r.exit, receipt: rec, out: r.brief });
    expect(F.submits, r.brief).toBe(1);
    expect(r.exit, r.brief).toBe(2);
    expect(rec.evidence.notes.blocker.code).toBe("ACCEPTANCE_UTXO_CONFLICT");
    expect(rec.evidence.chainAcceptances[0].utxoBinding.result).toBe("mismatch");
    expect(rec.evidence.blueConfirmations).toBeUndefined();
  });

  it("TCF-5 the node stops serving the chain from the start point (pruned) → UNRESOLVED ACCEPTANCE_CHAIN_UNAVAILABLE; the chain is not inferred", async () => {
    const F = await fakeFor("tcf5", { forgetStartAfterSubmit: true, acceptAfter: 1 });
    const ws = workspace("tcf5", F.url);
    const r = await qualify("TCF-5", ws, F.url);
    const rec = receiptOf(ws);
    trace("TCF-5", { exit: r.exit, receipt: rec, out: r.brief });
    expect(F.submits, r.brief).toBe(1);
    expect(r.exit, r.brief).toBe(2);
    expect(rec.evidence.notes.blocker.code).toBe("ACCEPTANCE_CHAIN_UNAVAILABLE");
    expect(rec.evidence.blueConfirmations).toBeUndefined();
  });

  it("TCF-6 legacy --confirmation-daa-delta: said loudly on stderr, blue-score meaning, recorded as the legacy alias", async () => {
    const F = await fakeFor("tcf6");
    const ws = workspace("tcf6", F.url);
    const r = await qualify("TCF-6", ws, F.url, ["--confirmation-daa-delta", "100"]);
    const rec = receiptOf(ws);
    trace("TCF-6", { exit: r.exit, receipt: rec, out: r.brief });
    expect(r.stderr, r.brief).toMatch(/LEGACY_FLAG --confirmation-daa-delta 100: .*BLUE-SCORE confirmations/);
    expect(r.exit, r.brief).toBe(0);
    expect(rec.evidence.blueConfirmations[0].policy).toMatchObject({ minConfirmations: "100", requestedVia: "--confirmation-daa-delta (legacy alias, blue-score semantics)" });
  });

  it("TCF-7 --min-confirmations and a different legacy --confirmation-daa-delta: refused before any connection (exit 4)", async () => {
    const F = await fakeFor("tcf7");
    const ws = workspace("tcf7", F.url);
    const r = await qualify("TCF-7", ws, F.url, ["--min-confirmations", "100", "--confirmation-daa-delta", "10"]);
    trace("TCF-7", { exit: r.exit, out: r.brief });
    expect(r.exit, r.brief).toBe(4);
    expect(r.stderr).toMatch(/MIN_CONFIRMATIONS_CONFLICT/);
    expect(r.dialled).toEqual([]);
    expect(F.methods).toEqual([]);
  });
});

describe("TN10-CONFIRMATION-FIX-1 · tx status --since <chainBlockHash> for a tx sent outside this workspace", () => {
  const EXTERNAL_TX = sha("tcf-external-tx");
  let S: ChainFake;
  beforeAll(async () => {
    // 60 000 chain blocks after the pruning point; the tx accepted by block 50 000 (10 000 blue-score deep)
    S = await fakeFor("static", { staticChain: { tip: 60_000, accept: 50_000, txid: EXTERNAL_TX } });
  });
  const status = (name: string, ws: string, args: string[]) => run(name, [cliDist, "tx", "status", ...args, "--json"], ws);

  it("TCF-S0 (control, unchanged) without a cursor and without a submission here: the scan starts at the pruning point and stops at its batch bound → INSUFFICIENT_EVIDENCE", async () => {
    const ws = workspace("s0", S.url);
    const r = await status("TCF-S0", ws, [EXTERNAL_TX]);
    trace("TCF-S0", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.json?.state, r.brief).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("TCF-S1 --since a chain block before the acceptance: CONFIRMED with the accepting block and its blue-score depth; no submission receipt is created", async () => {
    const ws = workspace("s1", S.url);
    const r = await status("TCF-S1", ws, [EXTERNAL_TX, "--since", S.hashOf(49_900)]);
    trace("TCF-S1", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.json?.state, r.brief).toBe("CONFIRMED");
    expect(r.json.derived.acceptingBlockHash).toBe(S.hashOf(50_000));
    expect(r.json.confirmations).toMatchObject({ blue: "10000", unit: "blue-score" });
    expect(r.json.derived.evidence.submissionArtifactId).toBeUndefined();
    expect(r.json.look.taken).toBe(true);
    expect(observationsOf(ws)).toHaveLength(1);
    const artifacts = fs.readdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true }).map(String);
    expect(artifacts.filter((f) => /submission|receipt/i.test(f) && f.endsWith(".json"))).toEqual([]);
    expect(onlyLoopback(r.dialled, S)).toBe(true);
  });

  it("TCF-S2 --since a block the node does not hold (unknown/pruned): INSUFFICIENT_EVIDENCE with OBSERVE_SINCE_UNAVAILABLE as the cause; nothing recorded", async () => {
    const ws = workspace("s2", S.url);
    const r = await status("TCF-S2", ws, [EXTERNAL_TX, "--since", sha("not-a-block-the-node-holds")]);
    trace("TCF-S2", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.json?.state, r.brief).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.json.look.taken).toBe(false);
    expect(r.json.look.reason).toMatch(/OBSERVE_SINCE_UNAVAILABLE/);
    expect(observationsOf(ws)).toEqual([]);
  });

  it("TCF-S3 --since a block AFTER the acceptance: not found in the scanned window → INSUFFICIENT_EVIDENCE (absence proves nothing; nothing invented)", async () => {
    const ws = workspace("s3", S.url);
    const r = await status("TCF-S3", ws, [EXTERNAL_TX, "--since", S.hashOf(55_000)]);
    trace("TCF-S3", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.json?.state, r.brief).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.json.derived.acceptingBlockHash).toBeUndefined();
  });

  for (const [name, args, why] of [
    ["TCF-S4", () => [EXTERNAL_TX, "--since", "not-a-hash"], /64-hex chain block hash/],
    ["TCF-S5", () => [EXTERNAL_TX, "--since", S.hashOf(49_900), "--no-observe"], /cannot be combined with --no-observe/],
    ["TCF-S6", () => [`synthetic-${"ab".repeat(32)}`, "--since", S.hashOf(49_900)], /applies to a network txId/]
  ] as const) {
    it(`${name} a misused --since is a usage error (exit 2, TX_STATUS_USAGE) before any connection`, async () => {
      const ws = workspace(name.toLowerCase(), S.url);
      const before = S.methods.length;
      const r = await status(name, ws, args());
      trace(name, { exit: r.exit, json: r.json, out: r.brief });
      expect(r.exit, r.brief).toBe(2);
      expect(`${r.stdout}\n${r.stderr}`).toMatch(/TX_STATUS_USAGE/);
      expect(`${r.stdout}\n${r.stderr}`).toMatch(why);
      expect(r.dialled, r.brief).toEqual([]);
      expect(S.methods.length).toBe(before);
    });
  }
});

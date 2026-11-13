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

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// INT9 · C3 · `tx wait` of a tx sent outside this workspace, with no local cursor (no submission, no stored look, no
// --since). Before: the looks scanned the node's virtual chain from its pruning point (on testnet-10, ~1.4M blue score
// before a recent tx: STAGE-B-1) and the UTXO view could not be checked (no plan). Now `--address <an address it pays>`:
//   * the scan starts at the node's sink at the wait's first look (a tx accepted after the wait started is found there);
//   * a look that has not found the acceptance reads the UTXOs at --address: an output of the tx listed there carries
//     its accepting block's DAA score, and one at or before the cursor's ends the wait at once with
//     TX_WAIT_ACCEPTED_BEFORE_CURSOR (claiming nothing; --since is the way for such a tx);
//   * once the target is reached, the UTXO view is checked at --address (outputs only: the inputs are unknown here).
// Without --address nothing changes (the pruning-point scan, STAGE-B-1's control). The fake answers like rusty-kaspa
// 2.1.0 (JSON wRPC; UTXO rows carry the accepting block's DAA score, TN10-CONFIRMATION-RESEARCH-1). Loopback only.
//
// RC1 · D2 · a tx accepted BEFORE the wait started (its output's DAA score at or below the sink cursor's) is no longer
// a dead end: the wait walks back from that cursor along the node's selected chain (getBlock → verboseData
// .selectedParentHash), at most --lookback chain blocks (default 1000, hard maximum 10000, 0 = never), to the first
// chain block whose DAA score is below the output's, and scans the virtual chain from there — the acceptance is then the
// node's own getVirtualChainFromBlock answer, sealed in the observation like any other (never the UTXO row, never the
// mempool). Checked first against a real rusty-kaspad v2.1.0 (R1 probe, evidence 01). Past the bound (or with --since,
// which the wait never moves), TX_WAIT_ACCEPTED_BEFORE_CURSOR as before, now with both DAA scores, the distance and
// what to pass. C3-2 keeps its case: its tx is 1500+ chain blocks behind, beyond the default bound.
// -----------------------------------------------------------------------------

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const DAA0 = 7_000_000;
const BLUE0 = 6_000_000;
let kaspa: any;
let dest = "";

type Fake = {
  url: string;
  port: number;
  methods: string[];
  vcfStarts: string[];
  /** RC1 · D2: the block hashes getBlock was asked for, in order. */
  getBlocks: string[];
  hashOf(i: number): string;
  tip(): number;
  acceptAt?: number;
  close(): Promise<void>;
};

/**
 * A ticking simnet chain (one chain block per tick). `txid` pays `dest` 1 KAS; it is accepted at `acceptAt` — fixed, or
 * (`acceptAfterFirstScan`) that many blocks after the first virtual-chain request, i.e. after the wait started.
 */
async function startFake(
  label: string,
  txid: string,
  opts: {
    acceptAt?: number;
    acceptAfterFirstScan?: number;
    tickMs?: number;
    startTip?: number;
    /** RC1 · D2: getBlock of this chain index fails */
    brokenAt?: number;
    /** RC1 · D2: the UTXO index lists the output, but no virtual-chain answer names the tx (the node's views disagree) */
    chainOmitsTx?: boolean;
    /**
     * TX-WAIT-ADDRESS-SPENT-1: the tx's output at `dest` was spent since. "with-later-output": the index lists there an
     * output of a later transaction (accepted 3 chain blocks after this one); "no-trace": only an older output is listed.
     */
    spent?: "with-later-output" | "no-trace";
  }
): Promise<Fake> {
  const hashOf = (i: number) => sha(`c3-${label}-chain-${i}`);
  const index = new Map<string, number>();
  let tip = 0;
  const grow = (to: number) => {
    for (let i = tip; i <= to; i++) index.set(hashOf(i), i);
    tip = to;
  };
  grow(opts.startTip ?? 2_000);
  const daa = (i: number) => DAA0 + i;
  const blue = (i: number) => BLUE0 + i;
  const fake: Fake = { url: "", port: 0, methods: [], vcfStarts: [], getBlocks: [], hashOf, tip: () => tip, ...(opts.acceptAt !== undefined ? { acceptAt: opts.acceptAt } : {}), close: async () => {} };
  const accepted = () => fake.acceptAt !== undefined && tip >= fake.acceptAt;
  const timer = setInterval(() => grow(tip + 1), opts.tickMs ?? 10);
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  const zero = "0".repeat(64);
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
      fake.methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "simnet", hasUtxoIndex: true, isSynced: true, virtualDaaScore: daa(tip) + 1 });
        case "getInfo":
          return ok({ p2pId: label, mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network: "simnet", blockCount: tip + 1, headerCount: tip + 1, tipHashes: [hashOf(tip)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(tip)], pruningPointHash: hashOf(0), virtualDaaScore: daa(tip) + 1, sink: hashOf(tip) });
        case "getSinkBlueScore":
          return ok({ blueScore: blue(tip) });
        case "getMempoolEntry":
          return err(`Transaction ${params?.transactionId} not found`);
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getUtxosByAddresses": {
          const entries: unknown[] = [];
          for (const address of params?.addresses ?? []) {
            const spk = "0000" + "20" + "11".repeat(32) + "ac";
            if (address === dest && accepted() && opts.spent === "with-later-output") {
              entries.push({ address, outpoint: { transactionId: sha(`c3-${label}-later`), index: 1 }, utxoEntry: { amount: 50_000_000, blockDaaScore: daa(fake.acceptAt! + 3), covenantId: null, isCoinbase: false, scriptPublicKey: spk } });
            } else if (address === dest && accepted() && opts.spent === "no-trace") {
              entries.push({ address, outpoint: { transactionId: sha(`c3-${label}-older`), index: 0 }, utxoEntry: { amount: 50_000_000, blockDaaScore: daa(fake.acceptAt! - 10), covenantId: null, isCoinbase: false, scriptPublicKey: spk } });
            } else if (address === dest && accepted()) {
              entries.push({ address, outpoint: { transactionId: txid, index: 0 }, utxoEntry: { amount: 100_000_000, blockDaaScore: daa(fake.acceptAt!), covenantId: null, isCoinbase: false, scriptPublicKey: spk } });
            }
          }
          return ok({ entries });
        }
        case "getBlock": {
          const i = index.get(params?.hash);
          fake.getBlocks.push(String(params?.hash));
          if (i === undefined) return err(`cannot find header ${params?.hash}`);
          if (opts.brokenAt !== undefined && i === opts.brokenAt) return err(`some data is missing for block ${params?.hash}`);
          return ok({
            block: {
              header: { hash: hashOf(i), version: 1, parentsByLevel: i > 0 ? [[hashOf(i - 1)]] : [], hashMerkleRoot: zero, acceptedIdMerkleRoot: zero, utxoCommitment: zero, timestamp: 1792088193138 + i * 100, bits: 486722099, nonce: 0, daaScore: daa(i), blueWork: (blue(i) * 1000).toString(16), blueScore: blue(i), pruningPoint: hashOf(0) },
              transactions: [],
              verboseData: { hash: hashOf(i), difficulty: 1, selectedParentHash: i > 0 ? hashOf(i - 1) : zero, transactionIds: [], isHeaderOnly: false, blueScore: blue(i), childrenHashes: [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: true }
            }
          });
        }
        case "getVirtualChainFromBlock": {
          const i = index.get(params?.startHash);
          fake.vcfStarts.push(String(params?.startHash));
          if (fake.acceptAt === undefined && opts.acceptAfterFirstScan !== undefined) fake.acceptAt = tip + opts.acceptAfterFirstScan;
          if (i === undefined) return err(`cannot find header ${params?.startHash}`);
          const added: string[] = [];
          const acceptedIds: unknown[] = [];
          for (let j = i + 1; j <= Math.min(i + 1840, tip); j++) {
            added.push(hashOf(j));
            acceptedIds.push({ acceptingBlockHash: hashOf(j), acceptedTransactionIds: j === fake.acceptAt && !opts.chainOmitsTx ? [sha(`cb-${j}`), txid] : [sha(`cb-${j}`)] });
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
      clearInterval(timer);
      for (const c of server.clients) c.terminate();
      server.close(() => r());
    });
  return fake;
}

const made: string[] = [];
const fakes: Fake[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-c3-netlogs-"));
made.push(logs);

function workspace(label: string, url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-c3-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(
    path.join(ws, "hardkas.config.ts"),
    `export default ${JSON.stringify(
      {
        execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
        networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: url } }
      },
      null,
      2
    )};\n`
  );
  return ws;
}

async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const env = hermeticChildEnv(log);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string; ms: number }>((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 170_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, ms: Date.now() - t0 });
    });
  });
  const dialled = fs.existsSync(log) ? [...new Set(fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t").slice(1, 3).join(" ")))] : [];
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { ...r, json, dialled, brief: `exit ${r.status} (${r.ms} ms)\n${r.stdout.slice(-2500)}\n${r.stderr.slice(0, 2000)}` };
}
const observationsOf = (ws: string) => {
  const dir = path.join(ws, ".hardkas", "artifacts", "observations");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
};

beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  dest = new kaspa.PrivateKey("77".repeat(32)).toAddress("simnet").toString();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("INT9 · C3 · tx wait --address for a tx sent outside this workspace (no local cursor)", () => {
  it("C3-1 accepted after the wait started: CONFIRMED from the sink cursor (never a pruning-point scan), the UTXO view checked at --address", async () => {
    const TX = sha("c3-1-external");
    const F = await startFake("c3-1", TX, { acceptAfterFirstScan: 40 });
    fakes.push(F);
    const ws = workspace("c3-1", F.url);
    const r = await run("C3-1", ["tx", "wait", TX, "--address", dest, "--until", "confirmed", "--timeout", "120", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.json, r.brief).toMatchObject({ ok: true, command: "tx wait", outcome: "reached", state: "CONFIRMED" });
    expect(r.json.derived.acceptingBlockHash, r.brief).toBe(F.hashOf(F.acceptAt!));
    expect(Number(r.json.confirmations.blue), r.brief).toBeGreaterThanOrEqual(100);
    expect(r.json.cursor, r.brief).toMatchObject({ origin: "wait-start" });
    expect(BigInt(r.json.cursor.daaScore) < BigInt(DAA0 + F.acceptAt!), r.brief).toBe(true);
    // the first scan started at the cursor, never at the pruning point
    expect(F.vcfStarts[0], r.brief).toBe(r.json.cursor.hash);
    expect(F.vcfStarts, r.brief).not.toContain(F.hashOf(0));
    expect(r.json.utxoView, r.brief).toMatchObject({ checked: true, converged: true, addresses: [dest], inputsUnknown: true });
    expect(r.dialled.every((d) => d === `LOOPBACK_CONNECT 127.0.0.1:${F.port}`), r.dialled.join(", ")).toBe(true);
  });

  it("C3-2 accepted BEFORE the wait started: TX_WAIT_ACCEPTED_BEFORE_CURSOR at once, naming the output and both DAA scores; no state claimed", async () => {
    const TX = sha("c3-2-external");
    const F = await startFake("c3-2", TX, { acceptAt: 500, startTip: 2_000 });
    fakes.push(F);
    const ws = workspace("c3-2", F.url);
    const r = await run("C3-2", ["tx", "wait", TX, "--address", dest, "--timeout", "120", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(1);
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "TX_WAIT_ACCEPTED_BEFORE_CURSOR" });
    expect(String(r.json.message), r.brief).toContain(`${TX}:0`);
    expect(String(r.json.message), r.brief).toContain(`DAA score ${DAA0 + 500}`);
    expect(String(r.json.message), r.brief).toMatch(/--since/);
    expect(r.stdout, r.brief).not.toMatch(/"state"\s*:\s*"(ACCEPTED|CONFIRMED|FINALIZED)"/);
    expect(r.ms, `ended at once, not at the 120 s timeout: ${r.brief}`).toBeLessThan(60_000);
    // RC1 · D2: the diagnosis names the cursor's DAA score, the distance, the bounded walk and how to go further
    const m = /scan starts at ([0-9a-f]{64}) \(DAA score (\d+)/.exec(String(r.json.message));
    expect(m, r.brief).not.toBeNull();
    const cursorDaa = Number(m![2]);
    expect(cursorDaa, r.brief).toBeGreaterThan(DAA0 + 500);
    expect(String(r.json.message), r.brief).toContain(`${cursorDaa - (DAA0 + 500)} DAA behind`);
    expect(String(r.json.message), r.brief).toMatch(/walked back 1000 chain blocks \(--lookback 1000\)/);
    expect(String(r.json.message), r.brief).toMatch(/a larger --lookback \(at most 10000/);
    // bounded: at most 1001 headers read on the walk, never a scan from the pruning point
    expect(F.getBlocks.length, r.brief).toBeLessThanOrEqual(1001 + 5);
    expect(F.vcfStarts, r.brief).not.toContain(F.hashOf(0));
  });

  it("C3-5 (RC1 · D2) accepted before the wait started, within --lookback: CONFIRMED in the node's own accepting block, found by walking back from the sink; the scan starts below the output's DAA score", async () => {
    const TX = sha("c3-5-external");
    const F = await startFake("c3-5", TX, { acceptAt: 1_960, startTip: 2_000, tickMs: 50 });
    fakes.push(F);
    const ws = workspace("c3-5", F.url);
    const r = await run("C3-5", ["tx", "wait", TX, "--address", dest, "--until", "confirmed", "--timeout", "120", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.json, r.brief).toMatchObject({ ok: true, command: "tx wait", outcome: "reached", state: "CONFIRMED" });
    expect(r.json.derived.acceptingBlockHash, r.brief).toBe(F.hashOf(1_960));
    expect(r.json.cursor, r.brief).toMatchObject({ origin: "lookback", hash: F.hashOf(1_959), daaScore: String(DAA0 + 1_959) });
    expect(r.json.cursor.lookback, r.brief).toMatchObject({ limit: 1000, outputDaaScore: String(DAA0 + 1_960), outpoint: `${TX}:0` });
    expect(r.json.cursor.lookback.from, r.brief).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(r.json.cursor.lookback.steps), r.brief).toBeGreaterThan(0);
    expect(Number(r.json.cursor.lookback.steps), r.brief).toBeLessThanOrEqual(1000);
    // the virtual chain was read from the walked-to block (and never from the pruning point)
    expect(F.vcfStarts, r.brief).toContain(F.hashOf(1_959));
    expect(F.vcfStarts, r.brief).not.toContain(F.hashOf(0));
    expect(r.json.utxoView, r.brief).toMatchObject({ checked: true, converged: true, inputsUnknown: true });
    // the acceptance is sealed in an observation of this workspace (the node's chain answer, not the UTXO row)
    expect(observationsOf(ws).length, r.brief).toBeGreaterThan(0);
    expect(r.dialled.every((d) => d === `LOOPBACK_CONNECT 127.0.0.1:${F.port}`), r.dialled.join(", ")).toBe(true);
  });

  it("C3-6 (RC1 · D2) --lookback too small for the distance: TX_WAIT_ACCEPTED_BEFORE_CURSOR, exit 1, after exactly that many chain blocks; no state claimed", async () => {
    const TX = sha("c3-6-external");
    const F = await startFake("c3-6", TX, { acceptAt: 1_900, startTip: 2_000, tickMs: 1_000 });
    fakes.push(F);
    const ws = workspace("c3-6", F.url);
    const r = await run("C3-6", ["tx", "wait", TX, "--address", dest, "--lookback", "10", "--timeout", "120", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(1);
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "TX_WAIT_ACCEPTED_BEFORE_CURSOR" });
    expect(String(r.json.message), r.brief).toMatch(/walked back 10 chain blocks \(--lookback 10\)/);
    expect(String(r.json.message), r.brief).toContain(`DAA score ${DAA0 + 1_900}`);
    expect(r.stdout, r.brief).not.toMatch(/"state"\s*:\s*"(ACCEPTED|CONFIRMED|FINALIZED)"/);
    expect(observationsOf(ws).every((f) => !/chain_accepted/.test(fs.readFileSync(path.join(ws, ".hardkas", "artifacts", "observations", f), "utf8"))), "no acceptance sealed").toBe(true);
    const zero = await run("C3-6b", ["tx", "wait", TX, "--address", dest, "--lookback", "0", "--timeout", "120", "--interval", "0.5", "--json"], workspace("c3-6b", F.url));
    expect(zero.status, zero.brief).toBe(1);
    expect(zero.json, zero.brief).toMatchObject({ ok: false, code: "TX_WAIT_ACCEPTED_BEFORE_CURSOR" });
    expect(String(zero.json.message), zero.brief).toMatch(/does not walk back \(--lookback 0\)/);
    // the remedy the message names works in the SAME workspace: the failed wait stored its looks, and an explicit
    // --lookback starts again from the sink instead of continuing that window forward (it would only time out)
    const again = await run("C3-6c", ["tx", "wait", TX, "--address", dest, "--lookback", "1000", "--until", "accepted", "--timeout", "30", "--interval", "0.5", "--json"], ws);
    expect(again.status, again.brief).toBe(0);
    expect(again.json, again.brief).toMatchObject({ ok: true, outcome: "reached", cursor: { origin: "lookback" } });
    expect(again.json.derived.acceptingBlockHash, again.brief).toBe(F.hashOf(1_900));
  });

  it("C3-7 (RC1 · D2) a walk the node cannot serve stops there: TX_WAIT_ACCEPTED_BEFORE_CURSOR naming the block, nothing claimed", async () => {
    const TX = sha("c3-7-external");
    const F = await startFake("c3-7", TX, { acceptAt: 1_950, startTip: 2_000, tickMs: 1_000, brokenAt: 1_980 });
    fakes.push(F);
    const ws = workspace("c3-7", F.url);
    const r = await run("C3-7", ["tx", "wait", TX, "--address", dest, "--timeout", "120", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(1);
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "TX_WAIT_ACCEPTED_BEFORE_CURSOR" });
    expect(String(r.json.message), r.brief).toMatch(/walking back stopped/i);
    expect(String(r.json.message), r.brief).toContain(F.hashOf(1_980));
    expect(r.stdout, r.brief).not.toMatch(/"state"\s*:\s*"(ACCEPTED|CONFIRMED|FINALIZED)"/);
  });

  it("C3-9 (RC1 · D2) the UTXO index lists the output but the chain from the walked-to block does not name the tx: TX_WAIT_ACCEPTED_BEFORE_CURSOR at once (the views disagree), nothing claimed, never a forward scan to the timeout", async () => {
    const TX = sha("c3-9-external");
    const F = await startFake("c3-9", TX, { acceptAt: 1_970, startTip: 2_000, tickMs: 1_000, chainOmitsTx: true });
    fakes.push(F);
    const ws = workspace("c3-9", F.url);
    const r = await run("C3-9", ["tx", "wait", TX, "--address", dest, "--timeout", "120", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(1);
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "TX_WAIT_ACCEPTED_BEFORE_CURSOR" });
    expect(String(r.json.message), r.brief).toMatch(/disagree/);
    expect(String(r.json.message), r.brief).toContain(F.hashOf(1_969));
    expect(F.vcfStarts, r.brief).toContain(F.hashOf(1_969));
    expect(r.ms, `ended at once, not at the 120 s timeout: ${r.brief}`).toBeLessThan(60_000);
    expect(r.stdout, r.brief).not.toMatch(/"state"\s*:\s*"(ACCEPTED|CONFIRMED|FINALIZED)"/);
  });

  it("C3-10 (TX-WAIT-ADDRESS-SPENT-1) --since, the output at --address spent since by a later payment back to it: CONFIRMED at once, the view proved by the later output (never TX_WAIT_UTXO_VIEW_STALE after the timeout)", async () => {
    const TX = sha("c3-10-external");
    const F = await startFake("c3-10", TX, { acceptAt: 500, startTip: 2_000, tickMs: 1_000, spent: "with-later-output" });
    fakes.push(F);
    const ws = workspace("c3-10", F.url);
    const r = await run("C3-10", ["tx", "wait", TX, "--address", dest, "--since", F.hashOf(400), "--until", "confirmed", "--timeout", "90", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.json, r.brief).toMatchObject({ ok: true, command: "tx wait", outcome: "reached", state: "CONFIRMED" });
    expect(r.json.derived.acceptingBlockHash, r.brief).toBe(F.hashOf(500));
    expect(r.json.utxoView, r.brief).toMatchObject({
      checked: true,
      converged: true,
      inputsUnknown: true,
      outputsNoLongerListed: [dest],
      indexPastAcceptance: { address: dest, outpoint: `${sha("c3-c3-10-later")}:1`, blockDaaScore: String(DAA0 + 503), acceptingDaaScore: String(DAA0 + 500) }
    });
    expect(r.ms, `ended at once, not at the 90 s timeout: ${r.brief}`).toBeLessThan(45_000);
    const human = await run("C3-10h", ["tx", "wait", TX, "--address", dest, "--since", F.hashOf(400), "--until", "confirmed", "--timeout", "90", "--interval", "0.5"], workspace("c3-10h", F.url));
    expect(human.status, human.brief).toBe(0);
    expect(human.stdout, human.brief).toMatch(/spent since/);
  });

  it("C3-11 (TX-WAIT-ADDRESS-SPENT-1) the output spent to elsewhere and only an OLDER output at --address: nothing proves the view, TX_WAIT_UTXO_VIEW_STALE names both causes and the accepting DAA score", async () => {
    const TX = sha("c3-11-external");
    const F = await startFake("c3-11", TX, { acceptAt: 500, startTip: 2_000, tickMs: 1_000, spent: "no-trace" });
    fakes.push(F);
    const ws = workspace("c3-11", F.url);
    const r = await run("C3-11", ["tx", "wait", TX, "--address", dest, "--since", F.hashOf(400), "--until", "confirmed", "--timeout", "8", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(1);
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "TX_WAIT_UTXO_VIEW_STALE" });
    expect(String(r.json.message), r.brief).toMatch(/spent since by a transaction that pays elsewhere/);
    expect(String(r.json.message), r.brief).toContain(`DAA score ${DAA0 + 500}`);
  });

  it("C3-8 (RC1 · D2, usage) --lookback is an integer 0..10000 and applies with --address only: TX_WAIT_USAGE, exit 2, nothing contacted", async () => {
    const F = await startFake("c3-8", sha("c3-8"), {});
    fakes.push(F);
    const ws = workspace("c3-8", F.url);
    const cases = [
      ["--address", dest, "--lookback", "10001"],
      ["--address", dest, "--lookback", "ten"],
      ["--address", dest, "--lookback", "1.5"],
      ["--lookback", "10"]
    ];
    const dialled: string[] = [];
    for (const [n, extra] of cases.entries()) {
      const r = await run(`C3-8-${n}`, ["tx", "wait", sha("c3-8"), ...extra, "--json"], ws);
      expect(r.status, r.brief).toBe(2);
      expect(r.json, r.brief).toMatchObject({ ok: false, code: "TX_WAIT_USAGE" });
      dialled.push(...r.dialled);
    }
    expect(dialled, "no connection").toEqual([]);
  });

  it("C3-3 (usage) --address that is not a Kaspa address, or on a simulator txId: TX_WAIT_USAGE, exit 2, nothing contacted", async () => {
    const F = await startFake("c3-3", sha("c3-3"), {});
    fakes.push(F);
    const ws = workspace("c3-3", F.url);
    const bad = await run("C3-3a", ["tx", "wait", sha("c3-3"), "--address", "not-an-address", "--json"], ws);
    expect(bad.status, bad.brief).toBe(2);
    expect(bad.json, bad.brief).toMatchObject({ ok: false, code: "TX_WAIT_USAGE" });
    const synthetic = await run("C3-3b", ["tx", "wait", `synthetic-${sha("c3-3")}`, "--address", dest, "--json"], ws);
    expect(synthetic.status, synthetic.brief).toBe(2);
    expect(synthetic.json, synthetic.brief).toMatchObject({ ok: false, code: "TX_WAIT_USAGE" });
    expect([...bad.dialled, ...synthetic.dialled], "no connection").toEqual([]);
  });

  it("C3-4 (control) with a stored look the wait keeps its cursor: --address chooses nothing, and the scan continues where the stored look stopped", async () => {
    const TX = sha("c3-4-external");
    const F = await startFake("c3-4", TX, { acceptAfterFirstScan: 30 });
    fakes.push(F);
    const ws = workspace("c3-4", F.url);
    const since = F.hashOf(F.tip() - 5);
    const first = await run("C3-4a", ["tx", "status", TX, "--since", since, "--json"], ws);
    expect(first.status, first.brief).toBe(0);
    expect(observationsOf(ws).length, first.brief).toBe(1);
    const scansBefore = F.vcfStarts.length;
    const r = await run("C3-4b", ["tx", "wait", TX, "--address", dest, "--until", "accepted", "--timeout", "120", "--interval", "0.5", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.state, r.brief).toMatch(/ACCEPTED|CONFIRMED/);
    expect(r.json?.cursor, r.brief).toBeUndefined();
    expect(F.vcfStarts[scansBefore], r.brief).not.toBe(F.hashOf(0));
  });
});

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
// STAGE-B-1 (C3, C4) BEFORE, loopback fakes only. Found by HARDKAS-TN10-DEMO-COVERAGE-1 on the real TN10 payment
// (sent by TQ-1, so this workspace holds observations of it but no HardKAS submission):
//   * C3: `hardkas tx wait` has no `--since`; for a tx sent outside this workspace with no stored look it scans from the
//     pruning point in bounded batches and times out without saying why;
//   * C4: `tx receipt`, `why --tx` and `explain --tx` only read a submission, so they find nothing although the workspace
//     holds observations that derive a state.
// Controls: a stored look is the cursor (C3); no observation → nothing invented (C4); a tx sent from this workspace
// (plan → sign → send) already works end to end. The fake is TN10-CONFIRMATION-FIX-1's. Traces in
// $HARDKAS_SB_TRACE_DIR.
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

// -----------------------------------------------------------------------------
// STAGE-B-1 (C3, C4) helpers: commands that read the workspace's record of a txId.
// -----------------------------------------------------------------------------
const both = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;
const codeOf = (r: { json: any; stdout: string; stderr: string }) =>
  r.json?.error?.code ?? r.json?.code ?? /\[([A-Z][A-Z0-9_]+)\]/.exec(both(r))?.[1] ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(r.stderr)?.[1];
const submissionsOf = (ws: string) =>
  fs
    .readdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true })
    .map(String)
    .filter((f) => /submission|receipt/i.test(f) && f.endsWith(".json"));
const vcfCalls = (f: ChainFake, from: number) => f.methods.slice(from).filter((m) => m === "getVirtualChainFromBlock").length;

describe("STAGE-B-1 · C3 · tx wait for a tx sent outside this workspace", () => {
  const EXTERNAL_TX = sha("sb-c3-external-tx");
  const LONG_TX = sha("sb-c3-long-tx");
  let S: ChainFake;
  let L: ChainFake;
  beforeAll(async () => {
    // the TCF static shape: 60 000 chain blocks after the pruning point, the tx accepted by block 50 000
    S = await fakeFor("c3", { staticChain: { tip: 60_000, accept: 50_000, txid: EXTERNAL_TX } });
    // a long history (≈ a public node's pruning window in chain blocks, scaled down): 400 000 chain blocks, accepted near the tip
    L = await fakeFor("c3long", { staticChain: { tip: 400_000, accept: 390_000, txid: LONG_TX } });
  });
  const wait = (name: string, ws: string, args: string[]) => run(name, [cliDist, "tx", "wait", ...args, "--json"], ws);

  it("SB-C3-1 tx wait --since a chain block before the acceptance: CONFIRMED in one look, no receipt invented, loopback only", async () => {
    const ws = workspace("c3-1", S.url);
    const r = await wait("SB-C3-1", ws, [EXTERNAL_TX, "--since", S.hashOf(49_900), "--until", "confirmed", "--timeout", "60"]);
    trace("SB-C3-1", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.json?.state, r.brief).toBe("CONFIRMED");
    expect(r.json.derived.acceptingBlockHash).toBe(S.hashOf(50_000));
    expect(r.json.looks).toBe(1);
    expect(r.json.utxoView?.checked).toBe(false);
    expect(submissionsOf(ws)).toEqual([]);
    expect(onlyLoopback(r.dialled, S)).toBe(true);
  });

  for (const [name, args, why] of [
    ["SB-C3-2a", () => [EXTERNAL_TX, "--since", "not-a-hash"], /64-hex chain block hash/],
    ["SB-C3-2b", () => [`synthetic-${"ab".repeat(32)}`, "--since", S.hashOf(49_900)], /applies to a network txId/]
  ] as const) {
    it(`${name} a misused tx wait --since is a usage error (exit 2, TX_WAIT_USAGE) before any connection`, async () => {
      const ws = workspace(name.toLowerCase(), S.url);
      const before = S.methods.length;
      const r = await wait(name, ws, args());
      trace(name, { exit: r.exit, json: r.json, out: r.brief });
      expect(r.exit, r.brief).toBe(2);
      expect(both(r)).toMatch(/TX_WAIT_USAGE/);
      expect(both(r)).toMatch(why);
      expect(r.dialled, r.brief).toEqual([]);
      expect(S.methods.length).toBe(before);
    });
  }

  it("SB-C3-3 no cursor and no submission here, long history: the wait times out naming the missing cursor and `--since` (measured: chain reads per look)", async () => {
    const ws = workspace("c3-3", L.url);
    const before = L.methods.length;
    const t0 = Date.now();
    const r = await wait("SB-C3-3", ws, [LONG_TX, "--until", "confirmed", "--timeout", "8", "--interval", "1"]);
    const ms = Date.now() - t0;
    trace("SB-C3-3", { exit: r.exit, ms, chainReads: vcfCalls(L, before), observations: observationsOf(ws).length, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(1);
    expect(codeOf(r), r.brief).toBe("TX_WAIT_TIMEOUT");
    // what the user needs to know: nothing here says where the tx is, so the scan started at the pruning point
    expect(both(r), r.brief).toMatch(/--since/);
    expect(both(r), r.brief).toMatch(/no submission .*(recorded|in this workspace)/i);
    expect(onlyLoopback(r.dialled, L)).toBe(true);
  });

  it("SB-C3-4 (control) after `tx status --since`, tx wait needs no flag: the stored look is the cursor → CONFIRMED", async () => {
    const ws = workspace("c3-4", S.url);
    const s = await run("SB-C3-4-status", [cliDist, "tx", "status", EXTERNAL_TX, "--since", S.hashOf(49_900), "--json"], ws);
    expect(s.json?.state, s.brief).toBe("CONFIRMED");
    const r = await wait("SB-C3-4", ws, [EXTERNAL_TX, "--until", "confirmed", "--timeout", "60"]);
    trace("SB-C3-4", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.json?.state, r.brief).toBe("CONFIRMED");
    expect(submissionsOf(ws)).toEqual([]);
  });
});

describe("STAGE-B-1 · C4 · receipt / why / explain of a tx sent outside this workspace", () => {
  const EXTERNAL_TX = sha("sb-c4-external-tx");
  let S: ChainFake;
  let observed = "";
  let empty = "";
  beforeAll(async () => {
    S = await fakeFor("c4", { staticChain: { tip: 60_000, accept: 50_000, txid: EXTERNAL_TX } });
    observed = workspace("c4-observed", S.url);
    const s = await run("SB-C4-setup-status", [cliDist, "tx", "status", EXTERNAL_TX, "--since", S.hashOf(49_900), "--json"], observed);
    expect(s.json?.state, s.brief).toBe("CONFIRMED");
    empty = workspace("c4-empty", S.url);
  });

  it("SB-C4-1 tx receipt: still no receipt (none is invented), but the refusal says the tx WAS observed here, its derived state, and where to look", async () => {
    const r = await run("SB-C4-1", [cliDist, "tx", "receipt", EXTERNAL_TX, "--json"], observed);
    trace("SB-C4-1", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).not.toBe(0);
    expect(codeOf(r), r.brief).toBe("RECEIPT_NOT_FOUND");
    expect(both(r), r.brief).toMatch(/no submission .*(recorded|in this workspace)/i);
    expect(both(r), r.brief).toMatch(/CONFIRMED/);
    expect(both(r), r.brief).toMatch(/hardkas tx status|hardkas query tx/);
    expect(submissionsOf(observed)).toEqual([]);
  });

  it("SB-C4-2 why --tx: answers from the observations (derived state + the looks it stands on), says there is no submission here", async () => {
    const r = await run("SB-C4-2", [cliDist, "why", "--tx", EXTERNAL_TX, "--json"], observed);
    trace("SB-C4-2", { exit: r.exit, json: r.json, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.stdout, r.brief).toMatch(/CONFIRMED/);
    const look = JSON.parse(fs.readFileSync(path.join(observed, ".hardkas", "artifacts", "observations", observationsOf(observed)[0]!), "utf8"));
    expect(r.stdout, r.brief).toContain(look.contentHash);
    expect(both(r), r.brief).toMatch(/no submission .*(recorded|in this workspace)/i);
  });

  it("SB-C4-3 explain --tx: explains the derived state from the observations, says there is no submission here", async () => {
    const r = await run("SB-C4-3", [cliDist, "explain", "--tx", EXTERNAL_TX], observed);
    trace("SB-C4-3", { exit: r.exit, out: r.brief });
    expect(r.exit, r.brief).toBe(0);
    expect(r.stdout, r.brief).toMatch(/CONFIRMED/);
    expect(both(r), r.brief).toMatch(/no submission .*(recorded|in this workspace)/i);
  });

  it("SB-C4-4 (control) a txId with neither a submission nor an observation here: all three refuse, nothing invented, no connection", async () => {
    const before = S.methods.length;
    const a = await run("SB-C4-4a", [cliDist, "tx", "receipt", EXTERNAL_TX, "--json"], empty);
    const b = await run("SB-C4-4b", [cliDist, "why", "--tx", EXTERNAL_TX, "--json"], empty);
    const c = await run("SB-C4-4c", [cliDist, "explain", "--tx", EXTERNAL_TX], empty);
    trace("SB-C4-4", { a: a.brief, b: b.brief, c: c.brief });
    for (const r of [a, b, c]) expect(r.exit, r.brief).not.toBe(0);
    expect(codeOf(a), a.brief).toBe("RECEIPT_NOT_FOUND");
    expect(submissionsOf(empty)).toEqual([]);
    expect(S.methods.length).toBe(before);
  });
});

describe("STAGE-B-1 · control · a tx sent from this workspace (tx plan → sign → send): receipt / why / explain / wait already work", () => {
  it("SB-CTL-1 the demo's own path on a testnet-10 node: one submitTransaction; tx wait CONFIRMED with the UTXO view checked; tx receipt, why --tx and explain --tx answer", async () => {
    const F = await fakeFor("ctl", { acceptAfter: 3 });
    const ws = workspace("ctl", F.url);
    const plan = await run("SB-CTL-1-plan", [cliDist, "tx", "plan", "--from", "funder", "--to", dest, "--amount", "1", "--network", "testnet-10", "--out", "plan.json", "--json"], ws);
    expect(plan.exit, plan.brief).toBe(0);
    const sign = await run("SB-CTL-1-sign", [cliDist, "tx", "sign", "plan.json", "--account", "funder", "--password-env", PW_VAR, "--out", "signed.json", "--json"], ws);
    expect(sign.exit, sign.brief).toBe(0);
    const send = await run("SB-CTL-1-send", [cliDist, "tx", "send", "signed.json", "--yes", "--json"], ws);
    expect(send.exit, send.brief).toBe(0);
    expect(F.submits).toBe(1);
    const txId = F.txid!;
    const w = await run("SB-CTL-1-wait", [cliDist, "tx", "wait", txId, "--until", "confirmed", "--timeout", "120", "--json"], ws);
    const receipt = await run("SB-CTL-1-receipt", [cliDist, "tx", "receipt", txId, "--json"], ws);
    const why = await run("SB-CTL-1-why", [cliDist, "why", "--tx", txId, "--json"], ws);
    const explain = await run("SB-CTL-1-explain", [cliDist, "explain", "--tx", txId], ws);
    trace("SB-CTL-1", { txId, wait: w.brief, receipt: receipt.brief, why: why.brief, explain: explain.brief, submits: F.submits });
    expect(w.exit, w.brief).toBe(0);
    expect(w.json?.state).toBe("CONFIRMED");
    expect(w.json?.utxoView).toMatchObject({ checked: true, converged: true });
    for (const r of [receipt, why, explain]) expect(r.exit, r.brief).toBe(0);
    expect(receipt.stdout).toContain(txId);
    expect(F.submits).toBe(1);
    for (const r of [plan, sign, send, w, receipt, why, explain]) {
      expect(onlyLoopback(r.dialled, F), `${r.name} ${JSON.stringify(r.dialled)}`).toBe(true);
      expect(both(r).includes(PW)).toBe(false);
    }
  });
});

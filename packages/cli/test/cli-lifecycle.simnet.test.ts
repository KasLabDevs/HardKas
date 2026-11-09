// L1-CORE-1 · B1 · the built CLI against a real rusty-kaspad v2.1.0 (simnet level).
//
// Every command is the built CLI (packages/cli/dist/index.js) in its own process, never a runner imported here. Each
// process runs under the hermetic preload with its own connection log: loopback is allowed and logged, anything else
// is refused, and the canonical node ports are refused too, so a command that fell back to a default endpoint instead
// of the workspace's node is caught by its own log. The node is the harness's (own container per run id, free port,
// labels, teardown by label); a background miner advances the chain while `tx wait` observes it.
//
// Level variables (simnet only): HARDKAS_HOME with the pinned kaspa-wasm; optionally HARDKAS_TEST_SIMNET_DATA_ROOT and
// HARDKAS_TEST_SIMNET_LABELS for the harness; HARDKAS_TEST_CLI_LIFECYCLE_TRACE names a file for the command trace;
// HARDKAS_TEST_SIMNET_RPC_PORT pins the node's host port (the counting relay listens on the next one), for a machine
// where each session keeps to its own port range.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createScenarioResultArtifact } from "@hardkas/artifacts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { mineBlocks, fundTestAccount, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "@hardkas/testing";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv } from "./hermetic-child.js";
import { startCountingWsProxy, type CountingWsProxy } from "./helpers/counting-ws-proxy.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

const PW_ENV = "HK_CLI_LIFECYCLE_PW";
const PASSWORD = `cli-lifecycle-${crypto.randomBytes(12).toString("hex")}`;
// the canonical node ports (gRPC and JSON wRPC of every network): a command reaching one of them used a default endpoint
const DENIED_PORTS = "16110,16210,17110,17210,18110,18210,18211";

interface Run {
  label: string;
  args: string[];
  code: number | null;
  stdout: string;
  stderr: string;
  docs: any[];
  json: any;
  log: string;
}

let session: IsolatedSimnetSession;
// INT9: every workspace command reaches the node through this loopback relay, which counts the JSON wRPC requests it
// passes on — so "not sent again" is counted at the wire (submitTransaction), never inferred from the files
let relay: CountingWsProxy;
const submits = () => relay.count("submitTransaction");
let parent = "";
let ws = "";
let logDir = "";
const trace: Array<Record<string, unknown>> = [];
const runs: Run[] = [];
const accounts: Record<string, string> = {};

const jsonDocs = (s: string) =>
  s
    .split(/\r?\n(?=\{)/)
    .map((chunk) => {
      try {
        return JSON.parse(chunk);
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);

async function hk(label: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<Run> {
  const log = path.join(logDir, `${String(runs.length).padStart(3, "0")}-${label.replace(/[^\w.-]+/g, "_")}.log`);
  fs.writeFileSync(log, "");
  const env = hermeticChildEnv(log, { [PW_ENV]: PASSWORD, HARDKAS_HERMETIC_DENY_PORTS: DENIED_PORTS, ...(opts.env ?? {}) });
  const r = await new Promise<Run>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: opts.cwd ?? ws, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      const docs = jsonDocs(stdout.trim());
      resolve({ label, args, code, stdout, stderr, docs, json: docs[0], log });
    });
  });
  runs.push(r);
  trace.push({ label, args, code: r.code, json: r.docs.length ? r.docs : undefined, stdout: r.docs.length ? undefined : r.stdout.slice(0, 2000), stderr: r.stderr.slice(0, 2000) });
  return r;
}

const brief = (r: Run) => `${r.label}: exit ${r.code}\n${r.stdout.slice(0, 3000)}\n${r.stderr.slice(0, 1500)}`;

/** The first value under `key` anywhere in a JSON document (depth-first). */
function find(obj: unknown, key: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in (obj as any) && (obj as any)[key] !== undefined && (obj as any)[key] !== null) return (obj as any)[key];
  for (const v of Object.values(obj as any)) {
    const hit = find(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ws, p), "utf8"));

/** The workspace artifact file whose name carries `id` (the store names files `<kind>-<artifactId>.json`). */
function artifactFile(id: string): string | undefined {
  const walk = (dir: string): string | undefined => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        const hit = walk(p);
        if (hit) return hit;
      } else if (e.name.includes(id) && e.name.endsWith(".json")) return p;
    }
    return undefined;
  };
  const root = path.join(ws, ".hardkas", "artifacts");
  return fs.existsSync(root) ? walk(root) : undefined;
}

/** plan (`--out`) → sign (`--out`) → send: the paths and the txId. */
async function planSignSend(tag: string, from: string, to: string, amount: string, opts: { send?: boolean } = {}) {
  const planFile = `plan-${tag}.json`;
  const signedFile = `signed-${tag}.json`;
  const plan = await hk(`plan-${tag}`, ["tx", "plan", "--from", from, "--to", to, "--amount", amount, "--out", planFile, "--json"]);
  expect(plan.code, brief(plan)).toBe(0);
  const sign = await hk(`sign-${tag}`, ["tx", "sign", planFile, "--account", from, "--out", signedFile, "--password-env", PW_ENV, "--json"]);
  expect(sign.code, brief(sign)).toBe(0);
  if (opts.send === false) return { planFile, signedFile, plan, sign };
  const send = await hk(`send-${tag}`, ["tx", "send", signedFile, "--yes", "--json"]);
  expect(send.code, brief(send)).toBe(0);
  const txId = find(send.json, "txId") ?? find(send.json, "transactionId");
  expect(typeof txId, brief(send)).toBe("string");
  return { planFile, signedFile, plan, sign, send, txId: String(txId) };
}

/** Mines a block every `intervalMs` until the returned stop() is awaited. */
function backgroundMiner(intervalMs = 400): () => Promise<void> {
  let on = true;
  const loop = (async () => {
    while (on) {
      try {
        await mineBlocks(session, 1);
      } catch {
        /* a failed template round is retried */
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  })();
  return async () => {
    on = false;
    await loop;
  };
}

async function withMiner<T>(fn: () => Promise<T>): Promise<T> {
  const stop = backgroundMiner();
  try {
    return await fn();
  } finally {
    await stop();
  }
}

function writeConfig(dir = ws) {
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: relay.url } }
  };
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
}

/** The workspace's files of one kind (the store names them `<kind>-<artifactId>.json`). */
function storeFiles(dir: string, re: RegExp): string[] {
  const root = path.join(dir, ".hardkas", "artifacts");
  return fs.existsSync(root) ? fs.readdirSync(root, { recursive: true }).map(String).filter((f) => re.test(f) && f.endsWith(".json")).map((f) => path.join(root, f)) : [];
}
const submissionFiles = (dir = ws) => storeFiles(dir, /txSubmission-/);
const observationFiles = (dir = ws) => storeFiles(dir, /observations[\\/]/);

async function untilTrue(what: string, check: () => boolean | Promise<boolean>, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

beforeAll(async () => {
  const pinned = Number(process.env.HARDKAS_TEST_SIMNET_RPC_PORT ?? "");
  session = await startIsolatedSimnet({ persistData: true, ...(Number.isInteger(pinned) && pinned > 0 ? { rpcPort: pinned } : {}) });
  relay = await startCountingWsProxy(session.rpcUrl, Number.isInteger(pinned) && pinned > 0 ? pinned + 1 : 0);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cli-lifecycle-"));
  logDir = path.join(parent, "connection-logs");
  fs.mkdirSync(logDir, { recursive: true });
});

afterAll(async () => {
  const traceFile = process.env.HARDKAS_TEST_CLI_LIFECYCLE_TRACE || path.join(parent || os.tmpdir(), "cli-lifecycle-trace.json");
  try {
    fs.writeFileSync(
      traceFile,
      JSON.stringify({ rpcUrl: session?.rpcUrl, relay: relay ? { url: relay.url, upstream: relay.upstream, connections: relay.connections(), submitTransaction: submits() } : undefined, workspace: ws, trace }, null, 2)
    );
  } catch {
    /* the trace is a diagnostic */
  }
  if (relay) await relay.close();
  if (session) await stopIsolatedSimnet(session);
});

describe("CLI-LIFECYCLE-1 · the built CLI against a real rusty-kaspad (simnet)", () => {
  it("init + config point the workspace at the harness node; 3 encrypted accounts; funding; balance", async () => {
    const init = await hk("init", ["init", "app", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent });
    expect(init.code, brief(init)).toBe(0);
    ws = path.join(parent, "app");
    writeConfig();
    const networks = await hk("config-networks", ["config", "networks", "--json"]);
    expect(networks.code, brief(networks)).toBe(0);
    for (const name of ["a1", "a2", "a3"]) {
      const g = await hk(`generate-${name}`, ["accounts", "real", "generate", "--name", name, "--network", "simnet", "--password-env", PW_ENV, "--json"]);
      expect(g.code, brief(g)).toBe(0);
    }
    const list = await hk("accounts-list", ["accounts", "list", "--json"]);
    expect(list.code, brief(list)).toBe(0);
    const text = list.stdout;
    for (const name of ["a1", "a2", "a3"]) {
      const m = new RegExp(`"name"\\s*:\\s*"${name}"[\\s\\S]*?"address"\\s*:\\s*"(kaspasim:[a-z0-9]+)"`).exec(text);
      expect(m, `address of ${name}\n${text.slice(0, 3000)}`).not.toBeNull();
      accounts[name] = m![1]!;
    }
    await fundTestAccount(session, accounts.a1!, 1_000_000_000n);
    // the CLI plans only coinbases past maturity + 10 DAA (tx-plan-runner): the harness stops at maturity itself
    await mineBlocks(session, 20);
    const balance = await hk("balance-a1", ["accounts", "balance", "a1", "--json"]);
    expect(balance.code, brief(balance)).toBe(0);
    expect(BigInt(find(balance.json, "balanceSompi"))).toBeGreaterThan(0n);
  });

  const pay: Record<string, any> = {};
  it("payment: plan → sign → send → wait (CONFIRMED) → status → receipt", async () => {
    const before = submits();
    const p = await planSignSend("1", "a1", accounts.a2!, "1");
    Object.assign(pay, p);
    expect(p.send!.json?.outcome, brief(p.send!)).toBe("submitted");
    // INT9: the positive control of the relay — one send, one submitTransaction at the wire; nothing of it was on the node
    expect(submits() - before, "one submitTransaction for one send").toBe(1);
    expect(p.send!.json?.nodeCheck?.state, brief(p.send!)).toBe("NOT_OBSERVED");
    const wait = await withMiner(() => hk("wait-1", ["tx", "wait", p.txId, "--timeout", "180", "--json"]));
    expect(wait.code, brief(wait)).toBe(0);
    expect({ state: wait.json?.state, outcome: wait.json?.outcome }, brief(wait)).toEqual({ state: "CONFIRMED", outcome: "reached" });
    const status = await hk("status-1", ["tx", "status", p.txId, "--json"]);
    expect(status.code, brief(status)).toBe(0);
    expect(status.json?.state, brief(status)).toBe("CONFIRMED");
    const receipt = await hk("receipt-1", ["tx", "receipt", p.txId, "--json"]);
    expect(receipt.code, brief(receipt)).toBe(0);
    expect(find(receipt.json, "txId"), brief(receipt)).toBe(p.txId);
    pay.receipt = receipt.json?.result ?? receipt.json;
    pay.acceptingBlockHash = wait.json?.derived?.acceptingBlockHash;
    // INT9 · oracle (value): the node lists the payment's output at a2 with exactly the amount planned
    const atA2 = (await session.rpc.getUtxosByAddress(accounts.a2!)).filter((u: any) => u.outpoint.transactionId === p.txId);
    expect(atA2.map((u: any) => [u.outpoint.index, String(u.amountSompi)]), atA2.map((u: any) => `${u.outpoint.transactionId}:${u.outpoint.index}=${u.amountSompi}`).join(", ")).toEqual([[0, "100000000"]]);
  });

  it("verify, evidence pack + verify, why, explain: one contentHash per artifact, the same on every path", async () => {
    const verifyFile = async (tag: string, file: string) => {
      const v = await hk(`verify-${tag}`, ["verify", file, "--json"]);
      expect(v.code, brief(v)).toBe(0);
      const res = v.json?.result ?? {};
      expect(res.actualHash, brief(v)).toBe(res.expectedHash);
      return String(res.actualHash);
    };
    const planHash = await verifyFile("plan", pay.planFile);
    const signedHash = await verifyFile("signed", pay.signedFile);
    // the signed transaction names its plan, the receipt names both
    expect(String(readJson(pay.signedFile).sourcePlanId)).toBe(`plan-${planHash.slice(0, 16)}`);
    expect(find(pay.receipt, "signedArtifactId")).toBe(signedHash);
    expect(find(pay.receipt, "planArtifactId")).toBe(planHash);

    const why = await hk("why-1", ["why", "--tx", pay.txId, "--json"]);
    expect(why.code, brief(why)).toBe(0);
    const receiptPath = String(why.json?.resolvedPath);
    const receiptHash = await verifyFile("receipt", receiptPath);
    expect(why.json?.target, brief(why)).toBe(receiptHash);
    const lineage = why.json?.chain?.[0]?.lineage ?? {};
    expect({ parent: lineage.parentArtifactId, root: lineage.rootArtifactId }).toEqual({ parent: signedHash, root: planHash });
    // WHY-SUBMISSION-ROLE-1 (B2 · H4): the submission is named for what it is
    expect(why.json?.chain?.[0]?.role, brief(why)).not.toBe("Unknown");

    const scenarioFile = path.join(ws, "payment.scenario.json");
    fs.writeFileSync(
      scenarioFile,
      JSON.stringify(
        createScenarioResultArtifact({
          scenarioName: "cli-lifecycle-payment",
          status: "passed",
          networkId: "simnet",
          mode: "rpc",
          artifactsGenerated: [planHash, signedHash, receiptHash],
          evidenceClaim: { kind: "payment", payments: [{ txId: pay.txId, submissionArtifactId: receiptHash }] }
        })
      )
    );
    const packed = await hk("evidence-pack", ["evidence", "pack", "payment.scenario.json", "--out", "payment.hke.json", "--json"]);
    expect(packed.code, brief(packed)).toBe(0);
    const pkg = readJson("payment.hke.json");
    const packedIds = JSON.stringify(pkg.artifacts ?? []);
    for (const h of [planHash, signedHash, receiptHash]) expect(packedIds, `package names ${h}`).toContain(h);
    const verified = await hk("evidence-verify", ["evidence", "verify", "payment.hke.json", "--json"]);
    expect(verified.code, brief(verified)).toBe(0);
    expect(verified.stdout, brief(verified)).toMatch(/EVIDENCE_VERIFIED/);

    const explain = await hk("explain-1", ["explain", "--tx", pay.txId]);
    expect(explain.code, brief(explain)).toBe(0);
    expect(explain.stdout).toContain(pay.txId);
    expect(explain.stdout).toContain(receiptHash);
    expect(explain.stdout).toMatch(/Integrity\s+verified/);
  });

  it("double spend: A and B spend the same UTXO; A CONFIRMED, B rejected with the node's own words", async () => {
    // a3 gets exactly one UTXO, so both plans must spend it
    const fund = await planSignSend("fund-a3", "a1", accounts.a3!, "5");
    const funded = await withMiner(() => hk("wait-fund-a3", ["tx", "wait", fund.txId, "--timeout", "180", "--json"]));
    expect(funded.json?.state, brief(funded)).toBe("CONFIRMED");
    const a = await planSignSend("ds-a", "a3", accounts.a2!, "1", { send: false });
    const b = await planSignSend("ds-b", "a3", accounts.a1!, "1", { send: false });
    const inputsOf = (f: string) => JSON.stringify(readJson(f).inputs.map((i: any) => i.outpoint));
    expect(inputsOf(a.planFile)).toBe(inputsOf(b.planFile));
    const sendA = await hk("send-ds-a", ["tx", "send", a.signedFile, "--yes", "--json"]);
    expect(sendA.code, brief(sendA)).toBe(0);
    const txA = String(find(sendA.json, "txId"));
    // B while A is in the mempool: only the node can refuse it
    const sendB = await hk("send-ds-b", ["tx", "send", b.signedFile, "--yes", "--json"]);
    expect(sendB.code, brief(sendB)).not.toBe(0);
    expect(sendB.stdout + sendB.stderr, brief(sendB)).toMatch(/rejected/i);
    expect(sendB.stdout + sendB.stderr, brief(sendB)).toMatch(/double spend|already spent|in the mempool|is already/i);
    const waitA = await withMiner(() => hk("wait-ds-a", ["tx", "wait", txA, "--timeout", "180", "--json"]));
    expect(waitA.json?.state, brief(waitA)).toBe("CONFIRMED");
    pay.doubleSpend = { a, b, txA };
  });

  it("tx batch of 3 chained payments: 3/3, no UTXO spent twice", async () => {
    fs.writeFileSync(
      path.join(ws, "batch.json"),
      JSON.stringify({ payments: [{ from: "a1", to: accounts.a2, amount: "1" }, { from: "a1", to: accounts.a3, amount: "1" }, { from: "a1", to: accounts.a2, amount: "1" }] })
    );
    const batch = await withMiner(() => hk("batch-3", ["tx", "batch", "--file", "batch.json", "--network", "simnet", "--password-env", PW_ENV, "--json"]));
    expect(batch.code, brief(batch)).toBe(0);
    const results: any[] = find(batch.json, "results") ?? [];
    expect(results.length, brief(batch)).toBe(3);
    const txIds = results.map((r) => String(find(r, "txId")));
    expect(new Set(txIds).size, brief(batch)).toBe(3);
    const spent: string[] = [];
    for (const txId of txIds) {
      const w = await withMiner(() => hk(`wait-batch-${txId.slice(0, 8)}`, ["tx", "wait", txId, "--timeout", "180", "--json"]));
      expect(w.json?.state, brief(w)).toBe("CONFIRMED");
      const r = await hk(`receipt-batch-${txId.slice(0, 8)}`, ["tx", "receipt", txId, "--json"]);
      const signedFile = artifactFile(String(find(r.json, "signedArtifactId")));
      expect(signedFile, brief(r)).toBeDefined();
      const signed = readJson(signedFile!);
      for (const i of JSON.parse(signed.signedTransaction.payload).inputs) spent.push(JSON.stringify(i.previousOutpoint));
    }
    expect(new Set(spent).size, `outpoints spent: ${spent.join("\n")}`).toBe(spent.length);
  });

  // INT9 (B6 review M-7): this case did not count anything, so "not sent again" was never shown. Now the relay counts the
  // submitTransaction requests and the store's submissions are counted too.
  it("re-sending a confirmed transaction is a typed result, never `rejected` nor RECEIPT_AMBIGUOUS_CONFLICT (B2); no submitTransaction reaches the node", async () => {
    const before = { submits: submits(), records: submissionFiles().length };
    const again = await hk("resend-1", ["tx", "send", pay.signedFile, "--yes", "--json"]);
    const text = again.stdout + again.stderr;
    expect(text, brief(again)).not.toMatch(/RECEIPT_AMBIGUOUS_CONFLICT/);
    expect(again.json?.outcome, brief(again)).toBe("already-submitted");
    expect(again.json, brief(again)).toMatchObject({ code: "ALREADY_SUBMITTED", recorded: true });
    expect(again.code, brief(again)).toBe(0);
    expect({ submits: submits(), records: submissionFiles().length }, "nothing sent, nothing recorded").toEqual(before);
  });

  it("rpc info/health/utxos/mempool --url, accounts consolidate --execute --yes, deploy track + deploy status --verify", async () => {
    for (const [label, args] of [
      ["rpc-info", ["rpc", "info", "--url", session.rpcUrl, "--json"]],
      ["rpc-health", ["rpc", "health", "--url", session.rpcUrl, "--json"]],
      ["rpc-utxos", ["rpc", "utxos", accounts.a2!, "--url", session.rpcUrl, "--json"]],
      ["rpc-mempool", ["rpc", "mempool", pay.txId, "--url", session.rpcUrl, "--json"]]
    ] as const) {
      const r = await hk(label, [...args]);
      expect(r.code, brief(r)).toBe(0);
    }
    // a1 holds a few UTXOs by now: --target-utxos 1 makes the consolidation real (the default target is 20)
    const consolidate = await withMiner(() =>
      hk("consolidate-a1", ["accounts", "consolidate", "a1", "--target-utxos", "1", "--execute", "--yes", "--password-env", PW_ENV, "--json"])
    );
    expect(consolidate.code, brief(consolidate)).toBe(0);
    expect(find(consolidate.json, "status"), brief(consolidate)).not.toBe("CONSOLIDATION_NOT_REQUIRED");
    // the result names each batch's transaction in `receipts` (one batch here)
    const consolidationTx = find(consolidate.json, "receipts")?.[0] ?? find(consolidate.json, "txId");
    expect(find(consolidate.json, "batches"), brief(consolidate)).toBe(1);
    expect(typeof consolidationTx, brief(consolidate)).toBe("string");
    const consolidated = await withMiner(() => hk("wait-consolidation", ["tx", "wait", String(consolidationTx), "--timeout", "180", "--json"]));
    expect(consolidated.json?.state, brief(consolidated)).toBe("CONFIRMED");
    const track = await hk("deploy-track", ["deploy", "track", "cli-lifecycle-pay", "--tx-id", pay.txId, "--network", "simnet", "--json"]);
    expect(track.code, brief(track)).toBe(0);
    // B2: `--verify` observes the transaction on the node (no TxIndex) and answers in JSON
    const status = await withMiner(() => hk("deploy-status", ["deploy", "status", "cli-lifecycle-pay", "--network", "simnet", "--verify", "--json"]));
    expect(status.code, brief(status)).toBe(0);
    expect(status.json, brief(status)).toBeDefined();
    expect(JSON.stringify(status.json), brief(status)).toMatch(/CONFIRMED/);
  });

  // (after the consolidation: their sends would leave a1 a single UTXO, and the consolidation would have nothing to do)
  // INT9 · I-2 (TX-SEND-IDEMPOTENT-3) against the real node: a payment whose submission record is lost is never sent
  // again once the node shows it holds it — in its mempool, then (after the wait) through this workspace's stored looks,
  // then (the looks gone too) through its output in the node's UTXO index. Each refusal is counted at the wire.
  const lost: Record<string, any> = {};
  it("I-2 · a payment whose record was lost: MEMPOOL, then CONFIRMED, then IN_CHAIN — never a second submitTransaction; the node agrees it cannot take it again", async () => {
    const before = submits();
    const p = await planSignSend("lost", "a1", accounts.a2!, "2");
    Object.assign(lost, p);
    expect(submits() - before, "the one send").toBe(1);
    // oracle (mempool): the node holds it, and HardKAS says so
    expect(await session.rpc.getMempoolEntry(p.txId), "the node's mempool holds it").not.toBeNull();
    const status = await hk("lost-status", ["tx", "status", p.txId, "--json"]);
    expect(status.json?.state, brief(status)).toBe("MEMPOOL_ACCEPTED");

    // 1 · the record is lost while it is in the mempool
    for (const f of submissionFiles()) if (JSON.parse(fs.readFileSync(f, "utf8")).txId === p.txId) fs.rmSync(f);
    const inMempool = await hk("lost-resend-mempool", ["tx", "send", p.signedFile, "--yes", "--json"]);
    expect(inMempool.code, brief(inMempool)).toBe(0);
    expect(inMempool.json, brief(inMempool)).toMatchObject({ outcome: "already-submitted", code: "ALREADY_SUBMITTED", state: "MEMPOOL", recorded: false });
    expect(inMempool.json?.evidence?.kind, brief(inMempool)).toBe("mempool-entry");
    expect(submits() - before, "MEMPOOL: no second submitTransaction").toBe(1);

    // 2 · confirmed, observed from here: the stored looks decide
    const wait = await withMiner(() => hk("lost-wait", ["tx", "wait", p.txId, "--timeout", "180", "--json"]));
    expect(wait.json?.state, brief(wait)).toBe("CONFIRMED");
    const accepting = String(wait.json?.derived?.acceptingBlockHash);
    lost.acceptingBlockHash = accepting;
    const confirmed = await hk("lost-resend-confirmed", ["tx", "send", p.signedFile, "--yes", "--json"]);
    expect(confirmed.code, brief(confirmed)).toBe(0);
    expect(confirmed.json, brief(confirmed)).toMatchObject({ outcome: "already-submitted", code: "ALREADY_SUBMITTED", state: "CONFIRMED", recorded: false });
    expect(confirmed.json?.evidence, brief(confirmed)).toMatchObject({ kind: "virtual-chain", acceptingBlockHash: accepting });
    expect(Number(confirmed.json?.evidence?.confirmations?.blue), brief(confirmed)).toBeGreaterThanOrEqual(100);
    expect(submits() - before, "CONFIRMED: no second submitTransaction").toBe(1);

    // 3 · the looks are lost too: the node's UTXO index is what is left
    for (const f of observationFiles()) if (JSON.parse(fs.readFileSync(f, "utf8")).subject?.txId === p.txId) fs.rmSync(f);
    const inChain = await hk("lost-resend-in-chain", ["tx", "send", p.signedFile, "--yes", "--json"]);
    expect(inChain.code, brief(inChain)).toBe(0);
    expect(inChain.json, brief(inChain)).toMatchObject({ outcome: "already-submitted", code: "ALREADY_SUBMITTED", state: "IN_CHAIN", recorded: false });
    const out = inChain.json?.evidence?.outputs?.[0];
    expect(out, brief(inChain)).toMatchObject({ outpoint: `${p.txId}:0`, address: accounts.a2, amountSompi: "200000000" });
    // oracle: the UTXO row's DAA score is the accepting chain block's (what IN_CHAIN and tx wait --address rely on)
    const header: any = await session.rpc.call("getBlock", { hash: accepting, includeTransactions: false });
    expect(String(out.blockDaaScore), JSON.stringify(header?.block?.header ?? header)).toBe(String(BigInt(header?.block?.header?.daaScore ?? header?.header?.daaScore)));
    expect(submits() - before, "IN_CHAIN: no second submitTransaction").toBe(1);
    expect(submissionFiles().filter((f) => JSON.parse(fs.readFileSync(f, "utf8")).txId === p.txId), "nothing recorded").toEqual([]);

    // oracle (the node itself): handed the same transaction directly, the node refuses it — it cannot take it again
    const signed = readJson(p.signedFile);
    const direct = await session.rpc.submitTransaction(JSON.parse(signed.signedTransaction.payload), { expectedTxId: p.txId } as any).then(
      (r: any) => ({ accepted: true, r }),
      (e: any) => ({ accepted: false, message: String(e?.message ?? e) })
    );
    trace.push({ label: "lost-direct-submit-oracle", direct });
    expect(direct.accepted, JSON.stringify(direct)).toBe(false);
    lost.nodeRejection = (direct as any).message;

    // C4 · what the workspace still knows of it: signed here, no submission recorded, no state derived
    const why = await hk("lost-why", ["why", "--tx", p.txId, "--json"]);
    expect(why.code, brief(why)).toBe(0);
    expect(why.json, brief(why)).toMatchObject({ origin: "signed", submission: null, state: "INSUFFICIENT_EVIDENCE" });
    const explain = await hk("lost-explain", ["explain", "--tx", p.txId]);
    expect(explain.code, brief(explain)).toBe(0);
    expect(explain.stdout + explain.stderr, brief(explain)).toMatch(/signed in this workspace/);
  });

  // INT9 · C3 against the real node: a second workspace with nothing of the transaction waits for it by an address it pays.
  // RC1 · D2 (changed on purpose): a tx accepted long before the wait started used to end with
  // TX_WAIT_ACCEPTED_BEFORE_CURSOR, always. The wait now walks back from the sink along the node's selected chain, at
  // most --lookback chain blocks (default 1000), and finds it there: the old payment is CONFIRMED in the same accepting
  // block as its sender's own wait. With a bound too small for the distance, the typed error stays, with its diagnosis.
  it("C3 · tx wait --address from another workspace: CONFIRMED from the sink cursor, the same accepting block as the sender's; an old tx is found by the bounded walk back (or TX_WAIT_ACCEPTED_BEFORE_CURSOR past --lookback)", async () => {
    const other = path.join(parent, "watcher");
    fs.mkdirSync(path.join(other, ".hardkas"), { recursive: true });
    writeConfig(other);
    const p = await planSignSend("ext", "a1", accounts.a3!, "1", { send: false });
    const txId = String(readJson(p.signedFile).txId);
    const stop = backgroundMiner();
    let watched: Run;
    try {
      const watching = hk("ext-wait-watcher", ["tx", "wait", txId, "--address", accounts.a3!, "--until", "confirmed", "--timeout", "240", "--json"], { cwd: other });
      // the watcher's first look is recorded before the payment is sent: its cursor precedes the acceptance
      await untilTrue("the watcher's first look", () => observationFiles(other).length > 0, 120_000);
      const send = await hk("ext-send", ["tx", "send", p.signedFile, "--yes", "--json"]);
      expect(send.code, brief(send)).toBe(0);
      watched = await watching;
    } finally {
      await stop();
    }
    expect(watched.code, brief(watched)).toBe(0);
    expect(watched.json, brief(watched)).toMatchObject({ outcome: "reached", state: "CONFIRMED", cursor: { origin: "wait-start" } });
    expect(watched.json?.utxoView, brief(watched)).toMatchObject({ checked: true, converged: true, inputsUnknown: true, addresses: [accounts.a3] });
    // oracle: the sender's own wait (its submission's submit point) names the same accepting block
    const own = await withMiner(() => hk("ext-wait-sender", ["tx", "wait", txId, "--timeout", "180", "--json"]));
    expect(own.json?.state, brief(own)).toBe("CONFIRMED");
    expect(watched.json?.derived?.acceptingBlockHash, brief(watched)).toBe(own.json?.derived?.acceptingBlockHash);
    // RC1 · D2: a transaction accepted long before the watcher's wait starts. Precondition (the default bound): the
    // node's sink is less than 1000 DAA past the payment's output.
    const payOut = (await session.rpc.getUtxosByAddress(accounts.a2!)).find((u: any) => u.outpoint.transactionId === pay.txId);
    const sinkDaa = BigInt(((await session.rpc.getBlockDagInfo()) as any).virtualDaaScore);
    const outDaa = BigInt(payOut?.blockDaaScore ?? payOut?.raw?.utxoEntry?.blockDaaScore ?? -1);
    trace.push({ label: "rc1-d2-distance", payOutput: `${pay.txId}:0`, outputDaaScore: String(outDaa), virtualDaaScore: String(sinkDaa) });
    expect(sinkDaa - outDaa, "within the default --lookback of 1000 chain blocks").toBeLessThan(1000n);
    // past the bound: --lookback 5 → the typed error, with both DAA scores and what to pass; no state claimed
    const bounded = path.join(parent, "watcher-bounded");
    fs.mkdirSync(path.join(bounded, ".hardkas"), { recursive: true });
    writeConfig(bounded);
    const tooFar = await hk("ext-wait-old-lookback-5", ["tx", "wait", pay.txId, "--address", accounts.a2!, "--lookback", "5", "--timeout", "120", "--json"], { cwd: bounded });
    expect(tooFar.code, brief(tooFar)).toBe(1);
    expect(tooFar.json, brief(tooFar)).toMatchObject({ ok: false, code: "TX_WAIT_ACCEPTED_BEFORE_CURSOR" });
    expect(String(tooFar.json?.message), brief(tooFar)).toMatch(/walked back 5 chain blocks \(--lookback 5\)/);
    expect(String(tooFar.json?.message), brief(tooFar)).toContain(`DAA score ${outDaa}`);
    expect(tooFar.stdout, brief(tooFar)).not.toMatch(/"state"\s*:\s*"(ACCEPTED|CONFIRMED|FINALIZED)"/);
    // within the bound (the default): CONFIRMED in the sender's own accepting block, scanned from the walked-to chain block
    const old = await hk("ext-wait-old", ["tx", "wait", pay.txId, "--address", accounts.a2!, "--timeout", "120", "--json"], { cwd: other });
    expect(old.code, brief(old)).toBe(0);
    expect(old.json, brief(old)).toMatchObject({ outcome: "reached", state: "CONFIRMED", cursor: { origin: "lookback" } });
    expect(old.json?.derived?.acceptingBlockHash, brief(old)).toBe(pay.acceptingBlockHash);
    expect(BigInt(old.json?.cursor?.daaScore) < outDaa, brief(old)).toBe(true);
    expect(old.json?.cursor?.lookback, brief(old)).toMatchObject({ limit: 1000, outpoint: `${pay.txId}:0`, outputDaaScore: String(outDaa) });
    // oracle: the node's own header of that accepting block has the output's DAA score
    const header: any = await session.rpc.call("getBlock", { hash: pay.acceptingBlockHash, includeTransactions: false });
    expect(String(BigInt(header?.block?.header?.daaScore ?? header?.header?.daaScore)), brief(old)).toBe(String(outDaa));
    // invalid: not an address
    const bad = await hk("ext-wait-bad-address", ["tx", "wait", txId, "--address", "kaspasim:nope", "--json"], { cwd: other });
    expect(bad.code, brief(bad)).toBe(2);
  });

  // INT9 (B6 review M-7): "no new submission" held whatever happened (tx wait never writes submissions). Now the relay
  // counts the submitTransaction requests across the restart and the wait — the positive control being the send itself —
  // and the wait is shown to have run (its looks are recorded).
  it("node restart between send and wait: CONFIRMED, with no submitTransaction after the send and no new submission", async () => {
    const sent0 = submits();
    const r = await planSignSend("restart", "a1", accounts.a2!, "1");
    expect(submits() - sent0, "the send itself reached the node once").toBe(1);
    // accepted into the chain before the restart (kaspad does not persist its mempool)
    await mineBlocks(session, 3);
    const receipts = () => fs.readdirSync(path.join(ws, ".hardkas", "artifacts", "receipts")).filter((f) => f.startsWith("txSubmission-")).length;
    const before = receipts();
    const looksBefore = observationFiles().length;
    const sentBefore = submits();
    await session.handle.restart();
    // the session's own client was connected to the process that is gone
    await session.rpc.close().catch(() => {});
    (session as { rpc: JsonWrpcKaspaClient }).rpc = new JsonWrpcKaspaClient({ rpcUrl: session.rpcUrl });
    const wait = await withMiner(() => hk("wait-restart", ["tx", "wait", r.txId, "--timeout", "240", "--json"]));
    expect(wait.json?.state, brief(wait)).toBe("CONFIRMED");
    expect(receipts(), "no new submission artifact").toBe(before);
    expect(submits() - sentBefore, "no submitTransaction across the restart and the wait").toBe(0);
    expect(observationFiles().length, "the wait ran and recorded its looks").toBeGreaterThan(looksBefore);
  });

  it("every connection any command made went to the harness node (directly, or through the counting relay that forwards only to it), and nothing else was attempted", () => {
    expect(relay.upstream).toBe(session.rpcUrl);
    const port = `(?:${new URL(session.rpcUrl).port}|${relay.port})`;
    const lines = runs.flatMap((r) =>
      fs
        .readFileSync(r.log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => ({ run: r.label, line: l }))
    );
    const offending = lines.filter(({ line }) => {
      const [, kind, target] = line.split("\t");
      if (kind !== "LOOPBACK_CONNECT") return true;
      return !new RegExp(`(^|[^0-9])${port}$`).test(String(target));
    });
    trace.push({ label: "connections", total: lines.length, offending });
    expect(offending, JSON.stringify(offending.slice(0, 20), null, 1)).toEqual([]);
    expect(lines.length).toBeGreaterThan(0);
  });
});

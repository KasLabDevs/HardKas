// R4-T · several recipients in ONE transaction against a real rusty-kaspad v2.1.0 (simnet level, the harness's own
// isolated node: own container, free port, labels, teardown by label; never the canonical localnet).
//
// The built CLI (packages/cli/dist) in its own processes, under the hermetic preload (loopback only; the canonical node
// ports refused), pointed at the node through a loopback relay that counts the wRPC requests it passes on, so "one
// submission" is counted at the wire as well as in the store:
//   1. `tx batch --one-transaction` paying 3 recipients: one transaction, one submitTransaction, one submission
//      recorded; accepted and mined (CONFIRMED); every recipient's output holds exactly its amount, at its index;
//   2. the same for 20 recipients;
//   3. the same 3-payment file WITHOUT the flag: one transaction per payment, as before;
//   4. the limit: 194 recipients are refused before anything is signed (TOO_MANY_OUTPUTS, naming 193; nothing sent),
//      and the 193 it names are accepted and mined in one transaction, every output exact;
//   5. the SDK: sdk.tx.plan({ outputs }) → sign → send with the payment preflight: accepted, mined, exact amounts.
// Evidence: a JSON written to HARDKAS_TEST_R4T_EVIDENCE (or the OS temp directory).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadManagedKaspaWasmSync, parseKasToSompi } from "@hardkas/core";
import { getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "@hardkas/testing";
import { Hardkas } from "@hardkas/sdk";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv } from "./hermetic-child.js";
import { startCountingWsProxy, type CountingWsProxy } from "./helpers/counting-ws-proxy.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

const PW_ENV = "HK_R4T_PW";
const PASSWORD = `r4t-${crypto.randomBytes(12).toString("hex")}`;
const DENIED_PORTS = "16110,16210,17110,17210,18110,18210,18211";

let session: IsolatedSimnetSession;
let relay: CountingWsProxy;
let parent = "";
let ws = "";
let logDir = "";
let k: any;
let ALICE = "";
let PAYER = "";
let runs = 0;
const evidence: Record<string, any> = { schema: "hardkas.r4t.severalRecipients.v1", startedAt: new Date().toISOString(), node: {}, steps: [] as any[] };
const record = (name: string, data: Record<string, unknown>) => evidence.steps.push({ name, at: new Date().toISOString(), ...data });
const submits = () => relay.count("submitTransaction");

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  json: any;
}
async function hk(label: string, args: string[], extraEnv: Record<string, string> = {}): Promise<Run> {
  const log = path.join(logDir, `${String(runs++).padStart(3, "0")}-${label.replace(/[^\w.-]+/g, "_")}.log`);
  fs.writeFileSync(log, "");
  const env = hermeticChildEnv(log, { [PW_ENV]: PASSWORD, HARDKAS_HERMETIC_DENY_PORTS: DENIED_PORTS, ...extraEnv });
  return new Promise<Run>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      let json: any;
      try {
        json = JSON.parse(stdout.trim().split(/\r?\n(?=\{)/)[0] ?? "");
      } catch {
        json = undefined;
      }
      resolve({ code, stdout, stderr, json });
    });
  });
}
const brief = (r: Run) => `exit ${r.code}\n${r.stdout.slice(0, 3000)}\n${r.stderr.slice(0, 1500)}`;

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

/** A recipient address of its own (a fresh key per index; nobody spends from it). */
const recipient = (i: number) => String(new k.PrivateKey(crypto.createHash("sha256").update(`r4t-recipient-${i}`).digest("hex")).toPublicKey().toAddress("simnet").toString());
const submissionsOf = (txId: string) => {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txSubmission-/.test(f)).filter((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).txId === txId) : [];
};

/** Every recipient's output of `txId`, as the node's UTXO index lists it: [index, amount] per recipient, in order. */
async function paidOutputs(txId: string, recipients: readonly string[]): Promise<Array<Array<[number, string]>>> {
  const out: Array<Array<[number, string]>> = [];
  for (const address of recipients) {
    const listed = (await session.rpc.getUtxosByAddress(address)).filter((u: any) => String(u.outpoint.transactionId).toLowerCase() === txId.toLowerCase());
    out.push(listed.map((u: any) => [Number(u.outpoint.index), String(u.amountSompi)] as [number, string]));
  }
  return out;
}

/** `tx batch --one-transaction` over `payments`, then wait for CONFIRMED and check one submission and every output. */
async function oneTransaction(tag: string, from: string, amountsKas: readonly string[], firstRecipient: number) {
  const recipients = amountsKas.map((_, i) => recipient(firstRecipient + i));
  fs.writeFileSync(path.join(ws, `${tag}.json`), JSON.stringify({ payments: recipients.map((to, i) => ({ from, to, amount: amountsKas[i] })) }));
  const before = submits();
  const batch = await hk(`batch-${tag}`, ["tx", "batch", "--file", `${tag}.json`, "--network", "simnet", "--one-transaction", "--password-env", PW_ENV, "--json"]);
  expect(batch.code, brief(batch)).toBe(0);
  expect(batch.json).toMatchObject({ ok: true, oneTransaction: true, batchSize: recipients.length, successCount: recipients.length, failCount: 0 });
  const txId = String(batch.json.txId);
  expect(txId).toMatch(/^[0-9a-f]{64}$/);
  expect(new Set(batch.json.results.map((r: any) => r.txId))).toEqual(new Set([txId]));
  expect(submits() - before, "one submitTransaction at the wire").toBe(1);
  expect(submissionsOf(txId), "one submission recorded").toHaveLength(1);
  const wait = await withMiner(() => hk(`wait-${tag}`, ["tx", "wait", txId, "--timeout", "240", "--json"]));
  expect(wait.code, brief(wait)).toBe(0);
  expect(wait.json?.state, brief(wait)).toBe("CONFIRMED");
  const expected = amountsKas.map((a, i) => [[i, parseKasToSompi(a).toString()]]);
  expect(await paidOutputs(txId, recipients), "every recipient holds exactly its amount, at its output index").toEqual(expected);
  record(`one transaction · ${tag}`, {
    txId,
    recipients: recipients.length,
    planArtifactId: batch.json.planArtifactId,
    feeSompi: batch.json.feeSompi,
    submitTransaction: 1,
    submissions: submissionsOf(txId).length,
    state: wait.json?.state,
    acceptingBlockHash: wait.json?.derived?.acceptingBlockHash
  });
  return { txId, recipients, batch };
}

beforeAll(async () => {
  const pinned = Number(process.env.HARDKAS_TEST_SIMNET_RPC_PORT ?? "");
  session = await startIsolatedSimnet({ minerFixture: "alice", ...(Number.isInteger(pinned) && pinned > 0 ? { rpcPort: pinned } : {}) });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  relay = await startCountingWsProxy(session.rpcUrl, Number.isInteger(pinned) && pinned > 0 ? pinned + 1 : 0);
  k = loadManagedKaspaWasmSync();
  ALICE = session.minerAddress;
  const payerKey = getHardkasFixtureKey("carol");
  PAYER = String(new k.PrivateKey(payerKey).toPublicKey().toAddress("simnet").toString());
  const info: any = await session.rpc.getServerInfo();
  evidence.node = { rpcUrl: session.rpcUrl, relay: relay.url, containerName: session.containerName, serverVersion: info.serverVersion, networkId: info.networkId, harnessRunId: process.env.HARDKAS_TEST_RUN_ID };
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r4t-simnet-"));
  logDir = path.join(parent, "connection-logs");
  fs.mkdirSync(logDir, { recursive: true });
  ws = parent;
  const init = await hk("init", ["init", "app", "--network", "simnet", "--skip-toolchain", "--json"]);
  expect(init.code, brief(init)).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: relay.url } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  for (const [name, address, key] of [
    ["alice", ALICE, session.minerPrivateKey],
    ["payer", PAYER, payerKey]
  ] as const) {
    const imp = await hk(`import-${name}`, ["accounts", "real", "import", "--name", name, "--address", address, "--private-key-env", "HK_R4T_KEY", "--password-env", PW_ENV, "--json"], { HK_R4T_KEY: key });
    expect(imp.code, brief(imp)).toBe(0);
  }
  // the miner's coinbases mature (simnet coinbase maturity 1000 DAA, plus the planner's 10-DAA margin): ~1000 mature
  // coinbase UTXOs fund every case below
  await mineBlocks(session, 2000);
  const utxos = await session.rpc.getUtxosByAddress(ALICE);
  evidence.funding = { aliceUtxos: utxos.length, coinbaseSompi: utxos[0] ? String(utxos[0].amountSompi) : undefined };
});

afterAll(async () => {
  evidence.finishedAt = new Date().toISOString();
  evidence.relay = relay ? { submitTransaction: submits(), methods: relay.methods.length } : undefined;
  const file = process.env.HARDKAS_TEST_R4T_EVIDENCE || path.join(os.tmpdir(), `r4t-several-recipients-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(evidence, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    console.log(`[r4t] evidence written to ${file}`);
  } catch {
    /* diagnostic */
  }
  if (relay) await relay.close();
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

describe("R4-T · several recipients in one transaction on a real rusty-kaspad (simnet)", () => {
  it("tx batch --one-transaction, 3 recipients: one transaction, one submission; accepted, mined; every amount exact", async () => {
    await oneTransaction("three", "alice", ["1", "2", "3.5"], 0);
  });

  it("tx batch --one-transaction, 20 recipients: one transaction, one submission; accepted, mined; every amount exact", async () => {
    const amounts = Array.from({ length: 20 }, (_, i) => String(10 + i));
    const { txId } = await oneTransaction("twenty", "alice", amounts, 100);
    expect(txId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the same 3-payment file WITHOUT the flag: one transaction per payment, as before", async () => {
    const before = submits();
    const batch = await withMiner(() => hk("batch-three-classic", ["tx", "batch", "--file", "three.json", "--network", "simnet", "--password-env", PW_ENV, "--json"]));
    expect(batch.code, brief(batch)).toBe(0);
    expect(batch.json?.oneTransaction).toBeUndefined();
    const txIds: string[] = (batch.json?.results ?? []).map((r: any) => String(r.txId));
    expect(txIds, brief(batch)).toHaveLength(3);
    expect(new Set(txIds).size).toBe(3);
    expect(submits() - before, "one submitTransaction per payment").toBe(3);
    for (const txId of txIds) expect(submissionsOf(txId)).toHaveLength(1);
    record("same file without the flag", { txIds, submitTransaction: submits() - before });
  });

  it("the limit: 194 recipients are refused before signing (TOO_MANY_OUTPUTS names 193; nothing sent); the 193 are accepted and mined, every output exact", async () => {
    // the payer gets six UTXOs of 900 KAS (the batch without the flag: one transaction each), so the inputs fit beside
    // 193 outputs (the miner's coinbases are many small UTXOs)
    fs.writeFileSync(path.join(ws, "fund-payer.json"), JSON.stringify(Array.from({ length: 6 }, () => ({ from: "alice", to: PAYER, amount: "900" }))));
    const fund = await withMiner(() => hk("fund-payer", ["tx", "batch", "--file", "fund-payer.json", "--network", "simnet", "--password-env", PW_ENV, "--json"]));
    expect(fund.code, brief(fund)).toBe(0);
    const fundTx: string[] = fund.json.results.map((r: any) => String(r.txId));
    for (const txId of fundTx) {
      const w = await withMiner(() => hk(`wait-fund-${txId.slice(0, 8)}`, ["tx", "wait", txId, "--timeout", "240", "--json"]));
      expect(w.json?.state, brief(w)).toBe("CONFIRMED");
    }
    const payerUtxos = await session.rpc.getUtxosByAddress(PAYER);
    expect(payerUtxos.length).toBe(6);

    const all = Array.from({ length: 194 }, (_, i) => recipient(1000 + i));
    fs.writeFileSync(path.join(ws, "limit-194.json"), JSON.stringify(all.map((to) => ({ from: "payer", to, amount: "25" }))));
    const before = submits();
    const refused = await hk("batch-194", ["tx", "batch", "--file", "limit-194.json", "--network", "simnet", "--one-transaction", "--password-env", PW_ENV, "--json"]);
    expect(refused.code, brief(refused)).toBe(1);
    expect(refused.json, brief(refused)).toMatchObject({ ok: false, oneTransaction: true, failedStep: "plan", code: "TOO_MANY_OUTPUTS", successCount: 0 });
    const fit = Number(/at most (\d+) of them/.exec(String(refused.json.planError))?.[1]);
    expect(fit, brief(refused)).toBe(193);
    expect(submits() - before, "nothing sent").toBe(0);
    record("194 recipients refused", { code: refused.json.code, outputsThatFit: fit, submitTransaction: 0, message: refused.json.planError });

    const atLimit = await oneTransaction("limit-193", "payer", Array.from({ length: fit }, () => "25"), 1000);
    const signedPath = fs
      .readdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true })
      .map(String)
      .map((f) => path.join(ws, ".hardkas", "artifacts", f))
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
      .find((a) => a?.schema === "hardkas.signedTx" && a?.txId === atLimit.txId);
    expect(signedPath, "the signed transaction is in the store").toBeDefined();
    let tx: any = JSON.parse(signedPath.signedTransaction.payload);
    while (typeof tx === "string") tx = JSON.parse(tx);
    expect(tx.outputs, "193 payments and the change").toHaveLength(fit + 1);
    record("193 recipients accepted", { txId: atLimit.txId, outputs: tx.outputs.length, inputs: tx.inputs.length });
  });

  it("the SDK: tx.plan({ outputs }) → sign → send with the payment preflight; accepted, mined, every amount exact", async () => {
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    try {
      const recipients = [recipient(5000), recipient(5001), recipient(5002)];
      const plan: any = await sdk.tx.plan({ from: "alice", outputs: recipients.map((to, i) => ({ to, amount: `${i + 4}` })) });
      expect(plan.outputs.map((o: any) => o.amountSompi)).toEqual(["400000000", "500000000", "600000000"]);
      const signed: any = await sdk.tx.sign(plan, { account: "alice", keystorePassword: PASSWORD });
      const before = submits();
      const sent: any = await sdk.tx.send(signed, { preflight: true });
      expect(sent.submitted, JSON.stringify(sent).slice(0, 2000)).toBe(true);
      expect(submits() - before).toBe(1);
      expect(sent.submission.preflight?.inputs).toBe(plan.inputs.length);
      expect(sent.submission.fee).toMatchObject({ status: "derived", outputCount: 4 });
      let derived: any;
      for (let round = 0; round < 20; round++) {
        await mineBlocks(session, 1);
        derived = (await sdk.tx.observe(signed.txId)).derived;
        if (["ACCEPTED", "CONFIRMED", "FINALIZED"].includes(derived.status)) break;
      }
      expect(derived?.status, JSON.stringify(derived)).toMatch(/ACCEPTED|CONFIRMED|FINALIZED/);
      expect(await paidOutputs(signed.txId, recipients)).toEqual([[[0, "400000000"]], [[1, "500000000"]], [[2, "600000000"]]]);
      record("SDK plan({ outputs }) + preflight", { txId: signed.txId, preflight: sent.submission.preflight, fee: sent.submission.fee, state: derived.status });
    } finally {
      await sdk.close?.();
    }
  });
});

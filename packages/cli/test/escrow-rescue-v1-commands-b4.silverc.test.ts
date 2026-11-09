import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// L1-CORE-1 B4 · `escrow rescue-v1 prepare|inspect|sign|broadcast`, the commands (the draft helpers have their own tests,
// escrow-rescue-draft-ca-tx-06). silverc level: `prepare` compiles the v1 escrow with the pinned silverc. The node is a
// loopback fake that proves its identity (getServerInfo) and holds the escrow UTXOs; it answers a broadcast with the
// draft's own txid. The canonical ports are denied and Docker points nowhere: a command that fell back to the
// canonical localnet is caught by its connection log. What is checked: refusals happen before any node is contacted;
// the draft does what the package says (CA-TX-06) through every command; signing needs a workspace account; the
// broadcast proves the node, then sends exactly the draft (its outpoint, its destination) and reports its txid.
// -----------------------------------------------------------------------------

const ADDRESS = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const FUNDED = "ab".repeat(32);
const DUST = "cd".repeat(32);
const TOTAL = 10_00000000;
const FEE = 400000;

type Fake = { url: string; port: number; methods: string[]; submitted: any[]; acceptTxId?: string; lockSpk: string; close(): Promise<void> };

async function startFake(): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const fake: Fake = { url: "", port: 0, methods: [], submitted: [], lockSpk: "", close: async () => undefined };
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      // the request id is a u64: kept as its text (JSON.parse would round it, and the answer would match no request)
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try {
        params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
      } catch {
        params = undefined;
      }
      if (!id) return;
      fake.methods.push(method);
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "simnet", hasUtxoIndex: true, isSynced: true, virtualDaaScore: 5000 });
        case "getBlockDagInfo": {
          // a broadcast is preceded by the network the node says it serves, from two answers
          const h = "12".repeat(32);
          return ok({ network: "simnet", blockCount: 10, headerCount: 10, tipHashes: [h], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [h], pruningPointHash: h, virtualDaaScore: 5000, sink: h });
        }
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) => [
              { address, outpoint: { transactionId: FUNDED, index: 0 }, utxoEntry: { amount: TOTAL, scriptPublicKey: fake.lockSpk, blockDaaScore: 3000, isCoinbase: false } },
              { address, outpoint: { transactionId: DUST, index: 1 }, utxoEntry: { amount: 300000, scriptPublicKey: fake.lockSpk, blockDaaScore: 3000, isCoinbase: false } }
            ])
          });
        case "submitTransaction":
          fake.submitted.push(params);
          return fake.acceptTxId ? ok({ transactionId: fake.acceptTxId }) : err("fake node refuses submitTransaction");
        default:
          return err(`fake node refuses ${method}`);
      }
    });
  });
  fake.port = (server.address() as AddressInfo).port;
  fake.url = `ws://127.0.0.1:${fake.port}`;
  fake.close = () =>
    new Promise<void>((r) => {
      for (const c of server.clients) c.terminate();
      server.close(() => r());
    });
  return fake;
}

const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b4-rescue-logs-"));
made.push(logs);
let fake: Fake;
let ws = "";

async function run(name: string, args: string[]) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], {
      cwd: ws,
      env: hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: "16110,16210,17110,17210,18110,18210,18211", DOCKER_HOST: "tcp://127.0.0.1:9" }),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t").slice(1, 3).join(" ")) : [];
  let json: any;
  try {
    json = JSON.parse(r.stdout.trim());
  } catch {
    json = undefined;
  }
  const all = `${r.stdout}\n${r.stderr}`;
  return { status: r.status, json, dialled, all, brief: `exit ${r.status}\n${all.slice(0, 1500)}\n${JSON.stringify(dialled)}` };
}
const contactedFake = (d: string[]) => d.some((x) => x.endsWith(`:${fake.port}`));
const canonical = (d: string[]) => d.filter((x) => /:(16110|16210|17110|17210|18110|18210|18211)$/.test(x));
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(ws, file), "utf8"));
const prepareArgs = (out: string, extra: string[] = []) => ["escrow", "rescue-v1", "prepare", "--address", ADDRESS, "--outpoint", `${FUNDED}:0`, "--to", ADDRESS, "--out", out, "--json", ...extra];

beforeAll(async () => {
  assertHermeticPreloadActive();
  fake = await startFake();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b4-rescue-"));
  made.push(parent);
  const init = spawnSync(process.execPath, [cliDist, "init", "rescue", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: hermeticChildEnv(path.join(logs, "init.net.log")), timeout: 120_000 });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  ws = path.join(parent, "rescue");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: fake.url } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  // the workspace's dev accounts (alice..erin), as `up` and `localnet start` provision them
  const { ensureDevAccounts } = await import("@hardkas/accounts");
  await ensureDevAccounts(ws);
  // The escrow UTXOs the fake holds are locked to the v1 escrow `prepare` compiles (its default keys, the target's
  // script, half the amount each): compiled here by `silver compile`, so the lock is the pinned silverc's own.
  const { ESCROW_V1_SOURCE, ESCROW_V1_CONTRACT_NAME } = await import("@hardkas/escrow");
  const { loadManagedKaspaWasmSync } = await import("@hardkas/core");
  const k: any = loadManagedKaspaWasmSync();
  const targetSpk = String(k.payToAddressScript(new k.Address(ADDRESS)).script);
  const bytes = (hex: string) => ({ kind: "bytes", value: [...Buffer.from(hex, "hex")] });
  const args = [bytes("11".repeat(32)), bytes("22".repeat(32)), bytes("33".repeat(32)), bytes(`0000${targetSpk}`), bytes(`0000${targetSpk}`), { kind: "int", value: TOTAL / 2 }, { kind: "int", value: TOTAL / 2 }];
  fs.writeFileSync(path.join(ws, "escrow.sil"), ESCROW_V1_SOURCE);
  fs.writeFileSync(path.join(ws, "escrow.args.json"), JSON.stringify(args));
  const compiled = await run("compile-escrow", ["silver", "compile", "escrow.sil", "--args", "escrow.args.json", "--json"]);
  expect(compiled.status, compiled.brief).toBe(0);
  const lock = compiled.json.contracts.find((c: any) => c.name === ESCROW_V1_CONTRACT_NAME)?.lockingScript;
  expect(lock?.script, JSON.stringify(compiled.json.contracts)).toMatch(/^[0-9a-f]+$/);
  fake.lockSpk = Number(lock.version).toString(16).padStart(4, "0") + lock.script;
});

afterAll(async () => {
  await fake?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("L1-CORE-1 B4 · escrow rescue-v1, the commands", () => {
  it("R-1 prepare refuses a malformed outpoint and an excessive fee before any node is contacted", async () => {
    const before = fake.methods.length;
    const bad = await run("prepare-bad-outpoint", ["escrow", "rescue-v1", "prepare", "--address", ADDRESS, "--outpoint", "nope", "--to", ADDRESS, "--json"]);
    expect(bad.status, bad.brief).not.toBe(0);
    expect(bad.all).toMatch(/RESCUE_OUTPOINT_INVALID/);
    const fee = await run("prepare-fee", prepareArgs("x.json", ["--fee", "500001"]));
    expect(fee.all, fee.brief).toMatch(/ESCROW_FEE_EXCESSIVE_REFUSED/);
    expect(fake.methods.length).toBe(before);
    for (const r of [bad, fee]) expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT")), r.brief).toEqual([]);
    expect(fs.existsSync(path.join(ws, "x.json"))).toBe(false);
  });

  it("R-2 prepare on the workspace's node: identity first; an outpoint it does not hold, or one smaller than the fee, is refused and nothing is written", async () => {
    const missing = await run("prepare-missing", ["escrow", "rescue-v1", "prepare", "--address", ADDRESS, "--outpoint", `${"ef".repeat(32)}:0`, "--to", ADDRESS, "--out", "m.json", "--json"]);
    expect(missing.all, missing.brief).toMatch(/RESCUE_UTXO_NOT_FOUND/);
    const dust = await run("prepare-dust", ["escrow", "rescue-v1", "prepare", "--address", ADDRESS, "--outpoint", `${DUST}:1`, "--to", ADDRESS, "--out", "d.json", "--json"]);
    expect(dust.all, dust.brief).toMatch(/RESCUE_INSUFFICIENT_FUNDS/);
    expect(fake.methods.indexOf("getServerInfo")).toBeLessThan(fake.methods.indexOf("getUtxosByAddresses"));
    for (const r of [missing, dust]) expect(canonical(r.dialled), r.brief).toEqual([]);
    expect(fs.existsSync(path.join(ws, "m.json")) || fs.existsSync(path.join(ws, "d.json"))).toBe(false);
  });

  it("R-3 prepare writes a draft that spends the outpoint to the target, the fee its only difference, unsigned", async () => {
    const r = await run("prepare", prepareArgs("rescue.json"));
    expect(r.status, r.brief).toBe(0);
    expect(contactedFake(r.dialled) && canonical(r.dialled).length === 0, r.brief).toBe(true);
    const pkg = read("rescue.json");
    expect(pkg).toMatchObject({ schema: "hardkas.escrow.rescue.v1", networkId: "simnet", address: ADDRESS, outpoint: `${FUNDED}:0`, targetAddress: ADDRESS, totalSompi: String(TOTAL), feeSompi: String(FEE), recoveredSompi: String(TOTAL - FEE), signatures: {} });
    expect(pkg.draft.unsignedTxId).toMatch(/^[0-9a-f]{64}$/);
    expect(r.json?.ok).toBe(true);
  });

  it("R-4 inspect shows the draft (what is signed); a package edited to say otherwise is refused by inspect, sign and broadcast, and left as it was", async () => {
    const r = await run("inspect", ["escrow", "rescue-v1", "inspect", "rescue.json", "--json"]);
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.verifiedDraft).toMatchObject({ networkId: "simnet", outpoint: `${FUNDED}:0`, totalSompi: String(TOTAL), recoveredSompi: String(TOTAL - FEE), feeSompi: String(FEE), destinationAddress: ADDRESS });
    const forged = { ...read("rescue.json"), recoveredSompi: String(TOTAL - 1000) };
    fs.writeFileSync(path.join(ws, "forged.json"), JSON.stringify(forged, null, 2));
    const before = fs.readFileSync(path.join(ws, "forged.json"), "utf8");
    const submittedBefore = fake.submitted.length;
    for (const [label, args] of [
      ["inspect", ["escrow", "rescue-v1", "inspect", "forged.json", "--json"]],
      ["sign", ["escrow", "rescue-v1", "sign", "forged.json", "--account", "alice", "--role", "buyer", "--json"]],
      ["broadcast", ["escrow", "rescue-v1", "broadcast", "forged.json", "--json"]]
    ] as const) {
      const x = await run(`forged-${label}`, [...args]);
      expect(x.status, x.brief).not.toBe(0);
      expect(x.all, label).toMatch(/RESCUE_DRAFT_MISMATCH/);
      expect(contactedFake(x.dialled), label).toBe(false);
    }
    expect(fs.readFileSync(path.join(ws, "forged.json"), "utf8")).toBe(before);
    expect(fake.submitted.length).toBe(submittedBefore);
  });

  it("R-5 sign needs a workspace account; buyer and seller slots are filled with signatures of the draft", async () => {
    const before = fs.readFileSync(path.join(ws, "rescue.json"), "utf8");
    const nobody = await run("sign-nobody", ["escrow", "rescue-v1", "sign", "rescue.json", "--account", "mallory", "--json"]);
    expect(nobody.all, nobody.brief).toMatch(/RESCUE_ACCOUNT_NOT_FOUND/);
    expect(fs.readFileSync(path.join(ws, "rescue.json"), "utf8")).toBe(before);
    const buyer = await run("sign-buyer", ["escrow", "rescue-v1", "sign", "rescue.json", "--account", "alice", "--role", "buyer", "--json"]);
    expect(buyer.status, buyer.brief).toBe(0);
    // a copy signed by the buyer only, for the broadcast refusal below
    fs.copyFileSync(path.join(ws, "rescue.json"), path.join(ws, "buyer-only.json"));
    const seller = await run("sign-seller", ["escrow", "rescue-v1", "sign", "rescue.json", "--account", "bob", "--role", "seller", "--json"]);
    expect(seller.status, seller.brief).toBe(0);
    const pkg = read("rescue.json");
    expect(Object.keys(pkg.signatures).sort()).toEqual(["buyer", "seller"]);
    for (const s of Object.values(pkg.signatures)) expect(String(s)).toMatch(/^[0-9a-f]{128,}/i);
    expect(pkg.signatures.buyer).not.toBe(pkg.signatures.seller);
    for (const r of [nobody, buyer, seller]) expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT")), r.brief).toEqual([]);
    const shown = await run("inspect-signed", ["escrow", "rescue-v1", "inspect", "rescue.json"]);
    expect(shown.all).toMatch(/Signatures:\s+buyer, seller/);
  });

  it("R-6 broadcast: another network or a missing signature is refused before the node; then the node proves itself and receives exactly the draft", async () => {
    const submittedBefore = fake.submitted.length;
    const other = await run("broadcast-other-network", ["escrow", "rescue-v1", "broadcast", "rescue.json", "--network", "testnet-10", "--json"]);
    expect(other.all, other.brief).toMatch(/RESCUE_NETWORK_MISMATCH/);
    const half = await run("broadcast-buyer-only", ["escrow", "rescue-v1", "broadcast", "buyer-only.json", "--json"]);
    expect(half.all, half.brief).toMatch(/RESCUE_INCOMPLETE_SIGNATURES/);
    for (const r of [other, half]) expect(contactedFake(r.dialled), r.brief).toBe(false);
    expect(fake.submitted.length).toBe(submittedBefore);

    const pkg = read("rescue.json");
    fake.acceptTxId = pkg.draft.unsignedTxId;
    const methodsBefore = fake.methods.length;
    const sent = await run("broadcast", ["escrow", "rescue-v1", "broadcast", "rescue.json", "--json"]);
    expect(sent.status, sent.brief).toBe(0);
    expect(sent.json).toMatchObject({ ok: true, txId: pkg.draft.unsignedTxId });
    const asked = fake.methods.slice(methodsBefore);
    expect(asked.indexOf("getServerInfo"), JSON.stringify(asked)).toBeGreaterThanOrEqual(0);
    expect(asked.indexOf("getServerInfo")).toBeLessThan(asked.indexOf("submitTransaction"));
    expect(fake.submitted.length).toBe(submittedBefore + 1);
    const tx = fake.submitted.at(-1)?.transaction;
    expect(tx?.inputs?.length).toBe(1);
    expect(String(tx.inputs[0].previousOutpoint?.transactionId).toLowerCase()).toBe(FUNDED);
    expect(tx.outputs?.length).toBe(1);
    expect(String(tx.outputs[0].value ?? tx.outputs[0].amount)).toBe(String(TOTAL - FEE));
    expect(canonical(sent.dialled), sent.brief).toEqual([]);
  });
});

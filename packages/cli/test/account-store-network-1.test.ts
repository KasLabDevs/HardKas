import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

// -----------------------------------------------------------------------------
// ACCOUNT-STORE-NETWORK-1 (2026-10-15). An account's network has one meaning across the store, its keystore and its
// address, and every path that signs checks it against the plan BEFORE any key is decrypted:
//   * `accounts real generate --network <n>` records <n> on the store entry (the store was created "simnet" whatever
//     was asked, and entries carried no network);
//   * resolution never picks silently between contradicting sources (store entry vs keystore metadata vs address
//     family) — ACCOUNT_NETWORK_CONFLICT;
//   * a legacy store (store-level "simnet", entries without network, keystores that say testnet-10) still resolves
//     to the keystore's network — and the explicit migration says so before it writes anything;
//   * sdk.tx.sign refuses an account whose network differs from the plan's before it touches the keystore — the
//     existing guard (accounts/src/signer.ts: assertExecutionCompatibility "before any signer unlock",
//     EXECUTION_NETWORK_MISMATCH), pinned here so it cannot regress;
//   * simnet keeps working.
// Offline: fake nodes on loopback only; every child runs the hermetic preload. No submitTransaction is ever made.
// -----------------------------------------------------------------------------

const PW = "asn-test-password-only";
const PW_VAR = "HK_ASN_PW";
let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

const funded = new Set<string>();
type Fake = { url: string; methods: string[]; close(): Promise<void> };
async function startFake(network: string): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  const fake: Fake = { url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`, methods: [], close: async () => {} };
  const DAA = 90_000_000;
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
      const ok = (r: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(r)}}`);
      const err = (m: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(m)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "fake", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network, blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).filter((a: string) => funded.has(a)).map((address: string, i: number) => ({
              address,
              outpoint: { transactionId: hashOf(0xa00 + i), index: 0 },
              utxoEntry: { amount: 50_00000000, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false }
            }))
          });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: funded.has(address) ? 50_00000000 : 0 })) });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "submitTransaction":
          return err("fake: submissions refused (this file never broadcasts)");
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  fake.close = () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); });
  return fake;
}

const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-asn-logs-"));
made.push(logs);
async function run(name: string, argv: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, argv, { cwd, env: hermeticChildEnv(log, { [PW_VAR]: PW }) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 200_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t").slice(1, 3).join(" ")) : [];
  return { ...r, dialled, brief: `exit ${r.status}\n${r.stdout.slice(-1500)}\n${r.stderr.slice(0, 1500)}` };
}
const cli = (name: string, args: string[], cwd: string) => run(name, [cliDist, ...args], cwd);
const dist = (pkg: string) => pathToFileURL(path.join(repoRoot, "packages", pkg, "dist", "index.js")).href;
/** A script in its own process; `body` sees `sdk`, `accounts` (module namespaces), `cwd`, `out`; prints `out`. */
async function script(name: string, cwd: string, body: string) {
  const file = path.join(logs, `${name}.mjs`);
  fs.writeFileSync(
    file,
    `const sdk = await import(${JSON.stringify(dist("sdk"))});\nconst accounts = await import(${JSON.stringify(dist("accounts"))});\n` +
      `const cwd = ${JSON.stringify(cwd)};\nlet out = {};\n` +
      `try { ${body} } catch (e) { out.error = { code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 300) }; }\n` +
      `console.log("@@" + JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));\nprocess.exit(0);\n`
  );
  const r = await run(name, [file], cwd);
  const line = r.stdout.split(/\r?\n/).find((l) => l.startsWith("@@"));
  return { r, out: line ? JSON.parse(line.slice(2)) : undefined };
}
const cfg = (network: string, url: string) =>
  `export default ${JSON.stringify({
    execution: { default: "t", targets: { t: { mode: network === "simnet" ? "localnet" : "rpc", domain: "kaspa-l1", network } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { [network]: { kind: network === "simnet" ? "kaspa-node" : "kaspa-rpc", network, rpcUrl: url } }
  })};\n`;
function workspace(label: string, network: string, url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-asn-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), cfg(network, url));
  return ws;
}
const storeOf = (ws: string) => JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"));
const writeStore = (ws: string, s: unknown) => fs.writeFileSync(path.join(ws, ".hardkas", "accounts.real.json"), JSON.stringify(s, null, 2));
async function generate(ws: string, name: string, network: string) {
  const r = await cli(`gen-${name}-${path.basename(ws)}`, ["accounts", "real", "generate", "--name", name, "--network", network, "--password-env", PW_VAR, "--json"], ws);
  expect(r.status, r.brief).toBe(0);
  return /kaspa(?:test|sim):[0-9a-z]+/.exec(r.stdout)![0];
}
/** The legacy shape every store had before this fix: store-level "simnet", entries without a network. */
function makeLegacy(ws: string) {
  const s = storeOf(ws);
  s.networkId = "simnet";
  for (const a of s.accounts) delete a.network;
  writeStore(ws, s);
}

let T: Fake;
let S: Fake;
beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  T = await startFake("testnet-10");
  S = await startFake("simnet");
});
afterAll(async () => {
  await T?.close();
  await S?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("ACCOUNT-STORE-NETWORK-1 · the network an account was made for is recorded and believed", () => {
  it("ASN-1 generate --network testnet-10 records testnet-10 on the store entry, and the SDK resolves it as testnet-10", async () => {
    const ws = workspace("asn1", "testnet-10", T.url);
    await generate(ws, "tt", "testnet-10");
    const entry = storeOf(ws).accounts.find((a: any) => a.name === "tt");
    const { out } = await script("asn1-resolve", ws, `const hk = await sdk.Hardkas.open({ cwd, network: "testnet-10", policy: { allowPublic: true } }); const a = await hk.accounts.resolve("tt"); out.network = a.network; await hk.close();`);
    expect(entry.network, JSON.stringify(entry)).toBe("testnet-10");
    expect(out?.network, JSON.stringify(out)).toBe("testnet-10");
  });

  it("ASN-2 a store entry and its keystore that disagree are a typed conflict, never a silent choice", async () => {
    const ws = workspace("asn2", "testnet-10", T.url);
    await generate(ws, "tt", "testnet-10");
    const s = storeOf(ws);
    s.accounts.find((a: any) => a.name === "tt").network = "simnet"; // the store says simnet, the keystore testnet-10
    writeStore(ws, s);
    const { out } = await script("asn2-resolve", ws, `const hk = await sdk.Hardkas.open({ cwd, network: "testnet-10", policy: { allowPublic: true } }); try { const a = await hk.accounts.resolve("tt"); out.network = a.network; } finally { await hk.close(); }`);
    expect(out?.error?.code, JSON.stringify(out)).toBe("ACCOUNT_NETWORK_CONFLICT");
  });

  it("ASN-3 a legacy store (store-level simnet, no entry network, testnet-10 keystores) still resolves testnet-10 and plans on testnet-10 by name", async () => {
    const ws = workspace("asn3", "testnet-10", T.url);
    const addr = await generate(ws, "tt", "testnet-10");
    makeLegacy(ws);
    funded.add(addr);
    const r = await cli("asn3-plan", ["tx", "plan", "--network", "testnet-10", "--from", "tt", "--to", addr, "--amount", "1", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.dialled.every((d) => d.startsWith("LOOPBACK_CONNECT")), JSON.stringify(r.dialled)).toBe(true);
  });
});

describe("ACCOUNT-STORE-NETWORK-1 · sdk.tx.sign checks the account's network before any key is touched", () => {
  it("ASN-4 signing a testnet-10 plan with a simnet account is refused EXECUTION_NETWORK_MISMATCH before decryption (a wrong password is never reached); the right account signs", async () => {
    const ws = workspace("asn4", "testnet-10", T.url);
    const tt = await generate(ws, "tt", "testnet-10");
    await generate(ws, "ss", "simnet");
    funded.add(tt);
    const dest = new kaspa.PrivateKey("66".repeat(32)).toAddress("testnet-10").toString();
    const { out, r } = await script(
      "asn4-sign",
      ws,
      `const hk = await sdk.Hardkas.open({ cwd, network: "testnet-10", policy: { allowPublic: true } });
       try {
         const plan = await hk.tx.plan({ from: "tt", to: ${JSON.stringify(dest)}, amount: "1" });
         try { await hk.tx.sign(plan, { account: "ss", keystorePassword: "deliberately-wrong" }); out.wrong = "SIGNED"; }
         catch (e) { out.wrong = { code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 200) }; }
         const signed = await hk.tx.sign(plan, { account: "tt", keystorePassword: process.env.${PW_VAR} });
         out.right = { txId: signed.txId ?? null };
       } finally { await hk.close(); }`
    );
    const signedDir = path.join(ws, ".hardkas", "artifacts", "signed");
    const signedFiles = fs.existsSync(signedDir) ? fs.readdirSync(signedDir) : [];
    expect(out?.wrong?.code, `${JSON.stringify(out)}\n${r.brief}`).toBe("EXECUTION_NETWORK_MISMATCH");
    expect(out?.right?.txId, JSON.stringify(out)).toMatch(/^[0-9a-f]{64}$/);
    expect(signedFiles.length, "exactly one signed artifact: the right account's").toBe(1);
    expect(T.methods.includes("submitTransaction")).toBe(false);
  });

  it("ASN-5 simnet keeps working: a simnet account plans and signs on simnet", async () => {
    const ws = workspace("asn5", "simnet", S.url);
    const ss = await generate(ws, "ss", "simnet");
    funded.add(ss);
    const dest = new kaspa.PrivateKey("77".repeat(32)).toAddress("simnet").toString();
    const { out, r } = await script(
      "asn5-sign",
      ws,
      `const hk = await sdk.Hardkas.open({ cwd, network: "simnet" });
       try {
         const plan = await hk.tx.plan({ from: "ss", to: ${JSON.stringify(dest)}, amount: "1" });
         const signed = await hk.tx.sign(plan, { account: "ss", keystorePassword: process.env.${PW_VAR} });
         out.txId = signed.txId ?? null; out.network = plan.networkId;
       } finally { await hk.close(); }`
    );
    expect(out?.txId, `${JSON.stringify(out)}\n${r.brief}`).toMatch(/^[0-9a-f]{64}$/);
    expect(out?.network).toBe("simnet");
  });
});

describe("ACCOUNT-STORE-NETWORK-1 · kaspatest: alone never names testnet-10 (review 2026-10-15)", () => {
  it("ASN-7 a legacy kaspatest: entry with no network and no keystore, in a testnet-10 workspace: resolution leaves it unbound (not testnet-10), signing refuses, the migration calls it undetermined and writes nothing", async () => {
    const ws = workspace("asn7", "testnet-10", T.url);
    const r0 = await cli("asn7-gen", ["accounts", "real", "generate", "--name", "lp", "--network", "testnet-10", "--unsafe-plaintext", "--yes", "--json"], ws);
    expect(r0.status, r0.brief).toBe(0);
    const lp = /kaspatest:[0-9a-z]+/.exec(r0.stdout)![0];
    makeLegacy(ws); // no entry network; plaintext, so no keystore either
    expect(fs.existsSync(path.join(ws, ".hardkas", "keystore", "lp.json"))).toBe(false);
    funded.add(lp);
    const dest = new kaspa.PrivateKey("88".repeat(32)).toAddress("testnet-10").toString();
    const { out, r } = await script(
      "asn7-resolve-sign",
      ws,
      `const hk = await sdk.Hardkas.open({ cwd, network: "testnet-10", policy: { allowPublic: true } });
       try {
         const a = await hk.accounts.resolve("lp");
         out.network = a.network ?? null;
         const plan = await hk.tx.plan({ from: ${JSON.stringify(lp)}, to: ${JSON.stringify(dest)}, amount: "1" });
         try { await hk.tx.sign(plan, { account: "lp" }); out.sign = "SIGNED"; }
         catch (e) { out.sign = { code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 200) }; }
       } finally { await hk.close(); }`
    );
    expect(out?.network, `${JSON.stringify(out)}\n${r.brief}`).toBeNull(); // never "testnet-10" for being in a TN10 workspace
    expect(out?.sign?.code, JSON.stringify(out)).toBe("EXECUTION_NETWORK_MISMATCH");
    const before = fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8");
    const plan = await script("asn7-plan", ws, `out = accounts.planRealAccountNetworkMigration({ cwd });`);
    expect(plan.out?.accounts?.find((a: any) => a.name === "lp")).toMatchObject({ status: "undetermined", proposedNetwork: null });
    expect(plan.out?.coherent).toBe(false);
    const applied = await script("asn7-apply", ws, `out = await accounts.applyRealAccountNetworkMigration({ cwd });`);
    expect(applied.out?.error?.code, JSON.stringify(applied.out)).toBe("ACCOUNT_NETWORK_CONFLICT");
    expect(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"), "an undetermined store is never written").toBe(before);
    expect(T.methods.includes("submitTransaction")).toBe(false);
  });
});

describe("ACCOUNT-STORE-NETWORK-1 · explicit migration of a legacy store", () => {
  it("ASN-6 the migration reports before it writes; it writes only a coherent store, only the missing entry networks; then it is a no-op", async () => {
    const ws = workspace("asn6", "testnet-10", T.url);
    await generate(ws, "a1", "testnet-10");
    await generate(ws, "a2", "testnet-10");
    makeLegacy(ws);
    const before = fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8");
    const plan1 = await script("asn6-plan", ws, `out = accounts.planRealAccountNetworkMigration({ cwd });`);
    expect(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"), "planning writes nothing").toBe(before);
    expect(plan1.out?.coherent, JSON.stringify(plan1.out)).toBe(true);
    expect(plan1.out?.accounts?.map((a: any) => [a.name, a.status, a.proposedNetwork])).toEqual([
      ["a1", "migrate", "testnet-10"],
      ["a2", "migrate", "testnet-10"]
    ]);
    const applied = await script("asn6-apply", ws, `out = await accounts.applyRealAccountNetworkMigration({ cwd });`);
    expect(applied.out?.written, JSON.stringify(applied.out)).toBe(2);
    expect(storeOf(ws).accounts.map((a: any) => a.network)).toEqual(["testnet-10", "testnet-10"]);
    const plan2 = await script("asn6-plan2", ws, `out = accounts.planRealAccountNetworkMigration({ cwd });`);
    expect(plan2.out?.accounts?.map((a: any) => a.status)).toEqual(["ok", "ok"]);

    // a store with a contradiction is reported and NOT written
    const s = storeOf(ws);
    s.accounts[1].network = "simnet";
    writeStore(ws, s);
    const conflicted = fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8");
    const plan3 = await script("asn6-plan3", ws, `out = accounts.planRealAccountNetworkMigration({ cwd });`);
    expect(plan3.out?.coherent).toBe(false);
    expect(plan3.out?.accounts?.find((a: any) => a.name === "a2")?.status).toBe("conflict");
    const refused = await script("asn6-apply-conflict", ws, `out = await accounts.applyRealAccountNetworkMigration({ cwd });`);
    expect(refused.out?.error?.code, JSON.stringify(refused.out)).toBe("ACCOUNT_NETWORK_CONFLICT");
    expect(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"), "a conflicted store is never written").toBe(conflicted);
  });
});

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

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// -----------------------------------------------------------------------------
// PAYMENT-PREFLIGHT-1 · `hardkas tx send --preflight`, in both modes (a signed artifact; the shortcut that plans, signs and
// sends). Without the flag nothing changes. With it, right before the broadcast the node is asked for every input and
// each signature is verified against the node's UTXO; a refusal sends and records nothing, with its code. A fake
// testnet-10 node on loopback (never a real node, no funds) records every method it is asked; built CLI and SDK, real
// pinned kaspa-wasm, encrypted throwaway accounts.
// -----------------------------------------------------------------------------

type Fake = { url: string; methods: string[]; covenantAt: Set<string>; close(): Promise<void> };
const DAA = 50_000_000;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
let kaspa: any;
let txIdOfReceived: (transaction: unknown) => string;
let guarantee = "";
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

async function startFake(): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const methods: string[] = [];
  const covenantAt = new Set<string>();
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
      methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "pp1", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network: "testnet-10", blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).map((address: string, i: number) => ({
              address,
              outpoint: { transactionId: hashOf(0xf00 + i), index: 0 },
              utxoEntry: { amount: 100_00000000, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false, ...(covenantAt.has(address) ? { covenantId: hashOf(0xc0) } : {}) }
            }))
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, sending: [], receiving: [] })) });
        case "getMempoolEntry":
          return err("transaction not found in mempool");
        case "getVirtualChainFromBlockV2":
        case "getVirtualChainFromBlock":
          return ok({ removedChainBlockHashes: [], addedChainBlockHashes: [], acceptedTransactionIds: [], chainBlockAcceptedTransactions: [] });
        case "submitTransaction":
          return ok({ transactionId: txIdOfReceived(params?.transaction) });
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    methods,
    covenantAt,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

const PW = "pp1-test-password-only";
const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-pp1-cli-netlogs-"));
made.push(logs);

// Asynchronous on purpose: the fake lives in this process, a synchronous spawn would freeze it mid-handshake.
async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log, { HK_PP_PW: PW }) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 200_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  let doc: any;
  for (const chunk of r.stdout.split(/\r?\n(?=[{\[])/)) {
    try {
      const d = JSON.parse(chunk.trim());
      if (d && typeof d === "object" && !Array.isArray(d)) doc = doc ?? d;
    } catch {
      /* not a document */
    }
  }
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { ...r, doc, dialled, brief: `exit ${r.status}\n${r.stdout.slice(0, 2500)}\n${r.stderr.slice(0, 1200)}` };
}

const config = (url: string) =>
  `export default ${JSON.stringify({
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } },
    experimental: true,
    network: { allowPublic: true }
  })};\n`;
const SIMULATOR_CONFIG =
  'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } };\n';

let template: string;
let sdkMod: any;
function workspace(cfg: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-pp1-cli-"));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), cfg);
  return ws;
}
function stored(ws: string, schema: RegExp): any[] {
  const root = path.join(ws, ".hardkas", "artifacts");
  if (!fs.existsSync(root)) return [];
  return (fs.readdirSync(root, { recursive: true }) as string[])
    .map(String)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
      } catch {
        return undefined;
      }
    })
    .filter((a) => a && schema.test(String(a.schema)));
}
const SUBMISSION = /txSubmission/;

/** Plans and signs alice → bob on `ws`'s testnet-10 instance (both stored) and writes the signed artifact to a file. */
async function signedFile(ws: string): Promise<{ file: string; signed: any }> {
  const sdk = await sdkMod.Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
  try {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    const signed = await sdk.tx.sign(plan, { account: "alice", keystorePassword: PW });
    const file = path.join(ws, "signed.json");
    fs.writeFileSync(file, JSON.stringify(signed, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    return { file, signed };
  } finally {
    await sdk.close?.();
  }
}

const fakes: Fake[] = [];
beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  const dist = (pkg: string) => import(pathToFileURL(path.join(repoRoot, "packages", pkg, "dist", "index.js")).href);
  sdkMod = await dist("sdk");
  guarantee = sdkMod.PAYMENT_PREFLIGHT_GUARANTEE;
  txIdOfReceived = (await dist("kaspa-rpc")).officialTxIdOf;
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-pp1-cli-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  fs.writeFileSync(path.join(template, "hardkas.config.ts"), SIMULATOR_CONFIG.replace("};\n", ", network: { allowPublic: false } };\n"));
  for (const name of ["alice", "bob"]) {
    const r = await run(`gen-${name}`, ["accounts", "real", "generate", "--name", name, "--network", "testnet-10", "--password-env", "HK_PP_PW", "--json"], template);
    expect(r.status, r.brief).toBe(0);
  }
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("PAYMENT-PREFLIGHT-1 · hardkas tx send --preflight", () => {
  it("CP-1 a signed payment with --preflight --json: submitted once, the record carries the check; the node was asked for the inputs and its mempool first", async () => {
    const fake = await startFake();
    fakes.push(fake);
    const ws = workspace(config(fake.url));
    const { file, signed } = await signedFile(ws);
    const before = fake.methods.length;
    const r = await run("cp-1", ["tx", "send", file, "--preflight", "--yes", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.doc?.outcome, r.brief).toBe("submitted");
    expect(r.doc?.data?.receipt?.preflight, r.brief).toMatchObject({ inputs: signed.inputs?.length ?? 1, scope: "observer-local", guarantee });
    const asked = fake.methods.slice(before);
    expect(asked.indexOf("getUtxosByAddresses"), asked.join(",")).toBeGreaterThanOrEqual(0);
    expect(asked.indexOf("getMempoolEntriesByAddresses"), asked.join(",")).toBeLessThan(asked.indexOf("submitTransaction"));
    expect(asked.filter((m) => m === "submitTransaction")).toHaveLength(1);
    expect(stored(ws, SUBMISSION).map((s) => s.preflight?.guarantee)).toEqual([guarantee]);
    expect(r.dialled.filter((l) => !/127\.0\.0\.1/.test(l)), r.dialled.join("\n")).toEqual([]);
  });

  it("CP-2 the shortcut (plan, sign, send) with --preflight: the human output says what was checked", async () => {
    const fake = await startFake();
    fakes.push(fake);
    const ws = workspace(config(fake.url));
    const r = await run("cp-2", ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--password-env", "HK_PP_PW", "--yes", "--preflight"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.stdout, r.brief).toMatch(/Preflight/);
    expect(r.stdout, r.brief).toMatch(/signatures verified against its UTXOs/);
    expect(fake.methods.filter((m) => m === "submitTransaction")).toHaveLength(1);
    expect(stored(ws, SUBMISSION).map((s) => s.preflight?.guarantee)).toEqual([guarantee]);
  });

  it("CP-3 the node lists the signed input as a covenant's UTXO by the time it is sent: --preflight refuses (COVENANT_UTXO_NOT_PAYMENT_INPUT), nothing sent or recorded", async () => {
    const fake = await startFake();
    fakes.push(fake);
    const ws = workspace(config(fake.url));
    const { file, signed } = await signedFile(ws);
    fake.covenantAt.add(String(signed.from?.address));
    const r = await run("cp-3", ["tx", "send", file, "--preflight", "--yes", "--json"], ws);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.doc?.code, r.brief).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(r.doc?.message, r.brief).toMatch(/Nothing was sent or recorded/);
    expect(fake.methods).not.toContain("submitTransaction");
    expect(stored(ws, SUBMISSION)).toEqual([]);
  });

  it("CP-4 --preflight on the simulator: refused (SEND_PREFLIGHT_ON_SIMULATOR) before anything is planned or signed", async () => {
    // a scaffold-shaped simulator workspace with its own dev accounts (the template's are testnet-10 accounts)
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-pp1-cli-sim-"));
    made.push(ws);
    fs.mkdirSync(path.join(ws, ".hardkas"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), SIMULATOR_CONFIG);
    const r = await run("cp-4", ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--preflight", "--json"], ws);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.doc?.code, r.brief).toBe("SEND_PREFLIGHT_ON_SIMULATOR");
    expect(stored(ws, /txPlan|signedTx|txReceipt|txSubmission/i)).toEqual([]);
  });
});

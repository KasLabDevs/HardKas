import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, childEnv, repoRoot } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// -----------------------------------------------------------------------------
// NODE-NETWORK-IDENTITY-1 (2026-10-13) · end to end, built CLI + built SDK against a FAKE node on loopback (never a
// real node, no funds): the node claims a network; the workspace declares testnet-10 at that endpoint. Before the fix
// (L1-REALITY-1 E2 V1/V1m, E2b) HardKAS read balances, planned and sent there whatever the node said it was. Now the
// identity is checked before any data is used or anything is sent: the fake records every method it receives, so a
// refusal is proven to have happened BEFORE the data/submit calls.
// -----------------------------------------------------------------------------

type Fake = { url: string; methods: string[]; close(): Promise<void> };

let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

/** claim: the network the node says it is; undefined = getServerInfo without a networkId. Refuses every submit. */
async function startFake(claim: string | undefined, port = 0): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const methods: string[] = [];
  const DAA = 50_000_000;
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
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", ...(claim ? { networkId: claim } : {}), hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "fake", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network: claim ?? "unknown", blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getBalanceByAddress":
          return ok({ balance: 100_00000000 });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: 100_00000000 })) });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).map((address: string, i: number) => ({
              address,
              outpoint: { transactionId: hashOf(0xf00 + i), index: 0 },
              utxoEntry: { amount: 100_00000000, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false }
            }))
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getMempoolEntries":
          return ok({ mempoolEntries: [] });
        case "submitTransaction":
          return err(`Rejected transaction ${hashOf(0xabc)}: fake node never accepts`);
        default:
          return err(`fake node does not implement ${method}`);
      }
    });
  });
  const { port: bound } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${bound}`,
    methods,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

const PW = "nni-test-password-only";
const DATA_METHODS = ["getBalanceByAddress", "getBalancesByAddresses", "getUtxosByAddresses", "getMempoolEntriesByAddresses", "submitTransaction"];

// Asynchronous on purpose: the fake node lives in this process, a synchronous spawn would freeze it mid-handshake.
async function run(args: string[], cwd: string) {
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: childEnv({ HK_NNI_PW: PW }) });
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
  const stdout = r.stdout ?? "";
  let doc: any;
  for (const chunk of stdout.split(/\r?\n(?=[{\[])/)) {
    try {
      const d = JSON.parse(chunk.trim());
      if (d && typeof d === "object" && !Array.isArray(d)) doc = doc ?? d;
    } catch {
      /* not a document */
    }
  }
  return { status: r.status, stdout, stderr: r.stderr ?? "", doc, brief: `exit ${r.status}\n${stdout.slice(0, 1200)}\n${String(r.stderr).slice(0, 800)}` };
}

const config = (url: string) =>
  `export default ${JSON.stringify({
    execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } }
  })};\n`;

let template: string;
const made: string[] = [];
function workspace(url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-nni-"));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), config(url));
  return ws;
}

beforeAll(async () => {
  const core = await import(pathToFileURL(path.join(repoRoot, "packages", "core", "dist", "index.js")).href);
  kaspa = core.loadManagedKaspaWasmSync();
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-nni-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  // keys are generated in a scaffold-shaped workspace (simulator default), as `hardkas init` leaves it; each case then
  // declares testnet-10 at its fake endpoint
  fs.writeFileSync(
    path.join(template, "hardkas.config.ts"),
    'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n'
  );
  for (const name of ["alice", "bob"]) {
    const r = await run(["accounts", "real", "generate", "--name", name, "--network", "testnet-10", "--password-env", "HK_NNI_PW", "--json"], template);
    expect(r.status, r.brief).toBe(0);
  }
});
afterAll(() => {
  for (const ws of made) fs.rmSync(ws, { recursive: true, force: true });
});

describe("NODE-NETWORK-IDENTITY-1 · CLI (built dist) against a loopback fake node", () => {
  it("control: a node that says testnet-10 is used (balance and plan succeed)", async () => {
    const fake = await startFake("testnet-10");
    try {
      const ws = workspace(fake.url);
      const bal = await run(["accounts", "balance", "alice", "--network", "testnet-10", "--json"], ws);
      expect(bal.status, bal.brief).toBe(0);
      const plan = await run(["tx", "plan", "--network", "testnet-10", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], ws);
      expect(plan.status, plan.brief).toBe(0);
      expect(plan.doc?.networkId).toBe("testnet-10");
    } finally {
      await fake.close();
    }
  });

  it("a simnet node presented as testnet-10: accounts balance refuses NODE_NETWORK_MISMATCH, no balance read", async () => {
    const fake = await startFake("simnet");
    try {
      const r = await run(["accounts", "balance", "alice", "--network", "testnet-10", "--json"], workspace(fake.url));
      expect(r.status, r.brief).toBe(1);
      expect(r.doc?.ok, r.brief).toBe(false);
      expect(r.doc?.code, r.brief).toBe("NODE_NETWORK_MISMATCH");
      expect(fake.methods.filter((m) => DATA_METHODS.includes(m)), JSON.stringify(fake.methods)).toEqual([]);
    } finally {
      await fake.close();
    }
  });

  it("a mainnet node presented as testnet-10: tx plan refuses NODE_NETWORK_MISMATCH, no UTXO read, no plan written", async () => {
    const fake = await startFake("mainnet");
    try {
      const ws = workspace(fake.url);
      const r = await run(["tx", "plan", "--network", "testnet-10", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], ws);
      expect(r.status, r.brief).toBe(1);
      expect(r.doc?.code, r.brief).toBe("NODE_NETWORK_MISMATCH");
      expect(fake.methods.filter((m) => DATA_METHODS.includes(m)), JSON.stringify(fake.methods)).toEqual([]);
      const plans = fs.readdirSync(path.join(ws, ".hardkas"), { recursive: true }).map(String).filter((f) => /plan/i.test(f) && f.endsWith(".json"));
      expect(plans).toEqual([]);
    } finally {
      await fake.close();
    }
  });

  it("a node that does not say its network: NODE_NETWORK_UNKNOWN, nothing read", async () => {
    const fake = await startFake(undefined);
    try {
      const r = await run(["tx", "plan", "--network", "testnet-10", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], workspace(fake.url));
      expect(r.status, r.brief).toBe(1);
      expect(r.doc?.code, r.brief).toBe("NODE_NETWORK_UNKNOWN");
      expect(fake.methods.filter((m) => DATA_METHODS.includes(m)), JSON.stringify(fake.methods)).toEqual([]);
    } finally {
      await fake.close();
    }
  });

  it("no node at all: a connection failure, never an identity verdict", async () => {
    const fake = await startFake("testnet-10");
    const url = fake.url;
    await fake.close(); // nothing listens on that port any more
    const r = await run(["accounts", "balance", "alice", "--network", "testnet-10", "--json"], workspace(url));
    expect(r.status, r.brief).toBe(1);
    expect(String(r.doc?.code ?? ""), r.brief).not.toMatch(/^NODE_NETWORK_/);
  });
});

describe("NODE-NETWORK-IDENTITY-1 · SDK (built dist) against a loopback fake node", () => {
  const sdkModule = () => import(pathToFileURL(path.join(repoRoot, "packages", "sdk", "dist", "index.js")).href);

  async function attempt(ws: string, fn: (sdk: any) => Promise<unknown>): Promise<any> {
    const { Hardkas } = await sdkModule();
    let sdk: any;
    try {
      sdk = await Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
      return { value: await fn(sdk) };
    } catch (e) {
      return { error: e };
    } finally {
      await sdk?.close?.();
    }
  }

  it("a simnet node presented as testnet-10: sdk.tx.plan is refused NODE_NETWORK_MISMATCH before any UTXO read", async () => {
    const fake = await startFake("simnet");
    try {
      const r = await attempt(workspace(fake.url), (sdk) => sdk.tx.plan({ from: "alice", to: "bob", amount: "1" }));
      expect(r.error?.code, String(r.error?.message ?? "succeeded")).toBe("NODE_NETWORK_MISMATCH");
      expect(fake.methods.filter((m) => DATA_METHODS.includes(m)), JSON.stringify(fake.methods)).toEqual([]);
    } finally {
      await fake.close();
    }
  });

  it("a signed testnet-10 transaction is never sent to a node that says mainnet (no submitTransaction)", async () => {
    // signed against a node that IS testnet-10 ...
    const good = await startFake("testnet-10");
    const ws = workspace(good.url);
    let signed: any;
    try {
      const r = await attempt(ws, async (sdk) => {
        const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
        return sdk.tx.sign(plan, { account: "alice", keystorePassword: PW });
      });
      expect(r.error, String(r.error?.message)).toBeUndefined();
      signed = r.value;
    } finally {
      await good.close();
    }
    // ... then the same endpoint is served by a node that says mainnet
    // (same port, same config: another node behind the endpoint the transaction was signed for)
    const bad = await startFake("mainnet", Number(new URL(good.url).port));
    try {
      const r = await attempt(ws, (sdk) => sdk.tx.send(signed));
      const seen = JSON.stringify({
        code: r.error?.code,
        message: r.error?.message,
        submitted: r.value?.submitted,
        receipt: r.value?.receipt ? { submitResult: r.value.receipt.submitResult, rpcUrl: r.value.receipt.rpcUrl, txId: r.value.receipt.txId } : undefined,
        fakeMethods: bad.methods
      });
      // first: nothing reached the node; then: the caller is told why, by its code
      expect(bad.methods, seen).not.toContain("submitTransaction");
      expect(r.error?.code, seen).toBe("NODE_NETWORK_MISMATCH");
    } finally {
      await bad.close();
    }
  });
});

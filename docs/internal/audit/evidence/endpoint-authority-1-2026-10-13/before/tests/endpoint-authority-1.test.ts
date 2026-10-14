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
// ENDPOINT-AUTHORITY-1 (2026-10-13) Â· BEFORE on published develop e14138477. Contract under investigation:
//   a receipt or an event never attributes an operation to an endpoint other than the one that received the request.
// Two FAKE nodes on loopback (A and B, never real nodes, no funds), each with its own record of what it received
// (`fake.methods`). Both say they serve testnet-10 and ACCEPT submissions (fakes: nothing is broadcast anywhere), so the
// only thing measured is attribution. Built CLI + built SDK + built testnet-qualification, real pinned kaspa-wasm.
// Each case writes what A and B received and what HardKAS recorded to $HARDKAS_EA_TRACE_DIR (evidence).
// -----------------------------------------------------------------------------

type Fake = { url: string; methods: string[]; close(): Promise<void> };

let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

async function startFake(label: string): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
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
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: label, mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
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
              utxoEntry: { amount: 100_00000000, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false }
            }))
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getMempoolEntry":
          return socket.send(`{"id":${id},"error":{"code":1,"message":"transaction not found in mempool"}}`);
        case "getVirtualChainFromBlockV2":
        case "getVirtualChainFromBlock":
          return ok({ removedChainBlockHashes: [], addedChainBlockHashes: [], acceptedTransactionIds: [], chainBlockAcceptedTransactions: [] });
        case "submitTransaction":
          // the fake answers like a node that accepted the request; nothing leaves this process
          return ok({ transactionId: hashOf(0xa11) });
        default:
          return socket.send(`{"id":${id},"error":{"code":1,"message":"fake ${label} does not implement ${method}"}}`);
      }
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    methods,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

const PW = "ea-test-password-only";
const traceDir = process.env.HARDKAS_EA_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

// Asynchronous on purpose: the fakes live in this process, a synchronous spawn would freeze them mid-handshake.
async function run(args: string[], cwd: string) {
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: childEnv({ HK_EA_PW: PW }) });
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
  return { ...r, doc, brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 800)}` };
}

const testnetConfig = (url: string, extra: Record<string, unknown> = {}) =>
  `export default ${JSON.stringify({
    execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } },
    ...extra
  })};\n`;

let template: string;
const made: string[] = [];
function workspace(config: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ea-"));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), config);
  return ws;
}

const dist = (pkg: string) => import(pathToFileURL(path.join(repoRoot, "packages", pkg, "dist", "index.js")).href);
let sdkMod: any;
let coreMod: any;
let artifactsMod: any;

const ledger = (ws: string): any[] => {
  const file = coreMod.eventLedgerPath(ws);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const got = (f: Fake, m: string) => f.methods.includes(m);
/** The endpoint, among A and B, that received `method` (both, neither, or one). */
const receivers = (a: Fake, b: Fake, m: string) => ({ A: got(a, m), B: got(b, m) });

/** Plans and signs on an instance opened on `url` (testnet-10). Returns the signed artifact. */
async function signedOn(ws: string): Promise<any> {
  const sdk = await sdkMod.Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
  try {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    return await sdk.tx.sign(plan, { account: "alice", keystorePassword: PW });
  } finally {
    await sdk.close?.();
  }
}

beforeAll(async () => {
  // the SAME module instances the SDK uses (a path import would load a second @hardkas/core with its own event bus)
  coreMod = await import("@hardkas/core");
  artifactsMod = await import("@hardkas/artifacts");
  sdkMod = await dist("sdk");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ea-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  // keys generated in a scaffold-shaped workspace (simulator default), as `hardkas init` leaves it
  fs.writeFileSync(
    path.join(template, "hardkas.config.ts"),
    'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n'
  );
  for (const name of ["alice", "bob"]) {
    const r = await run(["accounts", "real", "generate", "--name", name, "--network", "testnet-10", "--password-env", "HK_EA_PW", "--json"], template);
    expect(r.status, r.brief).toBe(0);
  }
});
afterAll(() => {
  for (const ws of made) fs.rmSync(ws, { recursive: true, force: true });
});

describe("ENDPOINT-AUTHORITY-1 Â· SDK send", () => {
  it("EA-1 sdk.tx.send(signed, urlB) on an instance opened on A: the receipt names the endpoint that received the submission", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await sdkMod.Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
      const detach = coreMod.attachLedgerAppender(ws);
      let sent: any;
      try {
        sent = await sdk.tx.send(signed, B.url);
      } finally {
        detach();
        await sdk.close?.();
      }
      const all = ledger(ws);
      const submitted = all.filter((e) => e.kind === "workflow.submitted");
      const seen = {
        ledgerKinds: all.map((e) => e.kind),
        A: A.url,
        B: B.url,
        submitReceivedBy: receivers(A, B, "submitTransaction"),
        receiptRpcUrl: sent?.submission?.rpcUrl ?? null,
        eventRpcUrls: submitted.map((e) => e.payload?.rpcUrl),
        aMethods: A.methods,
        bMethods: B.methods
      };
      trace("EA-1", seen);
      const receiverUrl = got(A, "submitTransaction") ? A.url : got(B, "submitTransaction") ? B.url : null;
      expect(receiverUrl, JSON.stringify(seen)).not.toBeNull();
      // the contract: what is recorded is the endpoint that received the request (or the call is refused)
      expect(seen.receiptRpcUrl, JSON.stringify(seen)).toBe(receiverUrl);
      for (const u of seen.eventRpcUrls) expect(u, JSON.stringify(seen)).toBe(receiverUrl);
    } finally {
      await A.close();
      await B.close();
    }
  });

  it("EA-2 sdk.tx.send(signed) without a URL (default client on A): the receipt and the event name A", async () => {
    const A = await startFake("A");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await sdkMod.Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
      const detach = coreMod.attachLedgerAppender(ws);
      let sent: any;
      try {
        sent = await sdk.tx.send(signed);
      } finally {
        detach();
        await sdk.close?.();
      }
      const submitted = ledger(ws).filter((e) => e.kind === "workflow.submitted");
      const seen = { A: A.url, submitReceivedByA: got(A, "submitTransaction"), receiptRpcUrl: sent?.submission?.rpcUrl ?? null, eventRpcUrls: submitted.map((e) => e.payload?.rpcUrl) };
      trace("EA-2", seen);
      expect(seen.submitReceivedByA, JSON.stringify(seen)).toBe(true);
      expect(seen.receiptRpcUrl, JSON.stringify(seen)).toBe(A.url);
      expect(seen.eventRpcUrls, JSON.stringify(seen)).toEqual([A.url]);
    } finally {
      await A.close();
    }
  });

  it("EA-3 a simulator instance given an explicit URL: nothing is recorded against an endpoint that received nothing", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      // the signed artifact and its plan are in the store of the workspace the simulator instance opens
      const sim = workspace(testnetConfig(A.url));
      const signed = await signedOn(sim);
      fs.writeFileSync(
        path.join(sim, "hardkas.config.ts"),
        'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } };\n'
      );
      // allowPublic so the testnet-10 receipt can be written at all: what is measured is the endpoint attribution
      const sdk = await sdkMod.Hardkas.open({ cwd: sim, network: "simulated", autoBootstrap: true, policy: { allowPublic: true } });
      let outcome: any;
      try {
        outcome = await sdk.tx.send(signed, B.url).then(
          (v: any) => ({ value: { rpcUrl: v?.submission?.rpcUrl ?? v?.receipt?.rpcUrl ?? null, schema: v?.receipt?.schema, accepted: v?.submission?.submitResult?.accepted } }),
          (e: any) => ({ error: { code: e?.code, message: String(e?.message ?? e).slice(0, 300) } })
        );
      } finally {
        await sdk.close?.();
      }
      const seen = { B: B.url, bMethods: B.methods, outcome };
      trace("EA-3", seen);
      // either refused, or the record names an endpoint that actually received the submission (B received nothing)
      if (outcome.value) expect(outcome.value.rpcUrl === B.url && !got(B, "submitTransaction"), JSON.stringify(seen)).toBe(false);
    } finally {
      await A.close();
      await B.close();
    }
  });
});

describe("ENDPOINT-AUTHORITY-1 Â· observation", () => {
  it("EA-4 sdk.tx.observe(txId, { rpcUrl: B }) on an instance on A: the observation names the endpoint it queried", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await sdkMod.Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
      let r: any;
      try {
        r = await sdk.tx.observe(signed.txId, { rpcUrl: B.url, maxBatches: 1 });
      } finally {
        await sdk.close?.();
      }
      const seen = { A: A.url, B: B.url, aMethods: A.methods, bMethods: B.methods, observationRpcUrl: r?.observation?.rpcUrl ?? null };
      trace("EA-4", seen);
      const queried = B.methods.length > 0 ? B.url : A.methods.length > 0 ? A.url : null;
      expect(seen.observationRpcUrl === null || seen.observationRpcUrl === queried, JSON.stringify(seen)).toBe(true);
    } finally {
      await A.close();
      await B.close();
    }
  });

  it("EA-5 the client swapped into sdk.rpc (as the CLI's tx send / consolidate do): the observer identity names the endpoint queried", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await sdkMod.Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
      const rpcMod = await dist("kaspa-rpc");
      const swapped = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: B.url });
      (sdk as any).rpc = swapped;
      let r: any;
      try {
        r = await sdk.tx.observe(signed.txId, { maxBatches: 1 });
      } finally {
        await swapped.close();
        await sdk.close?.();
      }
      const observerOfA = artifactsMod.deriveObserverId({ kind: "rpc", target: "testnet-10", locator: A.url });
      const observerOfB = artifactsMod.deriveObserverId({ kind: "rpc", target: "testnet-10", locator: B.url });
      const seen = { aMethods: A.methods, bMethods: B.methods, observerId: r?.observation?.observer?.observerId ?? null, observerOfA, observerOfB };
      trace("EA-5", seen);
      expect(B.methods.length, JSON.stringify(seen)).toBeGreaterThan(0);
      // the observer identity names the endpoint queried (B), not the configured one (A)
      expect(seen.observerId, JSON.stringify(seen)).toBe(observerOfB);
    } finally {
      await A.close();
      await B.close();
    }
  });
});

describe("ENDPOINT-AUTHORITY-1 Â· CLI tx send (controls)", () => {
  it("EA-6 control: tx send --url B in a workspace declaring A: B receives the submission and the receipt names B; A receives nothing", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const ws = workspace(testnetConfig(A.url, { experimental: true, network: { allowPublic: true } }));
      await signedOn(ws);
      const signedFile = fs.readdirSync(path.join(ws, ".hardkas", "artifacts", "signed")).find((f) => f.startsWith("signedTx-"))!;
      const before = A.methods.length;
      const r = await run(["tx", "send", path.join(ws, ".hardkas", "artifacts", "signed", signedFile), "--url", B.url, "--yes", "--json"], ws);
      const receiptRpcUrl = r.doc?.data?.receipt?.rpcUrl ?? r.doc?.receipt?.rpcUrl ?? null;
      const seen = { exit: r.status, A: A.url, B: B.url, submitReceivedBy: receivers(A, B, "submitTransaction"), aAfterSign: A.methods.slice(before), receiptRpcUrl };
      trace("EA-6", seen);
      expect(r.status, r.brief).toBe(0);
      expect(seen.submitReceivedBy, JSON.stringify(seen)).toEqual({ A: false, B: true });
      expect(receiptRpcUrl, JSON.stringify(seen)).toBe(B.url);
    } finally {
      await A.close();
      await B.close();
    }
  });

  it("EA-7 control: tx send without --url: the configured node A receives it and the receipt names A", async () => {
    const A = await startFake("A");
    try {
      const ws = workspace(testnetConfig(A.url, { experimental: true, network: { allowPublic: true } }));
      await signedOn(ws);
      const signedFile = fs.readdirSync(path.join(ws, ".hardkas", "artifacts", "signed")).find((f) => f.startsWith("signedTx-"))!;
      const r = await run(["tx", "send", path.join(ws, ".hardkas", "artifacts", "signed", signedFile), "--yes", "--json"], ws);
      const receiptRpcUrl = r.doc?.data?.receipt?.rpcUrl ?? r.doc?.receipt?.rpcUrl ?? null;
      const seen = { exit: r.status, A: A.url, submitReceivedByA: got(A, "submitTransaction"), receiptRpcUrl };
      trace("EA-7", seen);
      expect(r.status, r.brief).toBe(0);
      expect(seen.submitReceivedByA).toBe(true);
      expect(receiptRpcUrl, JSON.stringify(seen)).toBe(A.url);
    } finally {
      await A.close();
    }
  });
});

describe("ENDPOINT-AUTHORITY-1 Â· TQ-1 remote node authority", () => {
  it("EA-8 probeRemoteTestnet: the recorded authority endpoint is the endpoint the probe queried", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const tq = await dist("testnet-qualification");
      const rpcMod = await dist("kaspa-rpc");
      // as scripts/testnet-qualification.mjs wires it: the declared endpoint is a descriptor, the calls go to the SDK's client
      const client = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: A.url });
      let authority: any;
      try {
        authority = await tq.probeRemoteTestnet({
          endpoint: { class: "wrpc", address: B.url },
          rpc: {
            getServerInfo: () => client.getServerInfo(),
            getBlockDagInfo: () => client.getBlockDagInfo()
          },
          expectedNetworkId: "testnet-10"
        });
      } catch (e: any) {
        authority = { error: { code: e?.code, message: String(e?.message ?? e).slice(0, 300) } };
      } finally {
        await client.close();
      }
      const seen = { A: A.url, B: B.url, aMethods: A.methods, bMethods: B.methods, authorityEndpoint: authority?.endpoint ?? null, error: authority?.error };
      trace("EA-8", seen);
      const queried = A.methods.length > 0 ? A.url : B.methods.length > 0 ? B.url : null;
      expect(queried, JSON.stringify(seen)).not.toBeNull();
      expect(seen.authorityEndpoint?.address, JSON.stringify(seen)).toBe(queried);
    } finally {
      await A.close();
      await B.close();
    }
  });
});

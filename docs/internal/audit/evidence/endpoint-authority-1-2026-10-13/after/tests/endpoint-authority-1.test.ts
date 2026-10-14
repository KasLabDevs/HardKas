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
// ENDPOINT-AUTHORITY-1 (2026-10-13). A receipt, an event or an observation names only the endpoint of the RPC client
// that carried the operation (EA-I1). An explicit endpoint must be that client's; when the client's endpoint is unknown
// it is refused before anything is sent (EA-I2). A transaction is sent only on the network it was signed for (EA-I3).
// An explicit endpoint never turns a simulated run into an RPC one (EA-I4). Every refusal happens before
// submitTransaction, before any submission is recorded and before any receipt exists (EA-I5).
// Two FAKE nodes on loopback (A and B, never real nodes, no funds), each with its own record of what it received. Both
// say they serve testnet-10 and ACCEPT submissions (fakes: nothing is broadcast anywhere), so only attribution is
// measured. Built CLI + built SDK + built testnet-qualification, real pinned kaspa-wasm. Each case writes what A and B
// received and what HardKAS recorded to $HARDKAS_EA_TRACE_DIR (evidence).
// BEFORE (published e14138477): EA-1..EA-5 and EA-8 reproduced the defect (see the evidence folder).
// -----------------------------------------------------------------------------

type Fake = { url: string; methods: string[]; close(): Promise<void> };

let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

async function startFake(label: string, network = "testnet-10"): Promise<Fake> {
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
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: label, mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network, blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
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

const networkConfig = (network: string, url: string, extra: Record<string, unknown> = {}) =>
  `export default ${JSON.stringify({
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network } } },
    networks: { [network]: { kind: "kaspa-rpc", network, rpcUrl: url } },
    ...extra
  })};\n`;
const testnetConfig = (url: string, extra: Record<string, unknown> = {}) => networkConfig("testnet-10", url, extra);
const SIMULATOR_CONFIG =
  'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } };\n';

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
let rpcMod: any;

const ledger = (ws: string): any[] => {
  const file = coreMod.eventLedgerPath(ws);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
};
/** Artifacts of a schema in the workspace store (a refusal must leave none behind). */
function stored(ws: string, schema: RegExp): string[] {
  const root = path.join(ws, ".hardkas", "artifacts");
  if (!fs.existsSync(root)) return [];
  return (fs.readdirSync(root, { recursive: true }) as string[])
    .map(String)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => {
      try {
        return schema.test(String(JSON.parse(fs.readFileSync(path.join(root, f), "utf8")).schema));
      } catch {
        return false;
      }
    });
}
const SUBMISSION = /txSubmission/;
const OBSERVATION = /txObservation/;
const got = (f: Fake, m: string) => f.methods.includes(m);

async function refusal(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e: any) {
    return { code: e?.code, message: String(e?.message ?? e).slice(0, 400) };
  }
  throw new Error("expected a refusal, the call succeeded");
}

/** Plans and signs on a testnet-10 instance of `ws`. Returns the signed artifact (persisted in that store). */
async function signedOn(ws: string): Promise<any> {
  const sdk = await sdkMod.Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
  try {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    return await sdk.tx.sign(plan, { account: "alice", keystorePassword: PW });
  } finally {
    await sdk.close?.();
  }
}
const openTestnet = (ws: string) => sdkMod.Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });

beforeAll(async () => {
  // the SAME module instances the SDK uses (a path import would load a second @hardkas/core with its own event bus)
  coreMod = await import("@hardkas/core");
  artifactsMod = await import("@hardkas/artifacts");
  sdkMod = await dist("sdk");
  rpcMod = await dist("kaspa-rpc");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ea-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  // keys generated in a scaffold-shaped workspace (simulator default), as `hardkas init` leaves it
  fs.writeFileSync(path.join(template, "hardkas.config.ts"), SIMULATOR_CONFIG.replace("};\n", ", network: { allowPublic: false } };\n"));
  for (const name of ["alice", "bob"]) {
    const r = await run(["accounts", "real", "generate", "--name", name, "--network", "testnet-10", "--password-env", "HK_EA_PW", "--json"], template);
    expect(r.status, r.brief).toBe(0);
  }
});
afterAll(() => {
  for (const ws of made) fs.rmSync(ws, { recursive: true, force: true });
});

describe("ENDPOINT-AUTHORITY-1 · SDK send", () => {
  it("EA-1 sdk.tx.send(signed, urlB) on an instance opened on A: refused SEND_ENDPOINT_MISMATCH before anything is sent or recorded", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const aBefore = A.methods.length;
      const sdk = await openTestnet(ws);
      const detach = coreMod.attachLedgerAppender(ws);
      let r: any;
      try {
        r = await refusal(sdk.tx.send(signed, B.url));
      } finally {
        detach();
        await sdk.close?.();
      }
      const seen = { refusal: r, aAfterOpen: A.methods.slice(aBefore), bMethods: B.methods, submissions: stored(ws, SUBMISSION), events: ledger(ws).map((e) => e.kind) };
      trace("EA-1", seen);
      expect(r.code, JSON.stringify(seen)).toBe("SEND_ENDPOINT_MISMATCH");
      expect(seen.aAfterOpen, JSON.stringify(seen)).toEqual([]);
      expect(seen.bMethods, JSON.stringify(seen)).toEqual([]);
      expect(seen.submissions, JSON.stringify(seen)).toEqual([]);
      expect(seen.events.filter((k) => /workflow\.(submitted|failed)|rpc\.error/.test(k)), JSON.stringify(seen)).toEqual([]);
    } finally {
      await A.close();
      await B.close();
    }
  });

  it("EA-1c control: an explicit URL that IS the client's endpoint (another spelling) is accepted; the receipt and the event name A", async () => {
    const A = await startFake("A");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await openTestnet(ws);
      const detach = coreMod.attachLedgerAppender(ws);
      const sameEndpoint = A.url.replace("ws://", "http://") + "/"; // http(s) is used as ws(s); an empty path is "/"
      let sent: any;
      try {
        sent = await sdk.tx.send(signed, sameEndpoint);
      } finally {
        detach();
        await sdk.close?.();
      }
      const submitted = ledger(ws).filter((e) => e.kind === "workflow.submitted");
      const seen = { sameEndpoint, submitReceivedByA: got(A, "submitTransaction"), receiptRpcUrl: sent?.submission?.rpcUrl, eventRpcUrls: submitted.map((e) => e.payload?.rpcUrl) };
      trace("EA-1c", seen);
      expect(seen.submitReceivedByA).toBe(true);
      expect(seen.receiptRpcUrl, JSON.stringify(seen)).toBe(A.url);
      expect(seen.eventRpcUrls, JSON.stringify(seen)).toEqual([A.url]);
    } finally {
      await A.close();
    }
  });

  it("EA-2 sdk.tx.send(signed) without a URL (default client on A): the receipt and the event name A", async () => {
    const A = await startFake("A");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await openTestnet(ws);
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

  it("EA-2u an injected client that does not say its endpoint: an explicit URL is refused SEND_ENDPOINT_UNVERIFIABLE (nothing sent); without one the receipt names no endpoint", async () => {
    const A = await startFake("A");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const real = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: A.url });
      // a client that works but does not say where it goes (a third-party adapter, a test double)
      const anonymous = new Proxy(real, { get: (t, p) => (p === "url" || p === "getUrl" ? undefined : typeof (t as any)[p] === "function" ? (t as any)[p].bind(t) : (t as any)[p]) });
      const sdk = await openTestnet(ws);
      (sdk as any).rpc = anonymous;
      let r: any;
      let sent: any;
      try {
        r = await refusal(sdk.tx.send(signed, A.url));
        const submitsAfterRefusal = A.methods.filter((m) => m === "submitTransaction").length;
        expect(submitsAfterRefusal).toBe(0);
        expect(stored(ws, SUBMISSION)).toEqual([]);
        sent = await sdk.tx.send(signed);
      } finally {
        await real.close();
        await sdk.close?.();
      }
      const seen = { refusal: r, submitReceivedByA: got(A, "submitTransaction"), receiptRpcUrl: sent?.submission?.rpcUrl ?? null };
      trace("EA-2u", seen);
      expect(r.code, JSON.stringify(seen)).toBe("SEND_ENDPOINT_UNVERIFIABLE");
      expect(seen.submitReceivedByA).toBe(true);
      expect(seen.receiptRpcUrl, JSON.stringify(seen)).toBeNull();
    } finally {
      await A.close();
    }
  });

  it("EA-3 a simulator instance given an explicit URL: refused SEND_ENDPOINT_ON_SIMULATOR; B receives nothing, no receipt", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      // the signed artifact and its plan are in the store of the workspace the simulator instance opens
      const sim = workspace(testnetConfig(A.url));
      const signed = await signedOn(sim);
      fs.writeFileSync(path.join(sim, "hardkas.config.ts"), SIMULATOR_CONFIG);
      const sdk = await sdkMod.Hardkas.open({ cwd: sim, network: "simulated", autoBootstrap: true, policy: { allowPublic: true } });
      let r: any;
      try {
        r = await refusal(sdk.tx.send(signed, B.url));
      } finally {
        await sdk.close?.();
      }
      const seen = { refusal: r, bMethods: B.methods, submissions: stored(sim, SUBMISSION) };
      trace("EA-3", seen);
      expect(r.code, JSON.stringify(seen)).toBe("SEND_ENDPOINT_ON_SIMULATOR");
      expect(seen.bMethods).toEqual([]);
      expect(seen.submissions).toEqual([]);
    } finally {
      await A.close();
      await B.close();
    }
  });

  it("EA-3n a signed artifact of another network: refused SEND_NETWORK_MISMATCH before anything is sent or recorded", async () => {
    const A = await startFake("A");
    const S = await startFake("S", "simnet");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws); // testnet-10
      // the same workspace, now running on simnet (a node that IS simnet): the artifact is not for this network
      fs.writeFileSync(path.join(ws, "hardkas.config.ts"), networkConfig("simnet", S.url));
      const sdk = await sdkMod.Hardkas.open({ cwd: ws, network: "simnet" });
      let r: any;
      try {
        r = await refusal(sdk.tx.send(signed));
      } finally {
        await sdk.close?.();
      }
      const seen = { refusal: r, sMethods: S.methods, submissions: stored(ws, SUBMISSION) };
      trace("EA-3n", seen);
      expect(r.code, JSON.stringify(seen)).toBe("SEND_NETWORK_MISMATCH");
      expect(got(S, "submitTransaction")).toBe(false);
      expect(seen.submissions).toEqual([]);
    } finally {
      await A.close();
      await S.close();
    }
  });
});

describe("ENDPOINT-AUTHORITY-1 · observation", () => {
  it("EA-4 sdk.tx.observe(txId, { rpcUrl: B }) on an instance on A: refused OBSERVE_ENDPOINT_MISMATCH, nobody queried, nothing recorded", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const aBefore = A.methods.length;
      const sdk = await openTestnet(ws);
      let r: any;
      try {
        r = await refusal(sdk.tx.observe(signed.txId, { rpcUrl: B.url, maxBatches: 1 }));
      } finally {
        await sdk.close?.();
      }
      const seen = { refusal: r, aAfterOpen: A.methods.slice(aBefore), bMethods: B.methods, observations: stored(ws, OBSERVATION) };
      trace("EA-4", seen);
      expect(r.code, JSON.stringify(seen)).toBe("OBSERVE_ENDPOINT_MISMATCH");
      expect(seen.aAfterOpen).toEqual([]);
      expect(seen.bMethods).toEqual([]);
      expect(seen.observations).toEqual([]);
    } finally {
      await A.close();
      await B.close();
    }
  });

  it("EA-4c control: observe without a URL names the client's endpoint (A) and A's observer", async () => {
    const A = await startFake("A");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await openTestnet(ws);
      let r: any;
      try {
        r = await sdk.tx.observe(signed.txId, { maxBatches: 1 });
      } finally {
        await sdk.close?.();
      }
      const observerOfA = artifactsMod.deriveObserverId({ kind: "rpc", target: "testnet-10", locator: A.url });
      const seen = { observationRpcUrl: r?.observation?.rpcUrl ?? null, observerId: r?.observation?.observer?.observerId ?? null, observerOfA };
      trace("EA-4c", seen);
      expect(seen.observationRpcUrl, JSON.stringify(seen)).toBe(A.url);
      expect(seen.observerId, JSON.stringify(seen)).toBe(observerOfA);
    } finally {
      await A.close();
    }
  });

  it("EA-5 the client swapped into sdk.rpc (as the CLI's tx send / consolidate do): the observation names B and B's observer", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await openTestnet(ws);
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
      const seen = { bMethods: B.methods, observationRpcUrl: r?.observation?.rpcUrl ?? null, observerId: r?.observation?.observer?.observerId ?? null, observerOfA, observerOfB };
      trace("EA-5", seen);
      expect(B.methods.length, JSON.stringify(seen)).toBeGreaterThan(0);
      expect(seen.observerId, JSON.stringify(seen)).toBe(observerOfB);
      expect(seen.observationRpcUrl, JSON.stringify(seen)).toBe(B.url);
    } finally {
      await A.close();
      await B.close();
    }
  });
});

describe("ENDPOINT-AUTHORITY-1 · CLI tx send (controls)", () => {
  it("EA-6 control: tx send --url B in a workspace declaring A: B receives the submission and the receipt names B; A receives nothing", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const ws = workspace(testnetConfig(A.url, { experimental: true, network: { allowPublic: true } }));
      await signedOn(ws);
      const signedFile = fs.readdirSync(path.join(ws, ".hardkas", "artifacts", "signed")).find((f) => f.startsWith("signedTx-"))!;
      const r = await run(["tx", "send", path.join(ws, ".hardkas", "artifacts", "signed", signedFile), "--url", B.url, "--yes", "--json"], ws);
      const receiptRpcUrl = r.doc?.data?.receipt?.rpcUrl ?? r.doc?.receipt?.rpcUrl ?? null;
      const seen = { exit: r.status, submitReceivedBy: { A: got(A, "submitTransaction"), B: got(B, "submitTransaction") }, receiptRpcUrl };
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
      const seen = { exit: r.status, submitReceivedByA: got(A, "submitTransaction"), receiptRpcUrl };
      trace("EA-7", seen);
      expect(r.status, r.brief).toBe(0);
      expect(seen.submitReceivedByA).toBe(true);
      expect(receiptRpcUrl, JSON.stringify(seen)).toBe(A.url);
    } finally {
      await A.close();
    }
  });
});

describe("ENDPOINT-AUTHORITY-1 · TQ-1 remote node authority", () => {
  const probeWith = async (declared: string, client: any, endpoint: string | undefined) => {
    const tq = await dist("testnet-qualification");
    return tq.probeRemoteTestnet({
      endpoint: { class: "wrpc", address: declared },
      rpc: {
        ...(endpoint !== undefined ? { endpoint } : {}),
        getServerInfo: () => client.getServerInfo(),
        getBlockDagInfo: () => client.getBlockDagInfo()
      },
      expectedNetworkId: "testnet-10"
    });
  };

  it("EA-8 probeRemoteTestnet declaring B while its client talks to A: refused ENDPOINT_MISMATCH before any call", async () => {
    const A = await startFake("A");
    const B = await startFake("B");
    try {
      const client = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: A.url });
      let e: any;
      try {
        await probeWith(B.url, client, client.url);
      } catch (err) {
        e = err;
      } finally {
        await client.close();
      }
      const seen = { reason: e?.reason ?? null, message: String(e?.message ?? "succeeded"), aMethods: A.methods, bMethods: B.methods };
      trace("EA-8", seen);
      expect(seen.reason, JSON.stringify(seen)).toBe("ENDPOINT_MISMATCH");
      expect(seen.aMethods).toEqual([]);
      expect(seen.bMethods).toEqual([]);
    } finally {
      await A.close();
      await B.close();
    }
  });

  it("EA-8u probeRemoteTestnet whose client does not say its endpoint: refused ENDPOINT_UNVERIFIABLE before any call", async () => {
    const A = await startFake("A");
    try {
      const client = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: A.url });
      let e: any;
      try {
        await probeWith(A.url, client, undefined);
      } catch (err) {
        e = err;
      } finally {
        await client.close();
      }
      const seen = { reason: e?.reason ?? null, aMethods: A.methods };
      trace("EA-8u", seen);
      expect(seen.reason, JSON.stringify(seen)).toBe("ENDPOINT_UNVERIFIABLE");
      expect(seen.aMethods).toEqual([]);
    } finally {
      await A.close();
    }
  });

  it("EA-8c control: probeRemoteTestnet declaring the endpoint its client talks to: the authority names A", async () => {
    const A = await startFake("A");
    try {
      const client = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: A.url });
      let authority: any;
      try {
        authority = await probeWith(A.url, client, client.url);
      } finally {
        await client.close();
      }
      const seen = { authorityEndpoint: authority?.endpoint ?? null, aMethods: A.methods };
      trace("EA-8c", seen);
      expect(seen.authorityEndpoint?.address).toBe(A.url);
      expect(A.methods).toContain("getServerInfo");
    } finally {
      await A.close();
    }
  });
});

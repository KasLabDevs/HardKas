import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { Hardkas } from "../src/index.js";
import { loadManagedKaspaWasmSync, isMainnetNetworkId } from "@hardkas/core";
import { signTxPlanArtifact } from "@hardkas/accounts";
import { JsonWrpcKaspaClient, KaspaWrpcClient, KaspaJsonRpcClient } from "@hardkas/kaspa-rpc";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// HARDKAS-MAINNET-PERIMETER-1 (2026-10-17) · B2 (+ the transport half of B1). Base bdfbb9c8c (tree d88c1607).
// Rule under test: no HardKAS path signs for, or broadcasts to, a mainnet-type network — decided by network TYPE
// (mainnet, mainnet-<n>, aliases), from every identity involved (artifact, config key, the network the config entry
// DECLARES, and the node), with the node's identity asked again right before a broadcast and unverifiable identity
// refused. FAKE loopback nodes only; throwaway keys created in memory, funded nowhere.
// -----------------------------------------------------------------------------

type Ident = { server?: (n: number) => string | undefined; dag?: (n: number) => string | undefined };
type Fake = { url: string; methods: string[]; submits: number; close(): Promise<void> };
let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};

async function startFake(ident: Ident): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const fake: Fake = { url: "", methods: [], submits: 0, close: async () => {} };
  let serverCalls = 0;
  let dagCalls = 0;
  const DAA = 50_000_000;
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      fake.methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo": {
          const n = ident.server?.(serverCalls++);
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", ...(n !== undefined ? { networkId: n } : {}), hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        }
        case "getBlockDagInfo": {
          const n = ident.dag?.(dagCalls++);
          return ok({ ...(n !== undefined ? { network: n } : {}), blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
        }
        case "getInfo":
          return ok({ p2pId: "fake", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getBlock":
          return ok({ block: { header: { hash: hashOf(1), version: 1, parentsByLevel: [], hashMerkleRoot: hashOf(0), acceptedIdMerkleRoot: hashOf(0), utxoCommitment: hashOf(0), timestamp: Date.now(), bits: 1, nonce: 0, daaScore: DAA, blueWork: "1", blueScore: DAA, pruningPoint: hashOf(2) }, transactions: [], verboseData: { hash: hashOf(1), difficulty: 1, selectedParentHash: hashOf(0), transactionIds: [], isHeaderOnly: false, blueScore: DAA, childrenHashes: [], mergeSetBluesHashes: [], mergeSetRedsHashes: [], isChainBlock: true } } });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: 100_00000000 })) });
        case "getUtxosByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string, i: number) => ({ address, outpoint: { transactionId: hashOf(0xf00 + i), index: 0 }, utxoEntry: { amount: 100_00000000, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false } })) });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "submitTransaction":
          fake.submits++;
          return ok({ transactionId: hashOf(0xabc) });
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  const { port } = server.address() as AddressInfo;
  fake.url = `ws://127.0.0.1:${port}`;
  fake.close = () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); });
  return fake;
}
const net = (n: string): Ident => ({ server: () => n, dag: () => n });

type Keys = { address: string; env: string };
function throwawayKey(network: string, env: string): Keys {
  const pk = new kaspa.PrivateKey(crypto.randomBytes(32).toString("hex"));
  process.env[env] = pk.toString(); // this test process only; never printed or stored
  return { address: pk.toAddress(network).toString(), env };
}
/** A signer that signs what it is given (hardware wallet, custodian); counts its calls. */
function externalSigner(keys: Keys, network: string) {
  const calls = { n: 0 };
  return {
    calls,
    signer: {
      async getAddress() { return keys.address; },
      async signTransaction(plan: any) {
        calls.n++;
        return signTxPlanArtifact({ target: { mode: "rpc", domain: "kaspa-l1", network }, planArtifact: plan, account: { name: "external", kind: "kaspa", network, address: keys.address, privateKeyEnv: keys.env } as any });
      }
    }
  };
}

const made: string[] = [];
const fakes: Fake[] = [];
async function fake(ident: Ident) { const f = await startFake(ident); fakes.push(f); return f; }
function workspace(key: string, declared: string, url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mp-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: key } } },
    networks: { [key]: { kind: "kaspa-rpc", network: declared, rpcUrl: url } },
    experimental: true,
    network: { allowPublic: true }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  return ws;
}
const stored = (ws: string, schema: RegExp) => {
  const root = path.join(ws, ".hardkas", "artifacts");
  if (!fs.existsSync(root)) return [] as string[];
  return (fs.readdirSync(root, { recursive: true }) as string[]).map(String).filter((f) => f.endsWith(".json")).filter((f) => {
    try { return schema.test(String(JSON.parse(fs.readFileSync(path.join(root, f), "utf8")).schema)); } catch { return false; }
  });
};
async function outcome(p: Promise<unknown>) {
  try { return { ok: true as const, value: await p as any }; } catch (e: any) { return { ok: false as const, code: e?.code as string | undefined, message: String(e?.message ?? e).slice(0, 300) }; }
}
const REFUSAL = /^(MAINNET_(SIGNING|BROADCAST)_DISABLED|NODE_NETWORK_(MISMATCH|UNKNOWN)|NETWORK_IDENTITY_INCOHERENT)$/;

let T: Keys;
let T2: Keys;
let M: Keys;
let signedTestnetPayload: any;

beforeAll(() => {
  kaspa = loadManagedKaspaWasmSync();
  T = throwawayKey("testnet-10", "HK_MP_T");
  T2 = throwawayKey("testnet-10", "HK_MP_T2");
  M = throwawayKey("mainnet", "HK_MP_M");
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
  for (const k of [T, T2, M]) if (k) delete process.env[k.env];
});

/** plan → sign (external, testnet) → send through `sdk`, with an optional injected client. */
async function payTestnet(ws: string, inject?: unknown) {
  const ext = externalSigner(T, "testnet-10");
  const sdk = await Hardkas.open({ cwd: ws, signer: ext.signer as any });
  try {
    if (inject) (sdk as any).rpc = inject;
    const plan: any = await sdk.tx.plan({ from: T.address, to: T2.address, amount: "1" });
    const signed: any = await sdk.tx.sign(plan);
    const sent = await outcome(sdk.tx.send(signed));
    return { signed, sent, submissions: stored(ws, /txSubmission/) };
  } finally {
    await sdk.close();
  }
}

describe("MP-1 one classification by network type", () => {
  it("MP-1 mainnet, mainnet-1, mainnet-7, any case/spacing and the kaspa aliases are mainnet; testnet/devnet/simnet are not (kaspa-wasm agrees where it parses)", () => {
    const yes = ["mainnet", "MAINNET", " Mainnet ", "mainnet-1", "mainnet-7", "kaspa", "kaspa-mainnet", "kaspa-mainnet-7"];
    const no = ["testnet-10", "testnet-12", "devnet", "simnet", "simulated", "prod", "", "mainnetx", "main-net"];
    const wrong = [...yes.filter((id) => !isMainnetNetworkId(id)), ...no.filter((id) => isMainnetNetworkId(id))];
    for (const id of [...yes, ...no]) {
      try {
        const parsed = String(new kaspa.NetworkId(id.trim()).toString()).split("-")[0] === "mainnet";
        if (parsed !== isMainnetNetworkId(id)) wrong.push(`${id} (kaspa-wasm says ${parsed})`);
      } catch {
        /* kaspa-wasm does not parse it */
      }
    }
    expect([...new Set(wrong)]).toEqual([]);
  });
});

describe("MP-2 controls (the perimeter must not break normal use)", () => {
  it("MP-2 testnet-10 workspace, testnet-10 node: plan → sign → send submits exactly once", async () => {
    const F = await fake(net("testnet-10"));
    const ws = workspace("testnet-10", "testnet-10", F.url);
    const r = await payTestnet(ws);
    signedTestnetPayload = JSON.parse(r.signed.signedTransaction.payload);
    expect(r.sent.ok, JSON.stringify(r.sent)).toBe(true);
    expect(F.submits).toBe(1);
  });

  it("MP-2b a raw exported client towards a simnet node (dev tooling): one submit goes through", async () => {
    const F = await fake(net("simnet"));
    const c = new JsonWrpcKaspaClient({ rpcUrl: F.url });
    try {
      const r = await outcome(c.submitTransaction(signedTestnetPayload));
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(F.submits).toBe(1);
    } finally {
      await c.close();
    }
  });
});

describe("MP-3 the identity the config DECLARES, not only the entry's name", () => {
  it("MP-3 control · alias `prod` declaring network mainnet: no signature (the signer is never asked), nothing written", async () => {
    const F = await fake(net("mainnet"));
    const ws = workspace("prod", "mainnet", F.url);
    const ext = externalSigner(M, "prod");
    const sdk = await Hardkas.open({ cwd: ws, signer: ext.signer as any });
    try {
      // A plan for the alias, as any tool can write it (an account on an alias network never plans through the SDK:
      // ACCOUNT_NETWORK_MISMATCH — so the plan is sealed directly). The sign guard must see the declared network.
      const { finalizeTxPlanIdentity, HardkasSchemas: S, HARDKAS_VERSION: V } = await import("@hardkas/artifacts");
      const planArtifact: any = finalizeTxPlanIdentity({
        schema: S.TxPlan,
        hardkasVersion: V,
        version: "1.0.0-alpha",
        createdAt: new Date().toISOString(),
        networkId: "prod",
        mode: "rpc",
        execution: { mode: "rpc", domain: "kaspa-l1", network: "prod" },
        from: { address: M.address },
        to: { address: M.address },
        amountSompi: "100000000",
        inputs: [{ outpoint: { transactionId: hashOf(0xf00), index: 0 }, amountSompi: "10000000000", address: M.address, scriptPublicKey: spkHex(M.address) }],
        outputs: [{ address: M.address, amountSompi: "100000000" }],
        change: { address: M.address, amountSompi: "9899796400" },
        estimatedFeeSompi: "203600",
        estimatedMass: "2036"
      } as any);
      const plan = { ok: true as const, value: planArtifact };
      const signed = await outcome(sdk.tx.sign(plan.value));
      const seen = { plan: "sealed", signed: signed.ok ? "SIGNED" : `${signed.code}: ${signed.message}`, signerCalls: ext.calls.n, signedStored: stored(ws, /signedTx/).length, submits: F.submits };
      expect(seen.signerCalls, JSON.stringify(seen)).toBe(0);
      expect(seen.signedStored, JSON.stringify(seen)).toBe(0);
      // Artifacts carry a CLOSED network enum (no alias): the plan never validates, so the alias fails closed before the
      // guard. The guard also sees the declared network (defense in depth, in the patch).
      expect(signed.ok, JSON.stringify(seen)).toBe(false);
      expect(String(signed.ok ? "" : `${signed.code ?? ""} ${signed.message}`), JSON.stringify(seen)).toMatch(/MAINNET_SIGNING_DISABLED|ARTIFACT_SCHEMA_INVALID/);
    } finally {
      await sdk.close();
    }
  });
});

describe("MP-4 the node's identity, asked right before a broadcast", () => {
  it("MP-4 testnet-10 workspace with an INJECTED client towards a mainnet node: no submitTransaction, no submission", async () => {
    const F = await fake(net("mainnet"));
    const ws = workspace("testnet-10", "testnet-10", F.url);
    const r = await outcome(payTestnet(ws, new JsonWrpcKaspaClient({ rpcUrl: F.url })));
    const seen = { r: r.ok ? { sent: r.value.sent, submissions: r.value.submissions.length } : r, submits: F.submits };
    console.log("MPCODE MP-4", r.ok ? (r.value.sent.ok ? "SENT" : r.value.sent.code) : r.code);
    expect(F.submits, JSON.stringify(seen)).toBe(0);
    if (r.ok) {
      expect(r.value.sent.ok, JSON.stringify(seen)).toBe(false);
      expect(String(r.value.sent.code), JSON.stringify(seen)).toMatch(REFUSAL);
      expect(r.value.submissions, JSON.stringify(seen)).toEqual([]);
    }
  });

  it("MP-5 a node that answers testnet-10 when the connection opens and mainnet afterwards: no submitTransaction", async () => {
    const F = await fake({ server: (n) => (n === 0 ? "testnet-10" : "mainnet"), dag: () => "mainnet" });
    const ws = workspace("testnet-10", "testnet-10", F.url);
    const r = await outcome(payTestnet(ws));
    console.log("MPCODE MP-5", r.ok ? (r.value.sent.ok ? "SENT" : r.value.sent.code) : r.code);
    expect(F.submits, JSON.stringify(r)).toBe(0);
  });

  it("MP-6 the node's two identity answers disagree (getServerInfo testnet-10, getBlockDagInfo mainnet): no submitTransaction", async () => {
    const F = await fake({ server: () => "testnet-10", dag: () => "mainnet" });
    const ws = workspace("testnet-10", "testnet-10", F.url);
    const r = await outcome(payTestnet(ws));
    console.log("MPCODE MP-6", r.ok ? (r.value.sent.ok ? "SENT" : r.value.sent.code) : r.code);
    expect(F.submits, JSON.stringify(r)).toBe(0);
  });
});

describe("MP-7 exported transports cannot be used to broadcast to mainnet or to an unidentified node", () => {
  const clients = {
    JsonWrpcKaspaClient: (url: string) => new JsonWrpcKaspaClient({ rpcUrl: url }),
    KaspaWrpcClient: (url: string) => new KaspaWrpcClient(url),
    KaspaJsonRpcClient: (url: string) => new KaspaJsonRpcClient({ url, retry: { maxRetries: 0 } } as any)
  } as const;
  for (const [name, make] of Object.entries(clients)) {
    for (const [label, ident] of [["mainnet node", net("mainnet")], ["mainnet-1 node", net("mainnet-1")], ["node that names no network", { server: () => undefined, dag: () => undefined }]] as const) {
      it(`MP-7 ${name} · ${label}: refused before submitTransaction`, async () => {
        const F = await fake(ident as Ident);
        const c: any = (make as any)(F.url);
        try {
          if (typeof c.connect === "function") await outcome(c.connect());
          const r = await outcome(c.submitTransaction(signedTestnetPayload));
          const seen = { r, submits: F.submits };
          console.log("MPCODE", name, label, r.ok ? "OK" : r.code);
          expect(F.submits, JSON.stringify(seen)).toBe(0);
          expect(r.ok, JSON.stringify(seen)).toBe(false);
        } finally {
          await outcome(Promise.resolve(typeof c.close === "function" ? c.close() : c.disconnect?.()));
        }
      });
    }
  }
});

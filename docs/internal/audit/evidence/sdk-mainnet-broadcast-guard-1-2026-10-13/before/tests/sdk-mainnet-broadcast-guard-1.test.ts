import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { Hardkas } from "../src/index.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { signTxPlanArtifact } from "@hardkas/accounts";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// SDK-MAINNET-BROADCAST-GUARD-1 (2026-10-13) · BEFORE on published develop e14138477. Policy under test:
//   while HardKAS keeps mainnet transactions disabled, no SDK path signs or broadcasts on mainnet just because
//   `allowPublic` is set, an external signer is given, or tx.send is called directly.
// Reading and planning on mainnet stay allowed; testnet with allowPublic stays allowed.
// FAKE nodes on loopback only (never a real node): each says the network it is told to and REFUSES every
// submitTransaction (it records only that one was attempted). Throwaway keys created in memory, no funds anywhere.
// The run is hermetic (non-loopback connections refused by the gate's preload).
// -----------------------------------------------------------------------------

type Fake = { url: string; methods: string[]; close(): Promise<void> };

let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

async function startFake(network: string): Promise<Fake> {
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
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
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
        case "submitTransaction":
          return err(`Rejected transaction ${hashOf(0xabc)}: fake node never accepts`);
        default:
          return err(`fake does not implement ${method}`);
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

type Keys = { pk: string; address: string; env: string };
function throwawayKey(network: "mainnet" | "testnet-10", env: string): Keys {
  const pk = new kaspa.PrivateKey(crypto.randomBytes(32).toString("hex"));
  process.env[env] = pk.toString(); // this test process only; never printed or stored
  return { pk: pk.toString(), address: pk.toAddress(network).toString(), env };
}

let M: Keys; // mainnet key of the EXTERNAL signer
let M2: Keys; // mainnet receiver
let T: Keys; // testnet-10 key of the EXTERNAL signer
let T2: Keys; // testnet-10 receiver
const made: string[] = [];
const PW = "mg-test-password-only";
let template: string;
const cliDist = path.resolve(__dirname, "../../cli/dist/index.js");

/** The built CLI, asynchronously (the fakes live in this process). */
function cli(args: string[], cwd: string): Promise<{ status: number | null; out: string }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("VITEST") && k !== "NODE_ENV") env[k] = v;
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: { ...env, HK_MG_PW: PW, NO_COLOR: "1" } });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", (status) => resolve({ status, out }));
  });
}

function workspace(network: string, url: string, extra: Record<string, unknown> = {}): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mg-"));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network } } },
    networks: { [network]: { kind: "kaspa-rpc", network, rpcUrl: url } },
    ...extra
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  return ws;
}

/** An external signer (a hardware wallet, a custodian): it signs what it is given. Counts its calls. */
function externalSigner(keys: Keys, network: "mainnet" | "testnet-10") {
  const calls = { n: 0 };
  return {
    calls,
    signer: {
      async getAddress() {
        return keys.address;
      },
      async signTransaction(plan: any) {
        calls.n++;
        return signTxPlanArtifact({
          target: { mode: "rpc", domain: "kaspa-l1", network },
          planArtifact: plan,
          account: { name: "external", kind: "kaspa", network, address: keys.address, privateKeyEnv: keys.env } as any,
          allowMainnet: true
        });
      }
    }
  };
}

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

async function outcome(p: Promise<unknown>): Promise<{ ok: boolean; code?: string; message?: string; value?: any }> {
  try {
    return { ok: true, value: await p };
  } catch (e: any) {
    return { ok: false, code: e?.code, message: String(e?.message ?? e).slice(0, 300) };
  }
}

beforeAll(async () => {
  kaspa = loadManagedKaspaWasmSync();
  M = throwawayKey("mainnet", "HK_MG_MAIN_PK");
  M2 = throwawayKey("mainnet", "HK_MG_MAIN2_PK");
  T = throwawayKey("testnet-10", "HK_MG_TEST_PK");
  T2 = throwawayKey("testnet-10", "HK_MG_TEST2_PK");
  // encrypted keystore accounts for the INTERNAL signer, generated in a scaffold-shaped workspace (simulator default)
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mg-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  fs.writeFileSync(
    path.join(template, "hardkas.config.ts"),
    'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n'
  );
  for (const [name, network] of [["main", "mainnet"], ["test", "testnet-10"]] as const) {
    const r = await cli(["accounts", "real", "generate", "--name", name, "--network", network, "--password-env", "HK_MG_PW", "--json"], template);
    expect(r.status, r.out).toBe(0);
  }
});
afterAll(() => {
  for (const ws of made) fs.rmSync(ws, { recursive: true, force: true });
  for (const k of [M, M2, T, T2]) if (k) delete process.env[k.env];
});

const MAINNET_REFUSAL = /^MAINNET_(SIGNING|BROADCAST|TRANSACTIONS)_DISABLED$/;

describe("SDK-MAINNET-BROADCAST-GUARD-1 · mainnet signing and broadcast are refused (allowPublic does not open them)", () => {
  it("MG-1 internal signer on a mainnet instance (policy.allowPublic): refused with a typed mainnet code, nothing written", async () => {
    const node = await startFake("mainnet");
    try {
      const ws = workspace("mainnet", node.url);
      const sdk = await Hardkas.open({ cwd: ws, network: "mainnet", policy: { allowPublic: true } });
      try {
        const plan: any = await sdk.tx.plan({ from: "main", to: M2.address, amount: "1" });
        const r = await outcome(sdk.tx.sign(plan, { account: "main", keystorePassword: PW }));
        expect(r.ok, JSON.stringify(r)).toBe(false);
        expect(String(r.code), JSON.stringify(r)).toMatch(MAINNET_REFUSAL);
        expect(stored(ws, /signedTx/)).toEqual([]);
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });

  it("MG-2 external signer on a mainnet instance: refused before the external signer is asked, nothing written", async () => {
    const node = await startFake("mainnet");
    try {
      const ws = workspace("mainnet", node.url);
      const ext = externalSigner(M, "mainnet");
      const sdk = await Hardkas.open({ cwd: ws, network: "mainnet", policy: { allowPublic: true }, signer: ext.signer as any });
      try {
        const plan: any = await sdk.tx.plan({ from: M.address, to: M2.address, amount: "1" });
        const r = await outcome(sdk.tx.sign(plan));
        expect({ ok: r.ok, signerCalls: ext.calls.n }, JSON.stringify(r)).toEqual({ ok: false, signerCalls: 0 });
        expect(String(r.code), JSON.stringify(r)).toMatch(MAINNET_REFUSAL);
        expect(stored(ws, /signedTx/)).toEqual([]);
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });

  it("MG-3 tx.send of a mainnet-signed artifact (signed outside HardKAS): refused before submitTransaction, no submission recorded", async () => {
    const node = await startFake("mainnet");
    try {
      const ws = workspace("mainnet", node.url);
      const sdk = await Hardkas.open({ cwd: ws, network: "mainnet", policy: { allowPublic: true } });
      try {
        const plan: any = await sdk.tx.plan({ from: M.address, to: M2.address, amount: "1" });
        await sdk.artifacts.write(plan); // the plan is in the store, as a HardKAS sign would leave it
        const signed = await externalSigner(M, "mainnet").signer.signTransaction(plan); // what any third party can do
        const r = await outcome(sdk.tx.send(signed as any));
        const seen = { r, submitAttempts: node.methods.filter((m) => m === "submitTransaction").length, submissions: stored(ws, /txSubmission/) };
        expect(seen.submitAttempts, JSON.stringify(seen)).toBe(0);
        expect(r.ok, JSON.stringify(seen)).toBe(false);
        expect(String(r.code), JSON.stringify(seen)).toMatch(MAINNET_REFUSAL);
        expect(seen.submissions, JSON.stringify(seen)).toEqual([]);
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });

  it("MG-4 the same through the workspace config (experimental + network.allowPublic, no per-call policy): refused before submitTransaction", async () => {
    const node = await startFake("mainnet");
    try {
      const ws = workspace("mainnet", node.url, { experimental: true, network: { allowPublic: true } });
      const sdk = await Hardkas.open({ cwd: ws, network: "mainnet" });
      try {
        const plan: any = await sdk.tx.plan({ from: M.address, to: M2.address, amount: "1" });
        await sdk.artifacts.write(plan);
        const signed = await externalSigner(M, "mainnet").signer.signTransaction(plan);
        const r = await outcome(sdk.tx.send(signed as any));
        const seen = { r, submitAttempts: node.methods.filter((m) => m === "submitTransaction").length };
        expect(seen.submitAttempts, JSON.stringify(seen)).toBe(0);
        expect(String(r.code), JSON.stringify(seen)).toMatch(MAINNET_REFUSAL);
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });

  it("MG-5 a workflow [tx.plan, tx.send] on a mainnet instance with an external signer: no signature, no submitTransaction", async () => {
    const node = await startFake("mainnet");
    try {
      const ws = workspace("mainnet", node.url);
      const ext = externalSigner(M, "mainnet");
      const sdk = await Hardkas.open({ cwd: ws, network: "mainnet", policy: { allowPublic: true }, signer: ext.signer as any });
      try {
        const run: any = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: M.address, to: M2.address, amount: 1 } as any, { type: "tx.send" } as any] });
        const seen = { status: run.status, code: run.errorEnvelope?.code, signerCalls: ext.calls.n, submitAttempts: node.methods.filter((m) => m === "submitTransaction").length };
        expect(seen.submitAttempts, JSON.stringify(seen)).toBe(0);
        expect(seen.signerCalls, JSON.stringify(seen)).toBe(0);
        expect(seen.status, JSON.stringify(seen)).toBe("failed");
        expect(String(seen.code), JSON.stringify(seen)).toMatch(MAINNET_REFUSAL);
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });

  it.each([
    ["the toolkit's default network", {}],
    ["network: mainnet", { network: "mainnet" }]
  ])("MG-6 sdk.wallet (WalletToolkit) create + send on a mainnet instance with an external signer (%s): no submitTransaction", async (label, opts) => {
    const node = await startFake("mainnet");
    try {
      const ws = workspace("mainnet", node.url);
      const ext = externalSigner(M, "mainnet");
      const sdk = await Hardkas.open({ cwd: ws, network: "mainnet", policy: { allowPublic: true }, signer: ext.signer as any });
      try {
        let wallet: any;
        const opened = await outcome(Promise.resolve().then(() => (wallet = sdk.wallet.open("mg-wallet", opts as any))).then(() => undefined));
        const created = wallet ? await outcome(wallet.create()) : undefined;
        const r = wallet ? await outcome(wallet.send({ to: M2.address, amount: 100_000_000n })) : opened;
        const seen = { label, created, r, signerCalls: ext.calls.n, submitAttempts: node.methods.filter((m) => m === "submitTransaction").length, nodeMethods: [...new Set(node.methods)] };
        // where it stops today is evidence (it is not a mainnet guard): printed for the record
        console.log("MG-6 seen:", JSON.stringify(seen));
        expect(seen.submitAttempts, JSON.stringify(seen)).toBe(0);
        expect(r.ok, JSON.stringify(seen)).toBe(false);
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });
});

describe("SDK-MAINNET-BROADCAST-GUARD-1 · what stays allowed (controls)", () => {
  it("MG-C1 without allowPublic a mainnet instance does not open (PUBLIC_NETWORK_BLOCKED)", async () => {
    const node = await startFake("mainnet");
    try {
      const r = await outcome(Hardkas.open({ cwd: workspace("mainnet", node.url), network: "mainnet" }));
      expect(r.code).toBe("PUBLIC_NETWORK_BLOCKED");
    } finally {
      await node.close();
    }
  });

  it("MG-C2 reading and planning on mainnet stay allowed (allowPublic)", async () => {
    const node = await startFake("mainnet");
    try {
      const ws = workspace("mainnet", node.url);
      const sdk = await Hardkas.open({ cwd: ws, network: "mainnet", policy: { allowPublic: true } });
      try {
        const dag: any = await sdk.rpc.getBlockDagInfo();
        const balance: any = await sdk.rpc.getBalanceByAddress(M.address);
        const plan: any = await sdk.tx.plan({ from: M.address, to: M2.address, amount: "1" });
        expect({ dagNetwork: dag.networkId ?? dag.network, balance: String(balance.balanceSompi), planNetwork: plan.networkId }).toEqual({
          dagNetwork: "mainnet",
          balance: "10000000000",
          planNetwork: "mainnet"
        });
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });

  it("MG-C3 testnet-10 with allowPublic: the internal signer signs and tx.send reaches submitTransaction (the fake refuses it)", async () => {
    const node = await startFake("testnet-10");
    try {
      const ws = workspace("testnet-10", node.url);
      const sdk = await Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true } });
      try {
        const plan: any = await sdk.tx.plan({ from: "test", to: T2.address, amount: "1" });
        const signed: any = await sdk.tx.sign(plan, { account: "test", keystorePassword: PW });
        const sent: any = await sdk.tx.send(signed);
        expect(node.methods).toContain("submitTransaction");
        expect(sent.submission?.networkId).toBe("testnet-10");
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });

  it("MG-C4 testnet-10 with allowPublic and an external signer: it signs and tx.send reaches submitTransaction", async () => {
    const node = await startFake("testnet-10");
    try {
      const ws = workspace("testnet-10", node.url);
      const ext = externalSigner(T, "testnet-10");
      const sdk = await Hardkas.open({ cwd: ws, network: "testnet-10", policy: { allowPublic: true }, signer: ext.signer as any });
      try {
        const plan: any = await sdk.tx.plan({ from: T.address, to: T2.address, amount: "1" });
        const signed: any = await sdk.tx.sign(plan);
        await sdk.tx.send(signed);
        expect(ext.calls.n).toBe(1);
        expect(node.methods).toContain("submitTransaction");
      } finally {
        await sdk.close();
      }
    } finally {
      await node.close();
    }
  });
});
